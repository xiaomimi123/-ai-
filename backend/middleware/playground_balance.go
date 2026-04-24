package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
)

// PlaygroundBalanceCheck 广场接口专用：要求用户余额 > 0
// 前端收到 code=INSUFFICIENT_BALANCE 时应跳转充值页
func PlaygroundBalanceCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		userId := c.GetInt(ctxkey.Id)
		if userId <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "未登录",
			})
			c.Abort()
			return
		}
		quota, err := model.GetUserQuota(userId)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "余额查询失败",
			})
			c.Abort()
			return
		}
		if quota <= 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "账户余额不足，请先充值",
				"code":    "INSUFFICIENT_BALANCE",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
