package router

import (
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/controller"
	"github.com/songquanpeng/one-api/middleware"
)

func SetLingjingRouter(router *gin.Engine) {
	// ===== 公开接口 =====
	public := router.Group("/api/lingjing")
	{
		public.GET("/plans", controller.GetPlans)
		public.GET("/notices", controller.GetNotices)
		public.GET("/model-prices", controller.GetModelPrices)
		public.GET("/config", controller.GetLingjingConfig)
		public.GET("/pay/config", controller.GetPublicPaymentConfig)

		// 支付宝回调
		public.POST("/pay/notify/alipay", controller.AlipayNotify)
	}

	// ===== 用户接口 =====
	user := router.Group("/api/lingjing")
	user.Use(middleware.UserAuth())
	{
		// 支付
		user.GET("/pay/info", controller.GetPayInfo)
		user.POST("/pay/create", controller.CreatePayOrder)
		user.GET("/pay/order/:orderNo", controller.GetPayOrderStatus)
		user.GET("/pay/orders", controller.GetUserOrders)

		// 分销
		user.GET("/referral", controller.GetReferralInfo)
		user.GET("/referral/commissions", controller.GetCommissionList)
		user.POST("/referral/withdraw", controller.WithdrawCommission)

		// 统计
		user.GET("/stats/dashboard", controller.GetUserDashboardStats)

		// 分组
		user.GET("/group/my", controller.GetMyGroup)
	}

	// ===== 管理员接口 =====
	admin := router.Group("/api/admin/lingjing")
	admin.Use(middleware.AdminAuth())
	{
		admin.GET("/plans", controller.AdminGetPlans)
		admin.POST("/plans", controller.AdminCreatePlan)
		admin.PUT("/plans/:id", controller.AdminUpdatePlan)
		admin.DELETE("/plans/:id", controller.AdminDeletePlan)
		admin.PUT("/plans/:id/toggle", controller.AdminTogglePlan)

		admin.POST("/notices", controller.AdminCreateNotice)
		admin.DELETE("/notices/:id", controller.AdminDeleteNotice)

		admin.POST("/model-prices", controller.AdminUpsertModelPrice)
		admin.DELETE("/model-prices/:id", controller.AdminDeleteModelPrice)

		admin.GET("/models", controller.AdminGetAllModels)
		admin.PUT("/models", controller.AdminUpdateModel)

		admin.GET("/referral/stats", controller.AdminGetReferralStats)
		admin.PUT("/referral/config", controller.AdminUpdateReferralConfig)

		admin.PUT("/config", controller.UpdateLingjingConfig)

		// 支付管理
		admin.GET("/pay/config", controller.GetPaymentConfig)
		admin.PUT("/pay/config", controller.UpdatePaymentConfig)
		admin.POST("/pay/manual-topup", controller.AdminManualTopup)

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

	// ===== 管理员统计 =====
	adminStats := router.Group("/api/admin/stats")
	adminStats.Use(middleware.AdminAuth())
	{
		adminStats.GET("/dashboard", controller.GetAdminDashboardStats)
		adminStats.GET("/realtime", controller.GetAdminRealtimeStats)
	}
}
