package controller

import (
	"crypto/md5"
	"fmt"
	"math/rand"
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

// epaySign 生成易支付 MD5 签名
// 规则：去掉 sign / sign_type / 空值 → 按 key ASCII 升序 → k=v&... + key → md5 小写
func epaySign(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "sign" || k == "sign_type" || v == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	raw := strings.Join(parts, "&") + key
	sum := md5.Sum([]byte(raw))
	return fmt.Sprintf("%x", sum)
}

// CreatePayOrder 创建支付订单（易支付协议，兼容虎皮椒）
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
		req.PayType = "alipay"
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
	} else if req.Amount >= 10.0 {
		amount = req.Amount
		quota = int64(amount * 500000)
		orderName = fmt.Sprintf("灵镜AI-充值¥%.0f", amount)
	} else {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "最低充值 ¥10.00"})
		return
	}

	epayUrl, pid, key, enabled := model.GetEpayConfig()
	if !enabled || epayUrl == "" || pid == "" || key == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "支付未配置或未开启"})
		return
	}

	orderNo := fmt.Sprintf("LJ%d%d%04d", time.Now().Unix(), userId, rand.Intn(10000))

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

	params := map[string]string{
		"pid":          pid,
		"type":         req.PayType,
		"out_trade_no": orderNo,
		"notify_url":   serverAddr + "/api/lingjing/pay/notify/epay",
		"return_url":   serverAddr + "/topup?order=" + orderNo,
		"name":         orderName,
		"money":        fmt.Sprintf("%.2f", amount),
	}
	params["sign"] = epaySign(params, key)
	params["sign_type"] = "MD5"

	vals := url.Values{}
	for k, v := range params {
		vals.Set(k, v)
	}
	payUrl := strings.TrimRight(epayUrl, "/") + "/submit.php?" + vals.Encode()

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

// EpayNotify 易支付异步回调（支持 POST form 和 GET query，都可能被用到）
// 安全关键：必须验 MD5 签名；不验直接任何人都能 POST 假 notify 刷余额。
func EpayNotify(c *gin.Context) {
	// 收集所有参数（form 优先、query 回退）
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

	orderNo := params["out_trade_no"]
	tradeNo := params["trade_no"]
	tradeStatus := params["trade_status"]
	totalAmount := params["money"]
	sign := params["sign"]

	_, _, key, _ := model.GetEpayConfig()
	if key == "" {
		logger.SysError("epay notify: EpayKey not configured, rejecting")
		c.String(http.StatusOK, "fail")
		return
	}

	expected := epaySign(params, key)
	if expected != sign {
		logger.SysError(fmt.Sprintf("epay notify: signature verify failed, order=%s trade=%s amount=%s expect=%s got=%s",
			orderNo, tradeNo, totalAmount, expected, sign))
		if orderNo != "" {
			model.DB.Model(&model.Order{}).Where("order_no = ? AND status = 0", orderNo).
				Update("remark", gorm.Expr("CONCAT(IFNULL(remark, ''), ?)",
					fmt.Sprintf(" | [验签失败 %s] trade=%s amount=%s", time.Now().Format("01-02 15:04"), tradeNo, totalAmount)))
		}
		c.String(http.StatusOK, "fail")
		return
	}

	logger.SysLog(fmt.Sprintf("epay notify: order=%s status=%s trade=%s amount=%s (sign verified)", orderNo, tradeStatus, tradeNo, totalAmount))

	if tradeStatus != "TRADE_SUCCESS" {
		c.String(http.StatusOK, "success")
		return
	}

	var order model.Order
	if err := model.DB.Where("order_no = ?", orderNo).First(&order).Error; err != nil {
		logger.SysError("epay notify: order not found: " + orderNo)
		c.String(http.StatusOK, "fail")
		return
	}

	// 幂等
	if order.Status == 1 {
		c.String(http.StatusOK, "success")
		return
	}

	// 金额校验：防恶意篡改 money 参数伪造小额支付换大额订单
	paidAmount, _ := strconv.ParseFloat(totalAmount, 64)
	if paidAmount < order.Amount-0.01 {
		logger.SysError(fmt.Sprintf("epay notify: amount mismatch, paid=%.2f expected=%.2f order=%s",
			paidAmount, order.Amount, orderNo))
		c.String(http.StatusOK, "fail")
		return
	}

	// 事务：更新订单 + 加额度
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&order).Updates(map[string]interface{}{
			"status":   1,
			"trade_no": tradeNo,
			"paid_at":  time.Now().Unix(),
		}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.User{}).Where("id = ?", order.UserId).
			Update("quota", gorm.Expr("quota + ?", order.Quota)).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		logger.SysError("epay notify: transaction failed: " + err.Error())
		c.String(http.StatusOK, "fail")
		return
	}

	// 分销佣金（异步）
	go DistributeCommission(order.UserId, order.Amount, order.Id)

	// 站内通知
	model.CreateUserNotification(
		order.UserId,
		"充值成功",
		fmt.Sprintf("¥%.2f 已到账，获得 %.2f 元额度。感谢使用灵镜 AI！", order.Amount, float64(order.Quota)/500000.0),
		"topup_success",
	)

	logger.SysLog(fmt.Sprintf("epay payment success: user=%d order=%s amount=%.2f quota=%d",
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
		fmt.Sprintf("管理员为您手动充值 ¥%.2f（%.2f 元额度）。%s", req.Amount, float64(quota)/500000.0, req.Remark),
		"topup_success",
	)
	logger.SysLog(fmt.Sprintf("admin manual topup success: admin=%d user=%d(%s) amount=%.2f quota=%d order=%s remark=%q",
		adminId, req.UserId, user.Username, req.Amount, quota, orderNo, req.Remark))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("已为用户 %s 补单 ¥%.2f（%.2f 元额度）", user.Username, req.Amount, float64(quota)/500000.0),
	})
}

// GetPayInfo 获取支付方式信息
func GetPayInfo(c *gin.Context) {
	enabled := model.IsEpayConfigured()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"epay_enabled":   enabled,
			"alipay_enabled": enabled, // 兼容旧前端字段
			"methods": []gin.H{
				{"type": "alipay", "name": "支付宝", "enabled": enabled},
				{"type": "wxpay", "name": "微信支付", "enabled": enabled},
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

	// 事务：更新订单 + 加额度
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
		if err := tx.Model(&order).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.User{}).Where("id = ?", order.UserId).
			Update("quota", gorm.Expr("quota + ?", order.Quota)).Error; err != nil {
			return err
		}
		return nil
	})
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
