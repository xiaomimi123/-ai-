package middleware

import (
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORS 按路径分发：
//   - /v1/*  → 开放所有 origin（OpenAI 兼容接口给第三方网页直调，Bearer token 鉴权不依赖 cookie）
//   - 其他   → 严格白名单（CORS_ALLOWED_ORIGINS，如 "https://example.com,*.example.com" + dev localhost），带 cookie credentials
//
// 紧急回滚：设置环境变量 CORS_FALLBACK_OPEN=true 退回"任意 origin + 带凭证"模式
// （牺牲安全，保接口可用；用于线上 CORS 配置出问题时快速恢复）
func CORS() gin.HandlerFunc {
	if os.Getenv("CORS_FALLBACK_OPEN") == "true" {
		fallback := openFallbackCORS()
		return func(c *gin.Context) { fallback(c) }
	}

	strict := strictCORS()
	openV1 := v1OpenCORS()

	return func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/v1/") {
			openV1(c)
			return
		}
		strict(c)
	}
}

// ParseAllowedOrigins 解析 CORS_ALLOWED_ORIGINS。
// 逗号分隔，支持 "*.example.com" 形式的子域通配。空段与首尾空白忽略，尾部斜杠去掉。
func ParseAllowedOrigins(raw string) []string {
	out := []string{}
	for _, part := range strings.Split(raw, ",") {
		p := strings.TrimRight(strings.TrimSpace(part), "/")
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// originAllowed 判断 origin 是否命中白名单。
// localhost / 127.0.0.1 恒定放行，供本地开发使用。
func originAllowed(origin string, allowed []string) bool {
	if strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") {
		return true
	}
	for _, a := range allowed {
		if strings.HasPrefix(a, "*.") {
			// "*.example.com" 匹配 "https://x.example.com"，
			// 但不能匹配 "https://notexample.com"，所以比对必须带前导点
			if strings.HasSuffix(origin, a[1:]) {
				return true
			}
			continue
		}
		if origin == a {
			return true
		}
	}
	return false
}

func strictCORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	// withCredentials=true 时浏览器禁止 Access-Control-Allow-Origin: *，
	// 必须按请求 Origin 动态返回具体值
	allowed := ParseAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	config.AllowOriginFunc = func(origin string) bool {
		return originAllowed(origin, allowed)
	}
	config.AllowCredentials = true
	config.AllowMethods = corsMethods()
	config.AllowHeaders = corsHeaders()
	config.ExposeHeaders = []string{"Content-Length", "X-Playground-Chat-Id"}
	config.MaxAge = 12 * 60 * 60
	return cors.New(config)
}

func v1OpenCORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowCredentials = false
	config.AllowMethods = corsMethods()
	config.AllowHeaders = corsHeaders()
	config.ExposeHeaders = []string{"Content-Length"}
	config.MaxAge = 12 * 60 * 60
	return cors.New(config)
}

func openFallbackCORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowOriginFunc = func(origin string) bool { return true }
	config.AllowCredentials = true
	config.AllowMethods = corsMethods()
	config.AllowHeaders = corsHeaders()
	config.ExposeHeaders = []string{"Content-Length", "X-Playground-Chat-Id"}
	config.MaxAge = 12 * 60 * 60
	return cors.New(config)
}

func corsMethods() []string {
	return []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"}
}

// gin-contrib/cors 不把 "*" 当通配符，必须明确列出
func corsHeaders() []string {
	return []string{
		"Origin", "Content-Type", "Content-Length",
		"Accept", "Accept-Encoding", "Accept-Language",
		"Authorization", "X-Requested-With", "X-CSRF-Token",
		"Cache-Control", "Pragma",
	}
}
