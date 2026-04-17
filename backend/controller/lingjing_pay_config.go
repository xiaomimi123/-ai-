package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

// GetPaymentConfig 管理员读取支付配置（虎皮椒支付宝渠道 + 微信渠道，两套独立）
func GetPaymentConfig(c *gin.Context) {
	hasAlipayKey := model.GetOptionValue("EpayKey") != ""
	hasWxKey := model.GetOptionValue("EpayWxKey") != ""
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			// 支付宝渠道（沿用 epay_* 字段名，保持和老接口兼容）
			"epay_enabled":        model.GetOptionValue("EpayEnabled") == "true",
			"epay_url":            model.GetOptionValue("EpayUrl"),
			"epay_pid":            model.GetOptionValue("EpayPid"),
			"epay_key":            "", // 不回传密钥
			"epay_key_configured": hasAlipayKey,
			// 微信渠道
			"wx_enabled":        model.GetOptionValue("EpayWxEnabled") == "true",
			"wx_url":            model.GetOptionValue("EpayWxUrl"),
			"wx_pid":            model.GetOptionValue("EpayWxPid"),
			"wx_key":            "",
			"wx_key_configured": hasWxKey,
			// 其它
			"redeem_enabled": model.GetOptionValue("RedeemEnabled") != "false",
		},
	})
}

// UpdatePaymentConfig 管理员保存支付配置
func UpdatePaymentConfig(c *gin.Context) {
	var req struct {
		// 支付宝
		EpayEnabled *bool  `json:"epay_enabled"`
		EpayUrl     string `json:"epay_url"`
		EpayPid     string `json:"epay_pid"`
		EpayKey     string `json:"epay_key"` // 空则保持原值
		// 微信
		WxEnabled *bool  `json:"wx_enabled"`
		WxUrl     string `json:"wx_url"`
		WxPid     string `json:"wx_pid"`
		WxKey     string `json:"wx_key"` // 空则保持原值
		// 其它
		RedeemEnabled *bool `json:"redeem_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	// 支付宝
	if req.EpayEnabled != nil {
		model.SaveOption("EpayEnabled", boolStr(*req.EpayEnabled))
	}
	model.SaveOption("EpayUrl", req.EpayUrl)
	model.SaveOption("EpayPid", req.EpayPid)
	if req.EpayKey != "" {
		model.SaveOption("EpayKey", req.EpayKey)
	}

	// 微信
	if req.WxEnabled != nil {
		model.SaveOption("EpayWxEnabled", boolStr(*req.WxEnabled))
	}
	model.SaveOption("EpayWxUrl", req.WxUrl)
	model.SaveOption("EpayWxPid", req.WxPid)
	if req.WxKey != "" {
		model.SaveOption("EpayWxKey", req.WxKey)
	}

	if req.RedeemEnabled != nil {
		model.SaveOption("RedeemEnabled", boolStr(*req.RedeemEnabled))
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "支付配置已保存"})
}

// GetPublicPaymentConfig 前台公开接口：分别返回支付宝 / 微信是否开通
func GetPublicPaymentConfig(c *gin.Context) {
	alipayOn := model.IsEpayConfigured()
	wxOn := model.IsHupijiaoWxConfigured()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"alipay_enabled": alipayOn,
			"wxpay_enabled":  wxOn,
			"epay_enabled":   alipayOn || wxOn, // 兼容老前端：只要有一个开通就算支付可用
			"redeem_enabled": model.GetOptionValue("RedeemEnabled") != "false",
		},
	})
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
