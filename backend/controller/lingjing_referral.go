package controller

import (
	"fmt"
	"net/http"

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
