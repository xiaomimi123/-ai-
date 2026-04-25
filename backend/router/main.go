package router

import (
	"embed"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/middleware"
	"net/http"
	"os"
	"strings"
)

func SetRouter(router *gin.Engine, buildFS embed.FS) {
	// CORS 必须在所有 SetXxxRouter 之前注册，否则后续 group 注册路由时 handler chain 不含 CORS
	// （gin 的 router.Use 只对之后注册的路由生效，原 relay.go 里 Use(CORS) 太晚导致 /api/user/* 无 CORS 头）
	router.Use(middleware.CORS())

	SetApiRouter(router)
	SetDashboardRouter(router)
	SetRelayRouter(router)
	SetLingjingRouter(router)
	frontendBaseUrl := os.Getenv("FRONTEND_BASE_URL")
	if config.IsMasterNode && frontendBaseUrl != "" {
		frontendBaseUrl = ""
		logger.SysLog("FRONTEND_BASE_URL is ignored on master node")
	}
	if frontendBaseUrl == "" {
		SetWebRouter(router, buildFS)
	} else {
		frontendBaseUrl = strings.TrimSuffix(frontendBaseUrl, "/")
		router.NoRoute(func(c *gin.Context) {
			c.Redirect(http.StatusMovedPermanently, fmt.Sprintf("%s%s", frontendBaseUrl, c.Request.RequestURI))
		})
	}
}
