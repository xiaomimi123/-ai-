package controller

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-pay/gopay"
	"github.com/go-pay/gopay/alipay"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/payment"
	"gorm.io/gorm"
)

// CreatePayOrder 创建支付订单
func CreatePayOrder(c *gin.Context) {
	userId := c.GetInt("id")
	var req struct {
		PlanId  int     `json:"plan_id"`
		Amount  float64 `json:"amount"`
		PayType string  `json:"pay_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
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
		amount = req.Amount
		quota = int64(amount * 500000)
		orderName = fmt.Sprintf("灵镜AI-充值¥%.0f", amount)
	} else {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "最低充值 ¥1.00"})
		return
	}

	orderNo := fmt.Sprintf("LJ%d%d%04d", time.Now().Unix(), userId, time.Now().Nanosecond()%10000)

	now := time.Now()
	order := &model.Order{
		OrderNo:       orderNo,
		UserId:        userId,
		PlanId:        planId,
		Amount:        amount,
		Quota:         quota,
		Status:        0,
		PaymentMethod: "alipay",
		CreatedAt:     now,
	}
	if err := model.DB.Create(order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "创建订单失败"})
		return
	}

	client, err := payment.GetAlipayClient()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "支付未配置: " + err.Error()})
		return
	}

	bm := make(gopay.BodyMap)
	bm.Set("subject", orderName)
	bm.Set("out_trade_no", orderNo)
	bm.Set("total_amount", fmt.Sprintf("%.2f", amount))
	bm.Set("product_code", "FAST_INSTANT_TRADE_PAY")

	payUrl, err := client.TradePagePay(context.Background(), bm)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "创建支付链接失败: " + err.Error()})
		return
	}

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
		},
	})
}

// AlipayNotify 支付宝异步回调
func AlipayNotify(c *gin.Context) {
	notifyReq, err := alipay.ParseNotifyToBodyMap(c.Request)
	if err != nil {
		logger.SysError("alipay notify parse error: " + err.Error())
		c.String(http.StatusOK, "fail")
		return
	}

	tradeStatus := notifyReq.Get("trade_status")
	outTradeNo := notifyReq.Get("out_trade_no")
	tradeNo := notifyReq.Get("trade_no")
	totalAmount := notifyReq.Get("total_amount")

	logger.SysLog(fmt.Sprintf("alipay notify: order=%s status=%s amount=%s", outTradeNo, tradeStatus, totalAmount))

	if tradeStatus != "TRADE_SUCCESS" && tradeStatus != "TRADE_FINISHED" {
		c.String(http.StatusOK, "success")
		return
	}

	var order model.Order
	if err := model.DB.Where("order_no = ?", outTradeNo).First(&order).Error; err != nil {
		logger.SysError("alipay notify: order not found: " + outTradeNo)
		c.String(http.StatusOK, "fail")
		return
	}

	// 幂等
	if order.Status == 1 {
		c.String(http.StatusOK, "success")
		return
	}

	// 验证金额
	paidAmount, _ := strconv.ParseFloat(totalAmount, 64)
	if paidAmount < order.Amount-0.01 {
		logger.SysError(fmt.Sprintf("alipay notify: amount mismatch, paid=%.2f expected=%.2f", paidAmount, order.Amount))
		c.String(http.StatusOK, "fail")
		return
	}

	// 事务：更新订单 + 增加额度
	now := time.Now()
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&order).Updates(map[string]interface{}{
			"status":   1,
			"trade_no": tradeNo,
			"paid_at":  &now,
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
		logger.SysError("alipay notify: transaction failed: " + err.Error())
		c.String(http.StatusOK, "fail")
		return
	}

	// 异步处理分销佣金
	go DistributeCommission(order.UserId, float64(order.Amount), order.Id)

	logger.SysLog(fmt.Sprintf("alipay payment success: user=%d order=%s amount=%.2f quota=%d", order.UserId, outTradeNo, order.Amount, order.Quota))
	c.String(http.StatusOK, "success")
}

// AdminManualTopup 管理员手动补单
func AdminManualTopup(c *gin.Context) {
	var req struct {
		UserId int     `json:"user_id" binding:"required"`
		Amount float64 `json:"amount" binding:"required"`
		Remark string  `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	quota := int64(req.Amount * 500000)
	orderNo := fmt.Sprintf("MANUAL%d%d", time.Now().Unix(), req.UserId)
	now := time.Now()

	model.DB.Create(&model.Order{
		OrderNo:       orderNo,
		UserId:        req.UserId,
		Amount:        req.Amount,
		Quota:         quota,
		Status:        1,
		PaymentMethod: "manual",
		Remark:        req.Remark,
		PaidAt:        &now,
		CreatedAt:     now,
	})

	model.DB.Model(&model.User{}).Where("id = ?", req.UserId).
		Update("quota", gorm.Expr("quota + ?", quota))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("已补单 ¥%.2f → %d 额度", req.Amount, quota),
	})
}

// GetPayInfo 获取支付方式信息
func GetPayInfo(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"alipay_enabled": payment.IsAlipayConfigured(),
			"methods": []gin.H{
				{"type": "alipay", "name": "支付宝", "enabled": payment.IsAlipayConfigured()},
			},
		},
	})
}
