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

		// 易支付回调（兼容虎皮椒；部分网关回调是 GET query，也挂一份）
		public.POST("/pay/notify/epay", controller.EpayNotify)
		public.GET("/pay/notify/epay", controller.EpayNotify)
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
		user.POST("/referral/withdraw", controller.WithdrawCommission) // 旧：提现转额度（保留）

		// 提现（支付宝打款）
		user.GET("/withdraw", controller.GetWithdrawInfo)
		user.POST("/withdraw", controller.CreateWithdrawRequest)

		// 通知中心
		// 注意：/notifications/unread（静态）必须在 /notifications/:id/read（动态）之前注册，
		// 否则 Gin 会把 "unread" 当 :id 参数匹配到 PUT /:id/read 上
		user.GET("/notifications/unread", controller.GetUnreadCount)
		user.GET("/notifications", controller.GetUserNotifications)
		user.PUT("/notifications/:id/read", controller.MarkNotificationRead)

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

		// 模型广场 CRUD（新）
		admin.GET("/model-prices", controller.AdminGetModelPrices)
		admin.POST("/model-prices", controller.AdminCreateModelPrice)
		admin.PUT("/model-prices/:id", controller.AdminUpdateModelPrice)
		admin.DELETE("/model-prices/:id", controller.AdminDeleteModelPrice)
		admin.PUT("/model-prices/:id/toggle", controller.AdminToggleModelVisibility)

		// 「模型管理」聚合视图（保留）：倍率/渠道数/可见性
		admin.GET("/models", controller.AdminGetAllModels)
		admin.PUT("/models", controller.AdminUpdateModel)
		admin.DELETE("/models", controller.AdminDeleteModel) // ?model_name=xxx

		admin.GET("/referral/stats", controller.AdminGetReferralStats)
		admin.PUT("/referral/config", controller.AdminUpdateReferralConfig)

		admin.PUT("/config", controller.UpdateLingjingConfig)

		// 支付管理
		admin.GET("/pay/config", controller.GetPaymentConfig)
		admin.PUT("/pay/config", controller.UpdatePaymentConfig)
		admin.POST("/pay/manual-topup", controller.AdminManualTopup)

		// 订单管理（管理员）
		admin.GET("/topups", controller.AdminGetOrders)
		admin.POST("/topups/complete", controller.AdminCompleteOrder)

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

	// ===== 管理员提现审核 =====
	adminWithdraw := router.Group("/api/admin/withdraw")
	adminWithdraw.Use(middleware.AdminAuth())
	{
		adminWithdraw.GET("", controller.AdminGetWithdrawList)
		adminWithdraw.GET("/stats", controller.AdminGetWithdrawStats)
		adminWithdraw.PUT("/:id", controller.AdminProcessWithdraw)
	}
}
