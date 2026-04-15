package router

import (
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/controller"
	"github.com/songquanpeng/one-api/middleware"
)

func SetLingjingRouter(router *gin.Engine) {
	// ===== 公开接口（无需登录）=====
	public := router.Group("/api/lingjing")
	{
		public.GET("/plans", controller.GetPlans)
		public.GET("/notices", controller.GetNotices)
		public.GET("/model-prices", controller.GetModelPrices)

		// 平台配置（公开）
		public.GET("/config", controller.GetLingjingConfig)

		// 支付回调
		public.POST("/epay/notify", controller.EpayNotify)
		public.GET("/epay/notify", controller.EpayNotify)
	}

	// ===== 用户接口（需登录）=====
	user := router.Group("/api/lingjing")
	user.Use(middleware.UserAuth())
	{
		// 支付
		user.GET("/topup/info", controller.GetTopUpInfo)
		user.POST("/topup/pay", controller.RequestEpayPayment)
		user.POST("/topup/amount", controller.RequestPayAmount)
		user.GET("/topup/self", controller.GetUserTopUpList)

		// 分销
		user.GET("/referral", controller.GetReferralInfo)
		user.GET("/referral/commissions", controller.GetCommissionList)
		user.POST("/referral/withdraw", controller.WithdrawCommission)

		// 用户统计
		user.GET("/stats/dashboard", controller.GetUserDashboardStats)
	}

	// ===== 管理员接口 =====
	admin := router.Group("/api/admin/lingjing")
	admin.Use(middleware.AdminAuth())
	{
		// 套餐管理
		admin.GET("/plans", controller.AdminGetPlans)
		admin.POST("/plans", controller.AdminCreatePlan)
		admin.PUT("/plans/:id", controller.AdminUpdatePlan)
		admin.DELETE("/plans/:id", controller.AdminDeletePlan)

		// 公告管理
		admin.POST("/notices", controller.AdminCreateNotice)
		admin.DELETE("/notices/:id", controller.AdminDeleteNotice)

		// 模型定价
		admin.POST("/model-prices", controller.AdminUpsertModelPrice)
		admin.DELETE("/model-prices/:id", controller.AdminDeleteModelPrice)

		// 统一模型管理
		admin.GET("/models", controller.AdminGetAllModels)
		admin.PUT("/models", controller.AdminUpdateModel)

		// 订单管理
		admin.GET("/topups", controller.AdminGetAllTopUps)
		admin.POST("/topups/complete", controller.AdminManualTopUp)

		// 分销管理
		admin.GET("/referral/stats", controller.AdminGetReferralStats)
		admin.PUT("/referral/config", controller.AdminUpdateReferralConfig)

		// 平台配置
		admin.PUT("/config", controller.UpdateLingjingConfig)

		// 速率限制
		admin.PUT("/token/:id/rate-limit", controller.SetTokenRateLimit)
	}

	// ===== 分组管理 =====
	groupAdmin := router.Group("/api/admin/group")
	groupAdmin.Use(middleware.AdminAuth())
	{
		groupAdmin.GET("/list", controller.GetGroupList)
		groupAdmin.PUT("/user", controller.UpdateUserGroup)
		groupAdmin.PUT("/user/batch", controller.BatchUpdateUserGroup)
		groupAdmin.GET("/stats", controller.GetGroupStats)
	}

	// ===== 用户分组查询 =====
	userGroup := router.Group("/api/lingjing")
	userGroup.Use(middleware.UserAuth())
	{
		userGroup.GET("/group/my", controller.GetMyGroup)
	}

	// ===== 管理员统计 =====
	adminStats := router.Group("/api/admin/stats")
	adminStats.Use(middleware.AdminAuth())
	{
		adminStats.GET("/dashboard", controller.GetAdminDashboardStats)
		adminStats.GET("/realtime", controller.GetAdminRealtimeStats)
	}
}
