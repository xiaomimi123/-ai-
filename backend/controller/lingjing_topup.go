package controller

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/shopspring/decimal"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/model"
)

// 从 OptionMap 动态读取支付配置（管理员可在后台随时修改）

func getEpayConfig() (address, id, key string, price float64, minTop int64) {
	config.OptionMapRWMutex.RLock()
	defer config.OptionMapRWMutex.RUnlock()
	address = config.OptionMap["EpayAddress"]
	id = config.OptionMap["EpayId"]
	key = config.OptionMap["EpayKey"]
	price = 7.3
	minTop = 1
	if v, ok := config.OptionMap["EpayPrice"]; ok && v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			price = f
		}
	}
	if v, ok := config.OptionMap["EpayMinTopUp"]; ok && v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			minTop = n
		}
	}
	return
}

// ====== Epay 客户端 ======

func getEpayClient() *epay.Client {
	address, id, key, _, _ := getEpayConfig()
	if address == "" || id == "" || key == "" {
		return nil
	}
	client, err := epay.NewClient(&epay.Config{
		PartnerID: id,
		Key:       key,
	}, address)
	if err != nil {
		return nil
	}
	return client
}

// ====== 订单锁（防止重复回调）======

var orderLocks sync.Map
var createLock sync.Mutex

type refCountedMutex struct {
	mu       sync.Mutex
	refCount int
}

func lockOrder(tradeNo string) {
	createLock.Lock()
	var rcm *refCountedMutex
	if v, ok := orderLocks.Load(tradeNo); ok {
		rcm = v.(*refCountedMutex)
	} else {
		rcm = &refCountedMutex{}
		orderLocks.Store(tradeNo, rcm)
	}
	rcm.refCount++
	createLock.Unlock()
	rcm.mu.Lock()
}

func unlockOrder(tradeNo string) {
	v, ok := orderLocks.Load(tradeNo)
	if !ok {
		return
	}
	rcm := v.(*refCountedMutex)
	rcm.mu.Unlock()
	createLock.Lock()
	rcm.refCount--
	if rcm.refCount == 0 {
		orderLocks.Delete(tradeNo)
	}
	createLock.Unlock()
}

// ====== API: 获取支付信息 ======

func GetTopUpInfo(c *gin.Context) {
	address, id, key, price, minTop := getEpayConfig()
	epayEnabled := address != "" && id != "" && key != ""

	payMethods := []map[string]string{}
	if epayEnabled {
		payMethods = append(payMethods,
			map[string]string{"name": "支付宝", "type": "alipay"},
			map[string]string{"name": "微信支付", "type": "wxpay"},
		)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"enable_online_topup": epayEnabled,
			"pay_methods":         payMethods,
			"min_topup":           minTop,
			"price":               price,
		},
	})
}

// ====== API: 创建支付订单 ======

type TopUpRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
}

func RequestEpayPayment(c *gin.Context) {
	var req TopUpRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	_, _, _, price, minTop := getEpayConfig()

	if req.Amount < minTop {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("最低充值 $%d", minTop)})
		return
	}

	userId := c.GetInt("id")

	// 计算支付金额（USD -> CNY）
	dAmount := decimal.NewFromInt(req.Amount)
	dPrice := decimal.NewFromFloat(price)
	payMoney := dAmount.Mul(dPrice).InexactFloat64()

	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "支付金额过低"})
		return
	}

	client := getEpayClient()
	if client == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "支付未配置"})
		return
	}

	// 生成订单号
	tradeNo := fmt.Sprintf("LJ%dT%d%s", userId, time.Now().Unix(), strconv.Itoa(int(time.Now().UnixMilli()%1000)))

	callbackBase := config.ServerAddress
	returnUrl, _ := url.Parse(callbackBase + "/topup")
	notifyUrl, _ := url.Parse(callbackBase + "/api/lingjing/epay/notify")

	uri, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           req.PaymentMethod,
		ServiceTradeNo: tradeNo,
		Name:           fmt.Sprintf("灵镜AI充值$%d", req.Amount),
		Money:          strconv.FormatFloat(payMoney, 'f', 2, 64),
		Device:         epay.PC,
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		log.Printf("epay purchase error: %v", err)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "拉起支付失败"})
		return
	}

	// 创建充值记录
	topUp := &model.TopUp{
		UserId:        userId,
		Amount:        req.Amount,
		Money:         payMoney,
		TradeNo:       tradeNo,
		PaymentMethod: req.PaymentMethod,
		CreateTime:    time.Now().Unix(),
		Status:        model.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "创建订单失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": params, "url": uri})
}

