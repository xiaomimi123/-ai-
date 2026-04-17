package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

// GetPaymentConfig 管理员读取支付配置（易支付 / 兼容虎皮椒）
func GetPaymentConfig(c *gin.Context) {
	epayUrl := model.GetOptionValue("EpayUrl")
	pid := model.GetOptionValue("EpayPid")
	hasKey := model.GetOptionValue("EpayKey") != ""
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"epay_enabled":        model.GetOptionValue("EpayEnabled") == "true",
			"epay_url":            epayUrl,
			"epay_pid":            pid,
			"epay_key":            "", // 安全：不回传密钥，仅标记是否已配置
			"epay_key_configured": hasKey,
			"redeem_enabled":      model.GetOptionValue("RedeemEnabled") != "false",
		},
	})
}

// UpdatePaymentConfig 管理员保存支付配置
func UpdatePaymentConfig(c *gin.Context) {
	var req struct {
		EpayEnabled   *bool  `json:"epay_enabled"`
		EpayUrl       string `json:"epay_url"`
		EpayPid       string `json:"epay_pid"`
		EpayKey       string `json:"epay_key"` // 空则保持原值
		RedeemEnabled *bool  `json:"redeem_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	if req.EpayEnabled != nil {
		model.SaveOption("EpayEnabled", boolStr(*req.EpayEnabled))
	}
	// 允许清空 url/pid（传空字符串即覆盖）；但 key 的空串视为"不修改"，避免误清空
	model.SaveOption("EpayUrl", req.EpayUrl)
	model.SaveOption("EpayPid", req.EpayPid)
	if req.EpayKey != "" {
		model.SaveOption("EpayKey", req.EpayKey)
	}
	if req.RedeemEnabled != nil {
		model.SaveOption("RedeemEnabled", boolStr(*req.RedeemEnabled))
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "支付配置已保存"})
}

// GetPublicPaymentConfig 前台公开接口
// 同时返回 alipay_enabled 字段做兼容（老前端逻辑判断用它）
func GetPublicPaymentConfig(c *gin.Context) {
	enabled := model.IsEpayConfigured()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"epay_enabled":   enabled,
			"alipay_enabled": enabled,
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
