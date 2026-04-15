package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/payment"
)

func GetPaymentConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"alipay_enabled":     model.GetOptionValue("AlipayEnabled") == "true",
			"alipay_app_id":      model.GetOptionValue("AlipayAppID"),
			"alipay_private_key": maskSecret(model.GetOptionValue("AlipayPrivateKey")),
			"alipay_public_key":  maskSecret(model.GetOptionValue("AlipayPublicKey")),
			"redeem_enabled":     model.GetOptionValue("RedeemEnabled") != "false",
		},
	})
}

func UpdatePaymentConfig(c *gin.Context) {
	var req struct {
		AlipayEnabled    *bool  `json:"alipay_enabled"`
		AlipayAppID      string `json:"alipay_app_id"`
		AlipayPrivateKey string `json:"alipay_private_key"`
		AlipayPublicKey  string `json:"alipay_public_key"`
		RedeemEnabled    *bool  `json:"redeem_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	if req.AlipayEnabled != nil {
		model.SaveOption("AlipayEnabled", boolStr(*req.AlipayEnabled))
		payment.ResetAlipayClient()
	}
	if req.AlipayAppID != "" {
		model.SaveOption("AlipayAppID", req.AlipayAppID)
		payment.ResetAlipayClient()
	}
	if req.AlipayPrivateKey != "" && !ismasked(req.AlipayPrivateKey) {
		model.SaveOption("AlipayPrivateKey", req.AlipayPrivateKey)
		payment.ResetAlipayClient()
	}
	if req.AlipayPublicKey != "" && !ismasked(req.AlipayPublicKey) {
		model.SaveOption("AlipayPublicKey", req.AlipayPublicKey)
		payment.ResetAlipayClient()
	}
	if req.RedeemEnabled != nil {
		model.SaveOption("RedeemEnabled", boolStr(*req.RedeemEnabled))
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "支付配置已保存"})
}

func GetPublicPaymentConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"alipay_enabled": model.GetOptionValue("AlipayEnabled") == "true",
			"redeem_enabled": model.GetOptionValue("RedeemEnabled") != "false",
		},
	})
}

func maskSecret(s string) string {
	if len(s) <= 10 {
		if s == "" {
			return ""
		}
		return "******"
	}
	return s[:10] + "******"
}

func ismasked(s string) bool {
	return len(s) > 6 && s[len(s)-6:] == "******"
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
