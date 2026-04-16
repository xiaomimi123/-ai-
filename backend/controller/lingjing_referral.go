package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

// ====== 分销配置 ======

var (
	CommissionRate    float64 = 0.10 // 默认佣金比例 10%
	CommissionEnabled bool    = true // 是否启用分销
	WithdrawMinQuota  int     = 500000 // 最低提现额度（对应 $1）
)

// ====== 用户: 获取邀请信息 ======

func GetReferralInfo(c *gin.Context) {
	userId := c.GetInt("id")

	user, err := model.GetUserById(userId, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return
	}

	// 获取邀请的用户列表
	var invitedUsers []model.User
	model.DB.Select("id, username, created_time").Where("inviter_id = ?", userId).Find(&invitedUsers)

	// 获取佣金统计
	var totalCommission float64
	var pendingCommission float64
	var settledCommission float64
	model.DB.Model(&model.Commission{}).Where("user_id = ?", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalCommission)
	model.DB.Model(&model.Commission{}).Where("user_id = ? AND status = 0", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&pendingCommission)
	model.DB.Model(&model.Commission{}).Where("user_id = ? AND status = 1", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&settledCommission)

	inviteLink := fmt.Sprintf("%s/register?ref=%s", config.ServerAddress, user.AffCode)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"aff_code":             user.AffCode,
			"invite_link":          inviteLink,
			"invited_count":        len(invitedUsers),
			"invited_users":        invitedUsers,
			"commission_rate":      CommissionRate,
			"total_commission":     totalCommission,
			"pending_commission":   pendingCommission,
			"settled_commission":   settledCommission,
			"withdraw_min_quota":   WithdrawMinQuota,
			"commission_enabled":   CommissionEnabled,
		},
	})
}

// ====== 用户: 获取佣金明细 ======

func GetCommissionList(c *gin.Context) {
	userId := c.GetInt("id")

	commissions, err := model.GetCommissionsByUserId(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": commissions})
}

// ====== 用户: 佣金提现（转为额度）======

func WithdrawCommission(c *gin.Context) {
	userId := c.GetInt("id")

	if !CommissionEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "分销功能未启用"})
		return
	}

	// 查询待结算佣金
	var pendingAmount float64
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = 0", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&pendingAmount)

	// 转换为额度
	quotaToAdd := int(pendingAmount * config.QuotaPerUnit)
	if quotaToAdd < WithdrawMinQuota {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("最低提现额度为 $%.2f", float64(WithdrawMinQuota)/config.QuotaPerUnit),
		})
		return
	}

	// 事务：标记佣金为已结算 + 增加用户额度
	tx := model.DB.Begin()

	if err := tx.Model(&model.Commission{}).
		Where("user_id = ? AND status = 0", userId).
		Update("status", 1).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "提现失败"})
		return
	}

	if err := tx.Model(&model.User{}).Where("id = ?", userId).
		Update("quota", model.DB.Raw("quota + ?", quotaToAdd)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "增加额度失败"})
		return
	}

	tx.Commit()

	logger.SysLog(fmt.Sprintf("user %d withdrew commission: amount=%.2f quota=%d", userId, pendingAmount, quotaToAdd))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("提现成功，已添加 $%.2f 额度", pendingAmount),
		"data": gin.H{
			"amount":     pendingAmount,
			"quota_added": quotaToAdd,
		},
	})
}

// ====== 充值时发放佣金（在支付成功后调用）======

func DistributeCommission(userId int, orderAmount float64, orderId int) {
	if !CommissionEnabled || orderAmount <= 0 {
		return
	}

	// 查找邀请人
	user, err := model.GetUserById(userId, false)
	if err != nil || user.InviterId == 0 {
		return
	}

	commissionAmount := orderAmount * CommissionRate

	commission := &model.Commission{
		UserId:     user.InviterId,
		FromUserId: userId,
		OrderId:    orderId,
		Amount:     commissionAmount,
		Status:     0, // 待结算
	}

	if err := model.CreateCommission(commission); err != nil {
		logger.SysError(fmt.Sprintf("create commission failed: %v", err))
		return
	}

	logger.SysLog(fmt.Sprintf("commission created: inviter=%d from_user=%d amount=%.2f", user.InviterId, userId, commissionAmount))
}

// ====== 管理员: 分销概览 ======