// ====== API: 支付回调 ======

func EpayNotify(c *gin.Context) {
	var params map[string]string

	if c.Request.Method == "POST" {
		if err := c.Request.ParseForm(); err != nil {
			log.Println("epay notify parse error:", err)
			c.Writer.Write([]byte("fail"))
			return
		}
		params = lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.PostForm.Get(t)
			return r
		}, map[string]string{})
	} else {
		params = lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.URL.Query().Get(t)
			return r
		}, map[string]string{})
	}

	if len(params) == 0 {
		c.Writer.Write([]byte("fail"))
		return
	}

	client := getEpayClient()
	if client == nil {
		c.Writer.Write([]byte("fail"))
		return
	}

	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		log.Println("epay verify failed:", err)
		c.Writer.Write([]byte("fail"))
		return
	}

	// 验签成功，先响应
	c.Writer.Write([]byte("success"))

	if verifyInfo.TradeStatus == epay.StatusTradeSuccess {
		lockOrder(verifyInfo.ServiceTradeNo)
		defer unlockOrder(verifyInfo.ServiceTradeNo)

		topUp := model.GetTopUpByTradeNo(verifyInfo.ServiceTradeNo)
		if topUp == nil {
			log.Printf("epay notify: order not found: %s", verifyInfo.ServiceTradeNo)
			return
		}

		if topUp.Status == model.TopUpStatusPending {
			// 计算额度
			dAmount := decimal.NewFromInt(topUp.Amount)
			dQuotaPerUnit := decimal.NewFromFloat(config.QuotaPerUnit)
			quotaToAdd := int(dAmount.Mul(dQuotaPerUnit).IntPart())

			if err := model.EpayRecharge(topUp.TradeNo, quotaToAdd); err != nil {
				log.Printf("epay recharge failed: %v", err)
			} else {
				log.Printf("epay recharge success: user=%d quota=%d money=%.2f", topUp.UserId, quotaToAdd, topUp.Money)
				// 分发邀请人佣金
				DistributeCommission(topUp.UserId, float64(topUp.Amount), topUp.Id)
			}
		}
	}
}

// ====== API: 查询金额 ======

func RequestPayAmount(c *gin.Context) {
	var req struct {
		Amount int64 `json:"amount"`
	}
	_, _, _, price, minTop := getEpayConfig()
	if err := c.ShouldBindJSON(&req); err != nil || req.Amount < minTop {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("最低充值 $%d", minTop)})
		return
	}

	dAmount := decimal.NewFromInt(req.Amount)
	dPrice := decimal.NewFromFloat(price)
	payMoney := dAmount.Mul(dPrice).StringFixed(2)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": payMoney})
}

// ====== API: 用户充值记录 ======

func GetUserTopUpList(c *gin.Context) {
	userId := c.GetInt("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}

	topups, total, err := model.GetUserTopUps(userId, page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": topups, "total": total})
}

// ====== API: 管理员 - 全部充值记录 ======

func AdminGetAllTopUps(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}

	topups, total, err := model.GetAllTopUps(page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": topups, "total": total})
}

// ====== API: 管理员 - 手动补单 ======

func AdminManualTopUp(c *gin.Context) {
	var req struct {
		TradeNo string `json:"trade_no"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.TradeNo == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请提供订单号"})
		return
	}

	lockOrder(req.TradeNo)
	defer unlockOrder(req.TradeNo)

	if err := model.ManualCompleteTopUp(req.TradeNo); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "补单成功"})
}
