package middleware

import (
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func CORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	// withCredentials=true 时浏览器禁止 Access-Control-Allow-Origin: *，
	// 必须按请求 Origin 动态返回具体值，否则跨子域 cookie 携带请求会被拦
	config.AllowOriginFunc = func(origin string) bool {
		if origin == "https://aitoken.homes" ||
			strings.HasSuffix(origin, ".aitoken.homes") {
			return true
		}
		// dev 环境：vite dev server / 本地直连
		if strings.HasPrefix(origin, "http://localhost:") ||
			strings.HasPrefix(origin, "http://127.0.0.1:") {
			return true
		}
		return false
	}
	config.AllowCredentials = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"*"}
	return cors.New(config)
}