func AdminGetReferralStats(c *gin.Context) {
	var totalUsers int64
	var usersWithInviter int64
	var totalCommission float64
	var pendingCommission float64

	model.DB.Model(&model.User{}).Count(&totalUsers)
	model.DB.Model(&model.User{}).Where("inviter_id > 0").Count(&usersWithInviter)
	model.DB.Model(&model.Commission{}).Select("COALESCE(SUM(amount), 0)").Scan(&totalCommission)
	model.DB.Model(&model.Commission{}).Where("status = 0").Select("COALESCE(SUM(amount), 0)").Scan(&pendingCommission)

	// 分销排行榜（按邀请人数）
	type InviterRank struct {
		InviterId    int    `json:"inviter_id"`
		Username     string `json:"username"`
		InvitedCount int    `json:"invited_count"`
	}
	var rankings []InviterRank
	model.DB.Raw(`
		SELECT u.inviter_id, inviter.username, COUNT(*) as invited_count
		FROM users u
		JOIN users inviter ON inviter.id = u.inviter_id
		WHERE u.inviter_id > 0
		GROUP BY u.inviter_id, inviter.username
		ORDER BY invited_count DESC
		LIMIT 20
	`).Scan(&rankings)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"total_users":          totalUsers,
			"users_with_inviter":   usersWithInviter,
			"referral_rate":        fmt.Sprintf("%.1f%%", float64(usersWithInviter)/float64(totalUsers)*100),
			"total_commission":     totalCommission,
			"pending_commission":   pendingCommission,
			"commission_rate":      CommissionRate,
			"rankings":             rankings,
		},
	})
}

// ====== 管理员: 更新分销配置 ======

func AdminUpdateReferralConfig(c *gin.Context) {
	var req struct {
		CommissionRate    *float64 `json:"commission_rate"`
		CommissionEnabled *bool    `json:"commission_enabled"`
		WithdrawMinQuota  *int     `json:"withdraw_min_quota"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	if req.CommissionRate != nil {
		if *req.CommissionRate < 0 || *req.CommissionRate > 1 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "佣金比例须在 0-1 之间"})
			return
		}
		CommissionRate = *req.CommissionRate
	}
	if req.CommissionEnabled != nil {
		CommissionEnabled = *req.CommissionEnabled
	}
	if req.WithdrawMinQuota != nil {
		WithdrawMinQuota = *req.WithdrawMinQuota
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "配置已更新",
		"data": gin.H{
			"commission_rate":    CommissionRate,
			"commission_enabled": CommissionEnabled,
			"withdraw_min_quota": WithdrawMinQuota,
		},
	})
}

// ====== 提现配置 ======

const WithdrawMinAmount float64 = 10.0 // 最低提现 ¥10

// sumWithdrawableCommission 计算用户可提现额度（已结算佣金 - 未被拒绝的提现申请合计）
func sumWithdrawableCommission(userId int) (totalCommission, withdrawnAmount, available float64) {
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = 1", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalCommission)
	model.DB.Model(&model.WithdrawRequest{}).
		Where("user_id = ? AND status IN (0,1,3)", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&withdrawnAmount)
	available = totalCommission - withdrawnAmount
	if available < 0 {
		available = 0
	}
	return
}

// ====== 用户: 获取提现信息（余额 + 历史）======

func GetWithdrawInfo(c *gin.Context) {
	userId := c.GetInt("id")

	totalCommission, withdrawnAmount, available := sumWithdrawableCommission(userId)

	var records []model.WithdrawRequest
	model.DB.Where("user_id = ?", userId).
		Order("created_at DESC").
		Limit(20).
		Find(&records)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"total_commission": totalCommission,
			"withdrawn":        withdrawnAmount,
			"available":        available,
			"min_withdraw":     WithdrawMinAmount,
			"records":          records,
		},
	})
}

// ====== 用户: 申请提现 ======

func CreateWithdrawRequest(c *gin.Context) {
	userId := c.GetInt("id")

	var req struct {
		Amount        float64 `json:"amount" binding:"required"`
		AlipayAccount string  `json:"alipay_account" binding:"required"`
		RealName      string  `json:"real_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	if req.Amount < WithdrawMinAmount {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("最低提现金额 ¥%.2f", WithdrawMinAmount)})
		return
	}

	_, _, available := sumWithdrawableCommission(userId)
	if req.Amount > available {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("可提现余额不足，当前可提现 ¥%.2f", available),
		})
		return
	}

	// 同一用户同时只能有一笔待审核
	var pendingCount int64
	model.DB.Model(&model.WithdrawRequest{}).
		Where("user_id = ? AND status = 0", userId).
		Count(&pendingCount)
	if pendingCount > 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "您有待审核的提现申请，请等待处理后再申请"})
		return
	}

	withdraw := model.WithdrawRequest{
		UserId:        userId,
		Amount:        req.Amount,
		AlipayAccount: req.AlipayAccount,
		RealName:      req.RealName,
		Status:        0,
	}
	if err := model.DB.Create(&withdraw).Error; err != nil {
		logger.SysError(fmt.Sprintf("create withdraw request failed: user=%d err=%v", userId, err))
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "申请失败"})
		return
	}

	logger.SysLog(fmt.Sprintf("withdraw request created: user=%d amount=%.2f", userId, req.Amount))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "提现申请已提交，管理员将在 1-3 个工作日内处理",
		"data":    withdraw,
	})
}

