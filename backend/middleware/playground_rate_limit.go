package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
)

// playgroundRateLimiter 广场专用的内存限流器
// 独立于 GlobalAPIRateLimit 使用的 inMemoryRateLimiter，避免键命名冲突和行为耦合
var playgroundRateLimiter common.InMemoryRateLimiter

// PlaygroundUserRateLimit 按 userId 做 60 秒窗口的 RPM 限流
//
// 设计要点：
//   - 只挂广场专用路由，不影响 /v1/* 正式 relay 通道（你原有业务无感）
//   - 基于 user id 而不是 IP，避免网吧 / 办公网共用出口 IP 的用户相互踩踏
//   - debug 模式（DEBUG=true）跳过，和现有 rateLimitFactory 行为对齐
//   - 不依赖 Redis，纯内存；多实例部署后会变成"每实例 RPM"，V1 可接受
//
// 触发限流时返回 429 + 标准灵镜响应格式（success:false）
func PlaygroundUserRateLimit(rpm int) gin.HandlerFunc {
	if rpm <= 0 || config.DebugEnabled {
		return func(c *gin.Context) { c.Next() }
	}
	playgroundRateLimiter.Init(60 * time.Second)
	return func(c *gin.Context) {
		userId := c.GetInt(ctxkey.Id)
		if userId <= 0 {
			c.Next()
			return
		}
		key := "pg_user:" + strconv.Itoa(userId)
		if !playgroundRateLimiter.Request(key, rpm, 60) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"message": "请求过于频繁，请稍后再试",
				"code":    "RATE_LIMITED",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
