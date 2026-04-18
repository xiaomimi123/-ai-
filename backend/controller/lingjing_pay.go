package controller

import (
	crand "crypto/rand"
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"gorm.io/gorm"
)

// errOrderAlreadyPaid 用于 HupijiaoNotify / AdminCompleteOrder 的事务内部
// 当条件 UPDATE 匹配 0 行（订单已被并发处理）时标记为"已处理"，不抛错不回滚新加额度
var errOrderAlreadyPaid = errors.New("order already paid")

// hupijiaoSign 虎皮椒 MD5 签名（官方 v1.1 规则）
// 规则：
//  1. 排除 hash 字段和所有空值参数
//  2. 剩下的 key 按 ASCII 升序
//  3. 按 "k1=v1&k2=v2..." 拼接 URL query 格式（值**不做** URL encode，原样拼）
//  4. 末尾直接拼上 AppSecret（注意：不是 "&key=AppSecret"，是直接 + AppSecret）
//  5. MD5 小写即为 hash
func hupijiaoSign(params map[string]string, secret string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "hash" || v == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	raw := strings.Join(parts, "&") + secret
	sum := md5.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// hupijiaoNonce 生成 nonce_str（32 位十六进制随机串，crypto/rand 不可预测）
func hupijiaoNonce() string {
	b := make([]byte, 16)
	if _, err := crand.Read(b); err != nil {
		// crypto/rand 几乎不会失败；兜底用时间戳至少保证有值
		ts := time.Now().UnixNano()
		for i := range b {
			b[i] = byte(ts >> (i % 8))
		}
	}
	return hex.EncodeToString(b)
}

// randSuffix 返回 n 位随机数字串（crypto/rand，订单号防猜测/冲突用）
func randSuffix(n int) string {
	b := make([]byte, n)
	_, err := crand.Read(b)
	if err != nil {
		// 兜底（几乎不发生）
		nano := time.Now().UnixNano()
		for i := range b {
			b[i] = byte(nano >> (i * 4))
		}
	}
	out := make([]byte, n)
	for i, v := range b {
		out[i] = '0' + v%10
	}
	return string(out)
}

// 虎皮椒下单接口默认网关（若管理员没填就用这个）
const hupijiaoDefaultGateway = "https://api.xunhupay.com"

// httpClientHupijiao 独立 http client，设 10s 超时防挂住支付创建接口
var httpClientHupijiao = &http.Client{Timeout: 10 * time.Second}

// CreatePayOrder 创建支付订单（对接虎皮椒官方 API v1.1）
// 流程：本地创建 pending 订单 → POST 到 {gateway}/payment/do.html →
// 拿 JSON 里的 url 或 url_qrcode 回给前端跳转。
// 一个 appid/appsecret 对应商户配置的单一渠道（微信 or 支付宝），前端传的 pay_type
// 仅用于展示 / 记录，真正的渠道由虎皮椒后台应用决定。
func CreatePayOrder(c *gin.Context) {
	userId := c.GetInt("id")
	var req struct {
		PlanId  int     `json:"plan_id"`
		Amount  float64 `json:"amount"`
		PayType string  `json:"pay_type"` // alipay / wxpay
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if req.PayType != "alipay" && req.PayType != "wxpay" {
		req.PayType = "wxpay"
	}

	var amount float64
	var quota int64
	var orderName string
	var planId int

	if req.PlanId > 0 {
		var plan model.Plan
		if err := model.DB.First(&plan, req.PlanId).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐不存在"})
			return
		}
		amount = plan.Price
		quota = int64(plan.Quota) + int64(plan.BonusQuota)
		orderName = "灵镜AI-" + plan.Name
		planId = plan.Id
	} else if req.Amount >= 1.0 {
		// 临时下调到 ¥1 以便测试支付链路；测试通过后改回 10.0
		// 上限防前端传入异常大的金额污染订单表 / 虎皮椒被拒
		if req.Amount > 100000 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "单笔充值上限 ¥100000，请分多次充值"})
			return
		}
		amount = req.Amount
		quota = int64(amount * 500000)
		orderName = fmt.Sprintf("灵镜AI-充值¥%.0f", amount)
	} else {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "最低充值 ¥1.00"})
		return
	}

	// 按支付类型读对应渠道配置（支付宝和微信在虎皮椒后台是两个独立应用 / AppID）
	gateway, appid, appsecret, enabled := model.GetHupijiaoChannel(req.PayType)
	if !enabled || appid == "" || appsecret == "" {
		channelName := "支付宝"
		if req.PayType == "wxpay" {
			channelName = "微信"
		}
		c.JSON(http.StatusOK, gin.H{"success": false, "message": channelName + "支付未开通，请联系管理员"})
		return
	}
	if gateway == "" {
		gateway = hupijiaoDefaultGateway
	}
	gateway = strings.TrimRight(gateway, "/")

	// 订单号：LJ + unix + userId + 6 位随机数字，crypto/rand 降低同秒并发冲突和可预测性
	orderNo := fmt.Sprintf("LJ%d%d%s", time.Now().Unix(), userId, randSuffix(6))

	order := &model.Order{
		OrderNo:       orderNo,
		UserId:        userId,
		PlanId:        planId,
		Amount:        amount,
		Quota:         quota,
		Status:        0,
		PaymentMethod: req.PayType,
		CreatedAt:     time.Now().Unix(),
	}
	if err := model.DB.Create(order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "创建订单失败"})
		return
	}

	serverAddr := strings.TrimRight(model.GetOptionValue("ServerAddress"), "/")
	if serverAddr == "" {
		serverAddr = "https://aitoken.homes"
	}

	siteName := model.GetOptionValue("site_name")
	if siteName == "" {
		siteName = "灵镜 AI"
	}

	// 虎皮椒下单参数
	params := map[string]string{
		"version":        "1.1",
		"lang":           "zh-cn",
		"appid":          appid,
		"trade_order_id": orderNo,
		"total_fee":      fmt.Sprintf("%.2f", amount),
		"title":          orderName,
		"time":           fmt.Sprintf("%d", time.Now().Unix()),
		"notify_url":     serverAddr + "/api/lingjing/pay/notify/hupijiao",
		"return_url":     serverAddr + "/topup?order=" + orderNo,
		"nonce_str":      hupijiaoNonce(),
		"wap_name":       siteName,
		"wap_url":        serverAddr,
	}
	// 微信支付始终传 type=WAP（虎皮椒 / dpweixin 微信渠道有些版本不接受空 type 会 502；
	// WAP 模式扫码后支付页是 H5，PC 扫码和移动端都兼容）
	if req.PayType == "wxpay" {
		params["type"] = "WAP"
	}
	params["hash"] = hupijiaoSign(params, appsecret)

	// POST form 到虎皮椒
	form := url.Values{}
	for k, v := range params {
		form.Set(k, v)
	}
	// 容错：管理员可能填域名（https://api.xxx.com）或完整接口（https://api.xxx.com/payment/do.html）
	endpoint := gateway
	if !strings.HasSuffix(endpoint, "/payment/do.html") {
		endpoint = endpoint + "/payment/do.html"
	}

	// 排查参数差异时需要的日志：打印本次下单请求（hash 脱敏）
	debugParams := make(map[string]string, len(params))
	for k, v := range params {
		if k == "hash" {
			debugParams[k] = "***"
		} else {
			debugParams[k] = v
		}
	}
	logger.SysLog(fmt.Sprintf("hupijiao create order request: endpoint=%s payType=%s params=%v", endpoint, req.PayType, debugParams))

	// 加 User-Agent，避免某些网关拒绝默认 Go-http-client/1.1
	httpReq, _ := http.NewRequest("POST", endpoint, strings.NewReader(form.Encode()))
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("User-Agent", "lingjing-ai/1.0 (+https://aitoken.homes)")
	resp, err := httpClientHupijiao.Do(httpReq)
	if err != nil {
		logger.SysError("hupijiao create order: POST failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "支付网关请求失败，请稍后重试"})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	bodySnippet := bodyStr
	if len(bodySnippet) > 500 {
		bodySnippet = bodySnippet[:500] + "...(truncated)"
	}

	var apiResp struct {
		OpenId    int             `json:"openid"`
		UrlQrCode string          `json:"url_qrcode"`
		Url       string          `json:"url"`
		ErrCode   json.RawMessage `json:"errcode"` // 虎皮椒 errcode 可能是 int 或 string，用 RawMessage 兼容
		ErrMsg    string          `json:"errmsg"`
		Hash      string          `json:"hash"`
	}
	if err := json.Unmarshal(body, &apiResp); err != nil {
		logger.SysError(fmt.Sprintf("hupijiao create order: parse response failed: %s, httpStatus=%d body=%s", err.Error(), resp.StatusCode, bodyStr))
		// 把原始 body 回传到前端方便排查第三方兼容网关的协议差异
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("支付网关返回异常 (HTTP %d): %s", resp.StatusCode, bodySnippet),
		})
		return
	}

	// errcode 兼容 0 / "0" 两种写法
	errCodeStr := strings.Trim(string(apiResp.ErrCode), `"`)
	if errCodeStr != "" && errCodeStr != "0" {
		logger.SysError(fmt.Sprintf("hupijiao create order: errcode=%s errmsg=%s body=%s", errCodeStr, apiResp.ErrMsg, bodyStr))
		msg := apiResp.ErrMsg
		if msg == "" {
			msg = "支付下单失败"
		}
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "支付下单失败（错误码 " + errCodeStr + "）：" + msg})
		return
	}

	payUrl := apiResp.Url
	if payUrl == "" {
		payUrl = apiResp.UrlQrCode
	}
	if payUrl == "" {
		logger.SysError("hupijiao create order: empty url, body=" + bodyStr)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "支付网关未返回跳转地址：" + bodySnippet})
		return
	}

	logger.SysLog(fmt.Sprintf("hupijiao create order: user=%d order=%s amount=%.2f type=%s", userId, orderNo, amount, req.PayType))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"order_no": orderNo,
			"amount":   amount,
			"quota":    quota,
			"pay_url":  payUrl,
		},
	})
}

