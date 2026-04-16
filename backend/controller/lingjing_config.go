package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/model"
)

var lingjingConfigKeys = []string{
	"customer_service_enabled",
	"customer_service_wechat",
	"customer_service_qrcode",
	"customer_service_text",
	"site_name",
	"site_description",
}

// GetLingjingConfig 公开接口，前台读取平台配置
func GetLingjingConfig(c *gin.Context) {
	config.OptionMapRWMutex.RLock()
	defer config.OptionMapRWMutex.RUnlock()

	data := make(map[string]interface{})
	for _, key := range lingjingConfigKeys {
		val, ok := config.OptionMap[key]
		if ok {
			// 布尔值转换
			if key == "customer_service_enabled" {
				data[key] = val == "true"
			} else {
				data[key] = val
			}
		} else {
			// 默认值
			switch key {
			case "customer_service_enabled":
				data[key] = false
			case "customer_service_text":
				data[key] = "添加微信，获取帮助"
			case "site_name":
				data[key] = config.SystemName
			default:
				data[key] = ""
			}
		}
	}

	// 注入 One API 全局配置：是否开启邮箱验证（注册页用此判断要不要展示验证码输入）
	data["email_verify_enabled"] = config.EmailVerificationEnabled

	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// UpdateLingjingConfig 管理员接口，批量更新配置
func UpdateLingjingConfig(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	for key, value := range req {
		// 只允许更新白名单内的 key
		allowed := false
		for _, k := range lingjingConfigKeys {
			if k == key {
				allowed = true
				break
			}
		}
		if !allowed {
			continue
		}

		if err := model.UpdateOption(key, value); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "保存失败: " + err.Error()})
			return
		}

		// 同步到内存
		config.OptionMapRWMutex.Lock()
		config.OptionMap[key] = value
		config.OptionMapRWMutex.Unlock()
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "配置已保存"})
}
