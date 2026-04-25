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
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"}
	// gin-contrib/cors 不把 "*" 当通配符，必须明确列出
	// 否则 preflight 响应缺 Access-Control-Allow-Headers 导致 Content-Type 等被拦
	config.AllowHeaders = []string{
		"Origin",
		"Content-Type",
		"Content-Length",
		"Accept",
		"Accept-Encoding",
		"Accept-Language",
		"Authorization",
		"X-Requested-With",
		"X-CSRF-Token",
		"Cache-Control",
		"Pragma",
	}
	config.ExposeHeaders = []string{"Content-Length", "X-Playground-Chat-Id"}
	config.MaxAge = 12 * 60 * 60 // 12h preflight 缓存，减少重复 OPTIONS
	return cors.New(config)
}