// GetUserOrders 用户订单列表
func GetUserOrders(c *gin.Context) {
	userId := c.GetInt("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	var orders []model.Order
	var total int64
	model.DB.Model(&model.Order{}).Where("user_id = ?", userId).Count(&total)
	model.DB.Where("user_id = ?", userId).Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&orders)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": orders, "total": total})
}

// GetPayOrderStatus 查询订单状态
func GetPayOrderStatus(c *gin.Context) {
	userId := c.GetInt("id")
	orderNo := c.Param("orderNo")
	var order model.Order
	if err := model.DB.Where("order_no = ? AND user_id = ?", orderNo, userId).First(&order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "订单不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"order_no": order.OrderNo,
			"status":   order.Status,
			"amount":   order.Amount,
			"quota":    order.Quota,
			"paid_at":  order.PaidAt,
		},
	})
}

// HupijiaoNotify 虎皮椒异步回调（POST form）
// 虎皮椒要求成功响应 body 为纯文本 "success"，非此值会被重试
// 安全关键：必须验 MD5 hash；不验任何人都能 POST 假 notify 刷余额
func HupijiaoNotify(c *gin.Context) {
	// 收集所有参数（form 优先、query 兜底）
	params := map[string]string{}
	for k, v := range c.Request.URL.Query() {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}
	_ = c.Request.ParseForm()
	for k, v := range c.Request.PostForm {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}

	orderNo := params["trade_order_id"]
	tradeNo := params["transaction_id"]
	if tradeNo == "" {
		tradeNo = params["open_order_id"]
	}
	totalFee := params["total_fee"]
	status := params["status"]
	hash := params["hash"]

	// 按订单的 payment_method 选验签 key（支付宝、微信两个渠道的 AppSecret 不一样）
	// 先读订单，再选 key；订单不存在时两套 key 都试一下（兜底历史订单）
	var orderForSign model.Order
	var payType string
	if orderNo != "" {
		if err := model.DB.Select("id", "order_no", "payment_method").Where("order_no = ?", orderNo).First(&orderForSign).Error; err == nil {
			payType = orderForSign.PaymentMethod
		}
	}
	_, _, appsecret, _ := model.GetHupijiaoChannel(payType)
	if appsecret == "" {
		logger.SysError("hupijiao notify: AppSecret not configured for payType=" + payType)
		c.String(http.StatusOK, "fail")
		return
	}

	expected := hupijiaoSign(params, appsecret)
	// 恒时比较防 timing attack（同时用 ToLower 容忍大小写差异）
	if subtle.ConstantTimeCompare([]byte(strings.ToLower(expected)), []byte(strings.ToLower(hash))) != 1 {
		logger.SysError(fmt.Sprintf("hupijiao notify: hash verify failed, order=%s trade=%s amount=%s expect=%s got=%s",
			orderNo, tradeNo, totalFee, expected, hash))
		if orderNo != "" {
			model.DB.Model(&model.Order{}).Where("order_no = ? AND status = 0", orderNo).
				Update("remark", gorm.Expr("CONCAT(IFNULL(remark, ''), ?)",
					fmt.Sprintf(" | [验签失败 %s] trade=%s amount=%s", time.Now().Format("01-02 15:04"), tradeNo, totalFee)))
		}
		c.String(http.StatusOK, "fail")
		return
	}

	logger.SysLog(fmt.Sprintf("hupijiao notify: order=%s status=%s trade=%s amount=%s (sign verified)", orderNo, status, tradeNo, totalFee))

	// 虎皮椒支付成功状态码为 OD
	if status != "OD" {
		c.String(http.StatusOK, "success")
		return
	}

	var order model.Order
	if err := model.DB.Where("order_no = ?", orderNo).First(&order).Error; err != nil {
		logger.SysError("hupijiao notify: order not found: " + orderNo)
		c.String(http.StatusOK, "fail")
		return
	}

	// 金额校验：防恶意篡改 total_fee 参数伪造小额支付换大额订单
	paidAmount, _ := strconv.ParseFloat(totalFee, 64)
	if paidAmount < order.Amount-0.01 {
		logger.SysError(fmt.Sprintf("hupijiao notify: amount mismatch, paid=%.2f expected=%.2f order=%s",
			paidAmount, order.Amount, orderNo))
		c.String(http.StatusOK, "fail")
		return
	}

	// 事务：**条件 UPDATE** 防并发双倍加额度
	// 两个并发 notify 同时进来时，只有第一条能让 UPDATE 影响 1 行；第二条匹配 0 行 → errOrderAlreadyPaid
	// 若订单已被孤儿清理任务误取消（status=2）但虎皮椒才 notify 过来，救回为 status=1 并加额度
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&model.Order{}).
			Where("order_no = ? AND status = 0", orderNo).
			Updates(map[string]interface{}{
				"status":   1,
				"trade_no": tradeNo,
				"paid_at":  time.Now().Unix(),
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			// 0 行：订单当前状态不是 pending，再读一次区分是"已完成（幂等）"还是"被 cleanup 误取消（要救回）"
			var cur model.Order
			if e := tx.Where("order_no = ?", orderNo).First(&cur).Error; e != nil {
				return e
			}
			if cur.Status == 1 {
				// 已完成：幂等返回
				return errOrderAlreadyPaid
			}
			// status=2：cleanup 误杀，虎皮椒确认支付成功 → 救回
			rescue := tx.Model(&model.Order{}).
				Where("order_no = ? AND status = 2", orderNo).
				Updates(map[string]interface{}{
					"status":   1,
					"trade_no": tradeNo,
					"paid_at":  time.Now().Unix(),
					"remark":   gorm.Expr("CONCAT(IFNULL(remark, ''), ?)", " | [晚到回调救回] 虎皮椒 notify 晚于取消超时"),
				})
			if rescue.Error != nil {
				return rescue.Error
			}
			if rescue.RowsAffected == 0 {
				// 并发再次变化（几乎不可能）→ 幂等
				return errOrderAlreadyPaid
			}
			logger.SysLog(fmt.Sprintf("hupijiao notify: rescued cancelled order=%s (cleanup misfire)", orderNo))
		}
		if err := tx.Model(&model.User{}).Where("id = ?", order.UserId).
			Update("quota", gorm.Expr("quota + ?", order.Quota)).Error; err != nil {
			return err
		}
		return nil
	})
	if errors.Is(err, errOrderAlreadyPaid) {
		// 幂等：对虎皮椒返回 success 让它停止重试
		c.String(http.StatusOK, "success")
		return
	}
	if err != nil {
		logger.SysError("hupijiao notify: transaction failed: " + err.Error())
		c.String(http.StatusOK, "fail")
		return
	}

	// 分销佣金（异步）
	go DistributeCommission(order.UserId, order.Amount, order.Id)

	// 站内通知
	model.CreateUserNotification(
		order.UserId,
		"充值成功",
		fmt.Sprintf("¥%.2f 已到账，获得 $%.2f 额度。感谢使用灵镜 AI！", order.Amount, float64(order.Quota)/500000.0),
		"topup_success",
	)

	logger.SysLog(fmt.Sprintf("hupijiao payment success: user=%d order=%s amount=%.2f quota=%d",
		order.UserId, orderNo, order.Amount, order.Quota))
	c.String(http.StatusOK, "success")
}

