package router

import (
	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
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

		// 虎皮椒支付异步回调（官方是 POST form，GET 兜底以防某些场景）
		public.POST("/pay/notify/hupijiao", controller.HupijiaoNotify)
		public.GET("/pay/notify/hupijiao", controller.HupijiaoNotify)
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

		// 模型广场 Playground
		// - models 不需要余额（用户未充值也能看有哪些模型）
		// - chat / generate-image 需要余额 > 0（PlaygroundBalanceCheck）
		// - chats CRUD 只要登录即可（让零余额用户也能看/删历史）
		user.GET("/playground/models", controller.GetPlaygroundModels)
		// 限流顺序：先算余额（免费拦截），再算 RPM（防并发刷）
		// 聊天 60/分钟（平均 1s 一次，正常人够用）；画图 10/分钟（画图本身慢，打不满）
		user.POST("/playground/chat",
			middleware.PlaygroundBalanceCheck(),
			middleware.PlaygroundUserRateLimit(60),
			controller.PlaygroundChat)
		user.POST("/playground/generate-image",
			middleware.PlaygroundBalanceCheck(),
			middleware.PlaygroundUserRateLimit(10),
			controller.PlaygroundGenerateImage)
		user.GET("/playground/chats", controller.ListPlaygroundChats)
		user.GET("/playground/chats/:id", controller.GetPlaygroundChat)
		user.DELETE("/playground/chats/:id", controller.DeletePlaygroundChatHandler)

		// 异步任务（gpt-image-2 / jimeng 等）- session-auth 入口
		// 业务侧 /v1/tasks/* 走 TokenAuth（给第三方 SDK 用），保留不动；
		// 广场前端用 Cookie，所以在这里复用同一批控制器（auth 中间件不同，控制器读 ctxkey 都一致）。
		if config.EnableTaskSystem {
			user.POST("/playground/async-submit",
				middleware.PlaygroundBalanceCheck(),
				middleware.PlaygroundUserRateLimit(10),
				controller.PlaygroundAsyncSubmit)
			user.GET("/playground/async-tasks/:id", controller.GetTask)
			user.POST("/playground/async-tasks/batch", controller.GetTasksBatch)
			user.POST("/playground/async-tasks/:id/cancel", controller.CancelTask)
		}
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

		// 财务统计
		admin.GET("/finance/summary", controller.AdminGetFinanceSummary)
		admin.GET("/finance/trend", controller.AdminGetFinanceTrend)
		admin.GET("/cost-ledger", controller.AdminListCostLedger)
		admin.POST("/cost-ledger", controller.AdminCreateCostLedger)
		admin.PUT("/cost-ledger/:id", controller.AdminUpdateCostLedger)
		admin.DELETE("/cost-ledger/:id", controller.AdminDeleteCostLedger)
	}

	// ===== 代理（agent role >= 5）=====
	// 数据隔离由 controller 内 scopeUserIDs() helper 完成，
	// admin/root 通过同一接口看全局，代理看自己 team
	agent := router.Group("/api/admin/lingjing/agent")
	agent.Use(middleware.AgentAuth())
	{
		agent.GET("/overview", controller.AgentGetOverview)
		agent.GET("/team-members", controller.AgentListTeamMembers)
		agent.GET("/team-orders", controller.AgentListTeamOrders)
		agent.GET("/team-logs", controller.AgentListTeamLogs)
		agent.GET("/my-commissions", controller.AgentListMyCommissions)
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
