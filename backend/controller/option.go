package controller

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/i18n"
	"github.com/songquanpeng/one-api/model"

	"github.com/gin-gonic/gin"
)

// OptionSavedSentinel 给前端的"已配置但不返回真值"标记
// 前端识别此值后：
//   1. input 显示空但 placeholder 提示「已配置」
//   2. 保存时若 input 仍为空，跳过下发（不下发 = 保留原 secret 值不被误清）
//   3. 用户输了新值 → 正常下发覆盖
const OptionSavedSentinel = "$$SAVED$$"

func GetOptions(c *gin.Context) {
	var options []*model.Option
	config.OptionMapRWMutex.Lock()
	for k, v := range config.OptionMap {
		valStr := helper.Interface2String(v)
		// secret 字段（Token/Secret 后缀）不返回真值，只用 sentinel 告诉前端是否已配置
		// 这样既不暴露密码到 admin 页面源码，又解决"刷新后输入框空 → 用户以为没保存"的 UX 问题
		if strings.HasSuffix(k, "Token") || strings.HasSuffix(k, "Secret") {
			if valStr != "" {
				valStr = OptionSavedSentinel
			}
		}
		options = append(options, &model.Option{
			Key:   k,
			Value: valStr,
		})
	}
	config.OptionMapRWMutex.Unlock()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    options,
	})
	return
}

func UpdateOption(c *gin.Context) {
	var option model.Option
	err := json.NewDecoder(c.Request.Body).Decode(&option)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": i18n.Translate(c, "invalid_parameter"),
		})
		return
	}
	// 防御：若前端误把 GetOptions 返回的 sentinel 原样回传，视为"不修改"，直接成功返回
	if option.Value == OptionSavedSentinel {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
		return
	}
	switch option.Key {
	case "Theme":
		if !config.ValidThemes[option.Value] {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "无效的主题",
			})
			return
		}
	case "GitHubOAuthEnabled":
		if option.Value == "true" && config.GitHubClientId == "" {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "无法启用 GitHub OAuth，请先填入 GitHub Client Id 以及 GitHub Client Secret！",
			})
			return
		}
	case "EmailDomainRestrictionEnabled":
		if option.Value == "true" && len(config.EmailDomainWhitelist) == 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "无法启用邮箱域名限制，请先填入限制的邮箱域名！",
			})
			return
		}
	case "WeChatAuthEnabled":
		if option.Value == "true" && config.WeChatServerAddress == "" {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "无法启用微信登录，请先填入微信登录相关配置信息！",
			})
			return
		}
	case "TurnstileCheckEnabled":
		if option.Value == "true" && config.TurnstileSiteKey == "" {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "无法启用 Turnstile 校验，请先填入 Turnstile 校验相关配置信息！",
			})
			return
		}
	}
	err = model.UpdateOption(option.Key, option.Value)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}