// AdminManualTopup 管理员手动补单
func AdminManualTopup(c *gin.Context) {
	adminId := c.GetInt("id")
	var req struct {
		UserId int     `json:"user_id" binding:"required"`
		Amount float64 `json:"amount" binding:"required"`
		Remark string  `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误: " + err.Error()})
		return
	}

	// 参数校验：金额必须 > 0（binding:"required" 只防零值，不防负数）
	if req.Amount <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "金额必须大于 0"})
		return
	}
	if req.Amount > 100000 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "单次补单上限 ¥100000，请拆分或联系技术同学"})
		return
	}

	// 校验用户存在
	var user model.User
	if err := model.DB.Select("id", "username").First(&user, req.UserId).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("用户 #%d 不存在", req.UserId)})
		return
	}

	quota := int64(req.Amount * 500000)
	orderNo := fmt.Sprintf("MANUAL%d%d", time.Now().Unix(), req.UserId)
	nowUnix := time.Now().Unix()
	remark := fmt.Sprintf("管理员 #%d 手动补单", adminId)
	if req.Remark != "" {
		remark += "：" + req.Remark
	}

	// 事务原子：创建订单 + 增加用户余额
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&model.Order{
			OrderNo:       orderNo,
			UserId:        req.UserId,
			Amount:        req.Amount,
			Quota:         quota,
			Status:        1,
			PaymentMethod: "manual",
			Remark:        remark,
			PaidAt:        nowUnix,
			CreatedAt:     nowUnix,
		}).Error; err != nil {
			return fmt.Errorf("创建订单失败: %w", err)
		}
		res := tx.Model(&model.User{}).Where("id = ?", req.UserId).
			Update("quota", gorm.Expr("quota + ?", quota))
		if res.Error != nil {
			return fmt.Errorf("加额度失败: %w", res.Error)
		}
		if res.RowsAffected != 1 {
			return fmt.Errorf("用户余额更新影响 %d 行（期望 1）", res.RowsAffected)
		}
		return nil
	})
	if err != nil {
		logger.SysError(fmt.Sprintf("admin manual topup transaction failed: admin=%d user=%d amount=%.2f err=%v", adminId, req.UserId, req.Amount, err))
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	// 异步：站内通知 + 审计日志
	model.CreateUserNotification(
		req.UserId,
		"充值成功",
		fmt.Sprintf("管理员为您手动充值 ¥%.2f（$%.2f 额度）。%s", req.Amount, float64(quota)/500000.0, req.Remark),
		"topup_success",
	)
	logger.SysLog(fmt.Sprintf("admin manual topup success: admin=%d user=%d(%s) amount=%.2f quota=%d order=%s remark=%q",
		adminId, req.UserId, user.Username, req.Amount, quota, orderNo, req.Remark))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("已为用户 %s 补单 ¥%.2f（$%.2f 额度）", user.Username, req.Amount, float64(quota)/500000.0),
	})
}

// GetPayInfo 获取支付方式信息
func GetPayInfo(c *gin.Context) {
	alipayOn := model.IsEpayConfigured()
	wxOn := model.IsHupijiaoWxConfigured()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"alipay_enabled": alipayOn,
			"wxpay_enabled":  wxOn,
			"epay_enabled":   alipayOn || wxOn,
			"methods": []gin.H{
				{"type": "alipay", "name": "支付宝", "enabled": alipayOn},
				{"type": "wxpay", "name": "微信支付", "enabled": wxOn},
			},
		},
	})
}

// ====== 管理员订单管理 ======

// AdminGetOrders 管理员订单列表（支持分页 + 状态/用户筛选）
// GET /api/admin/lingjing/topups?page=1&page_size=20&status=0&username=xxx
func AdminGetOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}
	statusStr := c.Query("status")
	username := c.Query("username")

	q := model.DB.Model(&model.Order{})
	if statusStr != "" {
		if s, err := strconv.Atoi(statusStr); err == nil {
			q = q.Where("status = ?", s)
		}
	}
	if username != "" {
		var userId int
		if err := model.DB.Model(&model.User{}).Select("id").Where("username = ?", username).Scan(&userId).Error; err == nil && userId > 0 {
			q = q.Where("user_id = ?", userId)
		} else {
			// 用户名匹配不到时，返回空但 total=0，防止全表泄漏
			c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0, "page": page, "page_size": pageSize})
			return
		}
	}

	var total int64
	q.Count(&total)

	// 带上用户名 JOIN
	type OrderWithUser struct {
		model.Order
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	var rows []OrderWithUser
	q.Select("orders.*, users.username, users.email").
		Joins("LEFT JOIN users ON users.id = orders.user_id").
		Order("orders.created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Scan(&rows)

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"data":      rows,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// AdminCompleteOrder 管理员手动补单（把 pending 订单标为已支付 + 给用户加额度）
// POST /api/admin/lingjing/topups/complete  body: {"order_no":"xxx", "remark":"可选"}
// 兼容旧前端 body {"trade_no":"xxx"} —— 实际按 order_no 匹配
func AdminCompleteOrder(c *gin.Context) {
	adminId := c.GetInt("id")
	var req struct {
		OrderNo string `json:"order_no"`
		TradeNo string `json:"trade_no"` // 兼容老前端
		Remark  string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	identifier := req.OrderNo
	if identifier == "" {
		identifier = req.TradeNo
	}
	if identifier == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "order_no 或 trade_no 至少填一个"})
		return
	}

	// 先按 order_no 找；找不到再按 trade_no 找（pending 订单 trade_no 可能为空，所以 order_no 优先）
	var order model.Order
	err := model.DB.Where("order_no = ?", identifier).First(&order).Error
	if err != nil {
		err = model.DB.Where("trade_no = ?", identifier).First(&order).Error
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "订单不存在"})
		return
	}

	if order.Status == 1 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "订单已是已支付状态，无需补单"})
		return
	}

	// 事务：**条件 UPDATE** 防并发（管理员误双击 or notify 并行到达都会触发）
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		updates := map[string]interface{}{
			"status":  1,
			"paid_at": time.Now().Unix(),
		}
		if order.TradeNo == "" {
			updates["trade_no"] = fmt.Sprintf("MANUAL-%d-%d", adminId, time.Now().Unix())
		}
		remark := fmt.Sprintf("管理员 #%d 手动补单", adminId)
		if req.Remark != "" {
			remark += "：" + req.Remark
		}
		if order.Remark != "" {
			updates["remark"] = order.Remark + " | " + remark
		} else {
			updates["remark"] = remark
		}
		res := tx.Model(&model.Order{}).
			Where("order_no = ? AND status = 0", order.OrderNo).
			Updates(updates)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errOrderAlreadyPaid
		}
		if err := tx.Model(&model.User{}).Where("id = ?", order.UserId).
			Update("quota", gorm.Expr("quota + ?", order.Quota)).Error; err != nil {
			return err
		}
		return nil
	})
	if errors.Is(err, errOrderAlreadyPaid) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "订单已被处理（并发补单 / 异步回调已到）"})
		return
	}
	if err != nil {
		logger.SysError("manual topup failed: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "补单失败: " + err.Error()})
		return
	}

	// 异步：发佣金 + 站内通知
	go DistributeCommission(order.UserId, order.Amount, order.Id)
	model.CreateUserNotification(
		order.UserId,
		"充值成功",
		fmt.Sprintf("¥%.2f 已到账（管理员手动补单）。", order.Amount),
		"topup_success",
	)

	logger.SysLog(fmt.Sprintf("manual topup: admin=%d order_no=%s user=%d amount=%.2f quota=%d",
		adminId, order.OrderNo, order.UserId, order.Amount, order.Quota))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("补单成功：¥%.2f 已到账给用户 #%d", order.Amount, order.UserId),
	})
}