// ====== 管理员: 提现申请列表 ======

func AdminGetWithdrawList(c *gin.Context) {
	status := c.Query("status") // 不传则全部
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	const pageSize = 20

	base := model.DB.Model(&model.WithdrawRequest{})
	if status != "" {
		base = base.Where("withdraw_requests.status = ?", status)
	}

	var total int64
	base.Count(&total)

	type WithdrawWithUser struct {
		model.WithdrawRequest
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	var records []WithdrawWithUser
	base.
		Joins("LEFT JOIN users ON users.id = withdraw_requests.user_id").
		Select("withdraw_requests.*, users.username, users.email").
		Order("withdraw_requests.created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Scan(&records)

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"data":      records,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// ====== 管理员: 处理提现申请 ======

func AdminProcessWithdraw(c *gin.Context) {
	adminId := c.GetInt("id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效 ID"})
		return
	}

	var req struct {
		Action       string `json:"action"`        // approve / reject / paid
		RejectReason string `json:"reject_reason"` // 拒绝时必填
		AdminRemark  string `json:"admin_remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	var withdraw model.WithdrawRequest
	if err := model.DB.First(&withdraw, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "申请不存在"})
		return
	}

	now := time.Now().Unix()
	switch req.Action {
	case "approve":
		if withdraw.Status != 0 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "只能审核待处理的申请"})
			return
		}
		model.DB.Model(&withdraw).Updates(map[string]interface{}{
			"status":       1,
			"processed_at": now,
			"processed_by": adminId,
			"admin_remark": req.AdminRemark,
		})
		logger.SysLog(fmt.Sprintf("withdraw approved: id=%d admin=%d", id, adminId))
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "已审核通过，请尽快打款"})

	case "reject":
		if withdraw.Status != 0 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "只能拒绝待处理的申请"})
			return
		}
		if req.RejectReason == "" {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "请填写拒绝原因"})
			return
		}
		model.DB.Model(&withdraw).Updates(map[string]interface{}{
			"status":        2,
			"processed_at":  now,
			"processed_by":  adminId,
			"reject_reason": req.RejectReason,
		})
		logger.SysLog(fmt.Sprintf("withdraw rejected: id=%d admin=%d reason=%s", id, adminId, req.RejectReason))
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "已拒绝申请"})

	case "paid":
		if withdraw.Status != 1 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "只能标记已审核通过的申请"})
			return
		}
		model.DB.Model(&withdraw).Updates(map[string]interface{}{
			"status":       3,
			"processed_at": now,
			"admin_remark": req.AdminRemark,
		})
		logger.SysLog(fmt.Sprintf("withdraw paid: id=%d admin=%d", id, adminId))
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "已标记为打款完成"})

	default:
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效操作"})
	}
}

// ====== 管理员: 提现统计 ======

func AdminGetWithdrawStats(c *gin.Context) {
	type Stats struct {
		Status int     `json:"status"`
		Count  int64   `json:"count"`
		Amount float64 `json:"amount"`
	}
	var stats []Stats
	model.DB.Model(&model.WithdrawRequest{}).
		Select("status, COUNT(*) as count, COALESCE(SUM(amount),0) as amount").
		Group("status").
		Scan(&stats)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": stats})
}
