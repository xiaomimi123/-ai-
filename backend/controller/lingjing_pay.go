package controller

import (
	crand "crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/payment"
	_ "github.com/songquanpeng/one-api/payment/hupijiao" // 注册 hupijiao provider（init 中 payment.Register）
	"gorm.io/gorm"
)

// errOrderAlreadyPaid 用于 PayNotify / AdminCompleteOrder 的事务内部
// 当条件 UPDATE 匹配 0 行（订单已被并发处理）时标记为"已处理"，不抛错不回滚新加额度
var errOrderAlreadyPaid = errors.New("order already paid")

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

// providerName 当前唯一内置的支付渠道标识。后续新增渠道时，
// 这里可以改为按管理员配置或按 pay_type 动态选择。
const providerName = "hupijiao"

// CreatePayOrder 创建支付订单
// 流程：本地创建 pending 订单 → 委托 Provider.CreatePayment 向支付平台下单 →
// 拿到跳转地址回给前端。
// provider 特有的下单请求（构造参数、签名、HTTP 调用、解析响应）已迁入
// payment/hupijiao；这里只负责订单业务逻辑（幂等前置校验、金额/套餐换算、建单）。
func CreatePayOrder(c *gin.Context) {
	userId := c.GetInt("id")

	// audit + 防御：拒绝同名 session_v2 cookie 多份的请求（cookie 串号事故的兜底防护）
	sessionCookieCount := 0
	for _, ck := range c.Request.Cookies() {
		if ck.Name == "session_v2" {
			sessionCookieCount++
		}
	}
	logger.SysLogf("[CreatePayOrder] audit: user_id=%d session_cookie_count=%d ip=%s ua=%q",
		userId, sessionCookieCount, c.ClientIP(), c.GetHeader("User-Agent"))
	if sessionCookieCount > 1 {
		logger.SysLogf("[CreatePayOrder] REJECT: multiple session_v2 cookies user_id=%d cookie=%q",
			userId, c.GetHeader("Cookie"))
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "登录状态异常，请清除浏览器 Cookie 后重新登录"})
		return
	}

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
		orderName = config.SystemName + "-" + plan.Name
		planId = plan.Id
	} else if req.Amount >= 10.0 {
		// 上限防前端传入异常大的金额污染订单表 / 虎皮椒被拒
		if req.Amount > 100000 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "单笔充值上限 ¥100000，请分多次充值"})
			return
		}
		amount = req.Amount
		quota = int64(amount * 500000)
		orderName = fmt.Sprintf("%s-充值¥%.0f", config.SystemName, amount)
	} else {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "最低充值 ¥10.00"})
		return
	}

	p, ok := payment.Get(providerName)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "支付渠道未配置"})
		return
	}
	if !p.Configured(req.PayType) {
		channelName := "支付宝"
		if req.PayType == "wxpay" {
			channelName = "微信"
		}
		c.JSON(http.StatusOK, gin.H{"success": false, "message": channelName + "支付未开通，请联系管理员"})
		return
	}

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
		serverAddr = strings.TrimRight(config.ServerAddress, "/")
	}
	// notify_url 走独立域名直连（绕开 CF，避免 WAF/缓冲拦截支付回调）
	// 未配置 ApiServerAddress 时降级到 ServerAddress，向后兼容
	apiAddr := strings.TrimRight(model.GetOptionValue("ApiServerAddress"), "/")
	if apiAddr == "" {
		apiAddr = serverAddr
	}

	payUrl, err := p.CreatePayment(payment.CreateRequest{
		OrderNo:   orderNo,
		Amount:    amount,
		OrderName: orderName,
		PayType:   req.PayType,
		NotifyURL: apiAddr + "/api/lingjing/pay/notify/" + p.Name(),
		ReturnURL: serverAddr + "/topup?order=" + orderNo,
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	logger.SysLog(fmt.Sprintf("create pay order: user=%d order=%s amount=%.2f type=%s provider=%s", userId, orderNo, amount, req.PayType, p.Name()))

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

// PayNotify 处理支付回调。provider 特有的解析与验签委托给 Provider 实现，
// 订单幂等、金额校验、加余额、佣金、通知统一在此处理——
// 这样新增支付渠道时不可能绕过这些校验。
// 安全关键：VerifyNotify 内部必须验签；不验任何人都能 POST 假 notify 刷余额
func PayNotify(c *gin.Context) {
	name := c.Param("provider")
	if name == "" {
		name = providerName // 旧路径 /notify/hupijiao 兼容（理论上不会走到，因为通配路由必匹配 :provider）
	}
	p, ok := payment.Get(name)
	if !ok {
		logger.SysError("pay notify: unknown provider " + name)
		c.String(http.StatusOK, "fail")
		return
	}

	res, err := p.VerifyNotify(c)
	if err != nil {
		logger.SysError("pay notify: verify failed provider=" + name + " err=" + err.Error())
		c.String(http.StatusOK, p.FailResponse())
		return
	}

	// 非成功终态：回 success 让平台停止重推，但不动订单
	if !res.Paid {
		c.String(http.StatusOK, p.SuccessResponse())
		return
	}

	orderNo := res.OrderNo
	tradeNo := res.TradeNo
	paidAmount := res.PaidAmount

	var order model.Order
	if err := model.DB.Where("order_no = ?", orderNo).First(&order).Error; err != nil {
		logger.SysError("pay notify: order not found: " + orderNo)
		c.String(http.StatusOK, p.FailResponse())
		return
	}

	// 金额校验：防恶意篡改 total_fee 参数伪造小额支付换大额订单
	if paidAmount < order.Amount-0.01 {
		logger.SysError(fmt.Sprintf("pay notify: amount mismatch, paid=%.2f expected=%.2f order=%s",
			paidAmount, order.Amount, orderNo))
		c.String(http.StatusOK, p.FailResponse())
		return
	}

	// 事务：**条件 UPDATE** 防并发双倍加额度
	// 两个并发 notify 同时进来时，只有第一条能让 UPDATE 影响 1 行；第二条匹配 0 行 → errOrderAlreadyPaid
	// 若订单已被孤儿清理任务误取消（status=2）但支付平台才 notify 过来，救回为 status=1 并加额度
	err = model.DB.Transaction(func(tx *gorm.DB) error {
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
			// status=2：cleanup 误杀，支付平台确认支付成功 → 救回
			rescue := tx.Model(&model.Order{}).
				Where("order_no = ? AND status = 2", orderNo).
				Updates(map[string]interface{}{
					"status":   1,
					"trade_no": tradeNo,
					"paid_at":  time.Now().Unix(),
					"remark":   gorm.Expr("CONCAT(IFNULL(remark, ''), ?)", " | [晚到回调救回] notify 晚于取消超时"),
				})
			if rescue.Error != nil {
				return rescue.Error
			}
			if rescue.RowsAffected == 0 {
				// 并发再次变化（几乎不可能）→ 幂等
				return errOrderAlreadyPaid
			}
			logger.SysLog(fmt.Sprintf("pay notify: rescued cancelled order=%s (cleanup misfire)", orderNo))
		}
		if err := tx.Model(&model.User{}).Where("id = ?", order.UserId).
			Update("quota", gorm.Expr("quota + ?", order.Quota)).Error; err != nil {
			return err
		}
		return nil
	})
	if errors.Is(err, errOrderAlreadyPaid) {
		// 幂等：对支付平台返回 success 让它停止重试
		c.String(http.StatusOK, p.SuccessResponse())
		return
	}
	if err != nil {
		logger.SysError("pay notify: transaction failed: " + err.Error())
		c.String(http.StatusOK, p.FailResponse())
		return
	}

	// 分销佣金（异步）
	go DistributeCommission(order.UserId, order.Amount, order.Id)

	// 站内通知
	model.CreateUserNotification(
		order.UserId,
		"充值成功",
		fmt.Sprintf("¥%.2f 已到账，获得 $%.2f 额度。感谢使用 %s！", order.Amount, float64(order.Quota)/500000.0, config.SystemName),
		"topup_success",
	)

	logger.SysLog(fmt.Sprintf("pay notify: payment success: user=%d order=%s amount=%.2f quota=%d provider=%s",
		order.UserId, orderNo, order.Amount, order.Quota, name))
	c.String(http.StatusOK, p.SuccessResponse())
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
