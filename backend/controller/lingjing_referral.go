package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"gorm.io/gorm"
)

// ====== 分销配置（持久化到 options 表；重启自动恢复） ======
//
// options key:
//   referral.commission_rate    - float (0~1)
//   referral.enabled            - "true" / "false"
//   referral.withdraw_min_quota - int（最低提现额度，路径 A 用；对应 quota 单位）
var (
	referralCfgMu sync.RWMutex

	CommissionRate    float64 = 0.10
	CommissionEnabled bool    = true
	WithdrawMinQuota  int64   = 500000 // 对应 $1；用 int64 防 32-bit 下溢
)

const (
	optKeyCommissionRate    = "referral.commission_rate"
	optKeyCommissionEnabled = "referral.enabled"
	optKeyWithdrawMinQuota  = "referral.withdraw_min_quota"
)

// InitReferralConfig 启动时从 options 加载；没配置就保持默认值（首次写默认值到表）
func InitReferralConfig() {
	referralCfgMu.Lock()
	defer referralCfgMu.Unlock()
	if v := model.GetOptionValue(optKeyCommissionRate); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 && f <= 1 {
			CommissionRate = f
		}
	}
	if v := model.GetOptionValue(optKeyCommissionEnabled); v != "" {
		CommissionEnabled = v == "true"
	}
	if v := model.GetOptionValue(optKeyWithdrawMinQuota); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			WithdrawMinQuota = n
		}
	}
	logger.SysLog(fmt.Sprintf("referral config loaded: rate=%.2f enabled=%v minQuota=%d",
		CommissionRate, CommissionEnabled, WithdrawMinQuota))
}

func getReferralCfg() (rate float64, enabled bool, minQuota int64) {
	referralCfgMu.RLock()
	defer referralCfgMu.RUnlock()
	return CommissionRate, CommissionEnabled, WithdrawMinQuota
}

// ====== 用户: 获取邀请信息 ======

func GetReferralInfo(c *gin.Context) {
	userId := c.GetInt("id")

	user, err := model.GetUserById(userId, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return
	}

	// 邀请用户列表：限 50 条；另外独立 COUNT 拿总数，避免一次返回几百条卡前端
	var invitedUsers []model.User
	var invitedCount int64
	model.DB.Model(&model.User{}).Where("inviter_id = ?", userId).Count(&invitedCount)
	model.DB.Select("id, username, created_time").
		Where("inviter_id = ?", userId).
		Order("created_time DESC").
		Limit(50).
		Find(&invitedUsers)

	// 佣金统计：pending = 未结算；settled = 已结算待支付宝提现；quota_spent = 已转余额
	// status IN (0,1) 必须显式过滤：分销开关 OFF 时会写 status=99 的对账快照，不能进汇总
	var totalCommission, pendingCommission, settledAvailable, quotaSpent float64
	model.DB.Model(&model.Commission{}).Where("user_id = ? AND status IN (?, ?)", userId,
		model.CommissionStatusPending, model.CommissionStatusSettled).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalCommission)
	model.DB.Model(&model.Commission{}).Where("user_id = ? AND status = ?", userId, model.CommissionStatusPending).
		Select("COALESCE(SUM(amount), 0)").Scan(&pendingCommission)
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = 1 AND (settled_via IS NULL OR settled_via = '' OR settled_via = 'withdraw')", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&settledAvailable)
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = 1 AND settled_via = 'quota'", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&quotaSpent)

	rate, enabled, minQuota := getReferralCfg()
	inviteLink := fmt.Sprintf("%s/register?ref=%s",
		strings.TrimRight(config.ServerAddress, "/"), user.AffCode)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"aff_code":           user.AffCode,
			"invite_link":        inviteLink,
			"invited_count":      invitedCount,
			"invited_users":      invitedUsers, // 最近 50 条
			"commission_rate":    rate,
			"total_commission":   totalCommission,
			"pending_commission": pendingCommission,
			"settled_commission": settledAvailable, // 仅路径 B 可用
			"quota_spent":        quotaSpent,       // 历史已转余额的（信息展示用）
			"withdraw_min_quota": minQuota,
			"commission_enabled": enabled,
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

// ====== 用户: 佣金提现（路径 A：转为站内额度） ======
// 把所有 status=0 的佣金标为 status=1 + settled_via='quota'，再把等值 quota 加到用户余额
// 事务 + 条件 UPDATE 防并发双倍结算
func WithdrawCommission(c *gin.Context) {
	userId := c.GetInt("id")

	// 兜底：禁用/删除的用户不应能继续提现（中间件理论上拦掉，但旧 session 或缓存场景仍可能漏）
	if user, uerr := model.GetUserById(userId, false); uerr != nil || user.Status != model.UserStatusEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "账户状态异常，无法提现"})
		return
	}

	_, enabled, minQuota := getReferralCfg()
	if !enabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "分销功能未启用"})
		return
	}

	// 查询待结算佣金
	var pendingAmount float64
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = 0", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&pendingAmount)

	// 转成 quota（int64 防 32-bit 下溢）
	quotaToAdd := int64(pendingAmount * config.QuotaPerUnit)
	if quotaToAdd < minQuota {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("最低提现额度为 $%.2f", float64(minQuota)/config.QuotaPerUnit),
		})
		return
	}

	// 事务：条件 UPDATE 把 status=0 全部改 status=1 + settled_via=quota，然后加余额
	// 如果并发两次调用，第二次 RowsAffected=0（因为 status 已不是 0）不会重复加额度
	var actuallyUpdated int64
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&model.Commission{}).
			Where("user_id = ? AND status = 0", userId).
			Updates(map[string]interface{}{
				"status":      1,
				"settled_via": "quota",
			})
		if res.Error != nil {
			return res.Error
		}
		actuallyUpdated = res.RowsAffected
		if actuallyUpdated == 0 {
			// 并发场景：已经被另一次调用处理过
			return nil
		}
		if err := tx.Model(&model.User{}).Where("id = ?", userId).
			Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		logger.SysError(fmt.Sprintf("withdraw commission tx failed: user=%d err=%v", userId, err))
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "提现失败"})
		return
	}
	if actuallyUpdated == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "没有可提现的佣金（可能已被并发处理）"})
		return
	}

	logger.SysLog(fmt.Sprintf("user %d withdrew commission (to quota): amount=%.2f quota=%d rows=%d",
		userId, pendingAmount, quotaToAdd, actuallyUpdated))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("提现成功，已添加 $%.2f 额度", pendingAmount),
		"data": gin.H{
			"amount":      pendingAmount,
			"quota_added": quotaToAdd,
		},
	})
}

// ====== 充值时发放佣金（在支付成功后调用） ======
// 幂等保证：commissions.order_id 加了 uniqueIndex，重复插入会返回错误，安全吞掉
// 自邀请防护：user.InviterId == userId 时不发（注册流程理论上杜绝此情况，防御性检查）
func DistributeCommission(userId int, orderAmount float64, orderId int) {
	rate, enabled, _ := getReferralCfg()
	// 参数无效直接丢弃，不写任何记录
	if orderAmount <= 0 || orderId <= 0 {
		return
	}

	user, err := model.GetUserById(userId, false)
	if err != nil || user.InviterId == 0 {
		return
	}
	if user.InviterId == userId {
		logger.SysError(fmt.Sprintf("self-invite commission blocked: user=%d", userId))
		return
	}

	// 必须先把 inviter 取出来：既要拿 AffiliateRate，也要做"上级是否可用"的状态校验，
	// 否则禁用/删除状态的上级也会拿到佣金，形成"僵尸佣金"（钱卡死、提不出来）
	inviter, ierr := model.GetUserById(user.InviterId, false)
	if ierr != nil {
		logger.SysError(fmt.Sprintf("commission skipped: inviter not found user=%d inviter_id=%d err=%v",
			userId, user.InviterId, ierr))
		return
	}
	if inviter.Status != model.UserStatusEnabled {
		logger.SysWarn(fmt.Sprintf("commission skipped: inviter not enabled user=%d inviter=%d status=%d order=%d",
			userId, inviter.Id, inviter.Status, orderId))
		return
	}

	// 专属比例优先：邀请人 AffiliateRate > 0 则用它，否则 fallback 全局
	// 约束 0~1 范围（防 DB 脏数据），超出则视作未设置
	effectiveRate := rate
	rateSource := "global"
	if inviter.AffiliateRate > 0 && inviter.AffiliateRate <= 1 {
		effectiveRate = inviter.AffiliateRate
		rateSource = "per-user"
	}
	commissionAmount := orderAmount * effectiveRate

	// 分销开启 → 写 Pending 进结算池；分销关闭 → 写 DisabledSnapshot 仅供事后对账
	// 不再像旧代码那样静默丢弃：管理员临时关分销做活动后再开回，账面不再"凭空消失一段"
	commissionStatus := model.CommissionStatusPending
	statusLabel := "pending"
	if !enabled {
		commissionStatus = model.CommissionStatusDisabledSnapshot
		statusLabel = "disabled-snapshot"
	}

	commission := &model.Commission{
		UserId:     user.InviterId,
		FromUserId: userId,
		OrderId:    orderId,
		Amount:     commissionAmount,
		Status:     commissionStatus,
	}

	if err := model.CreateCommission(commission); err != nil {
		// 唯一键冲突说明该订单已发过佣金（幂等），吞掉
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			logger.SysLog(fmt.Sprintf("commission already exists for order=%d (idempotent skip)", orderId))
			return
		}
		logger.SysError(fmt.Sprintf("create commission failed: %v", err))
		return
	}

	logger.SysLog(fmt.Sprintf("commission created [%s]: inviter=%d from_user=%d amount=%.2f rate=%.4f(%s) order=%d",
		statusLabel, user.InviterId, userId, commissionAmount, effectiveRate, rateSource, orderId))
}

// ====== 管理员: 分销概览 ======

func AdminGetReferralStats(c *gin.Context) {
	var totalUsers int64
	var usersWithInviter int64
	var totalCommission float64
	var pendingCommission float64

	model.DB.Model(&model.User{}).Count(&totalUsers)
	model.DB.Model(&model.User{}).Where("inviter_id > 0").Count(&usersWithInviter)
	// status IN (0,1) 显式过滤：分销关闭时的 status=99 对账快照不计入"实付佣金"统计
	model.DB.Model(&model.Commission{}).Where("status IN (?, ?)",
		model.CommissionStatusPending, model.CommissionStatusSettled).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalCommission)
	model.DB.Model(&model.Commission{}).Where("status = ?", model.CommissionStatusPending).
		Select("COALESCE(SUM(amount), 0)").Scan(&pendingCommission)

	// 除零防护（新环境数据空时）
	referralRate := "0.0%"
	if totalUsers > 0 {
		referralRate = fmt.Sprintf("%.1f%%", float64(usersWithInviter)/float64(totalUsers)*100)
	}

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

	rate, _, _ := getReferralCfg()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"total_users":        totalUsers,
			"users_with_inviter": usersWithInviter,
			"referral_rate":      referralRate,
			"total_commission":   totalCommission,
			"pending_commission": pendingCommission,
			"commission_rate":    rate,
			"rankings":           rankings,
		},
	})
}

// ====== 管理员: 更新分销配置（持久化到 options） ======

func AdminUpdateReferralConfig(c *gin.Context) {
	var req struct {
		CommissionRate    *float64 `json:"commission_rate"`
		CommissionEnabled *bool    `json:"commission_enabled"`
		WithdrawMinQuota  *int64   `json:"withdraw_min_quota"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	referralCfgMu.Lock()
	defer referralCfgMu.Unlock()

	if req.CommissionRate != nil {
		if *req.CommissionRate < 0 || *req.CommissionRate > 1 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "佣金比例须在 0-1 之间"})
			return
		}
		CommissionRate = *req.CommissionRate
		model.SaveOption(optKeyCommissionRate, strconv.FormatFloat(CommissionRate, 'f', 4, 64))
	}
	if req.CommissionEnabled != nil {
		CommissionEnabled = *req.CommissionEnabled
		v := "false"
		if CommissionEnabled {
			v = "true"
		}
		model.SaveOption(optKeyCommissionEnabled, v)
	}
	if req.WithdrawMinQuota != nil {
		if *req.WithdrawMinQuota <= 0 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "最低提现额度须大于 0"})
			return
		}
		WithdrawMinQuota = *req.WithdrawMinQuota
		model.SaveOption(optKeyWithdrawMinQuota, strconv.FormatInt(WithdrawMinQuota, 10))
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

const WithdrawMinAmount float64 = 10.0 // 最低提现 ¥10（路径 B）

// sumWithdrawableCommission 计算用户路径 B 可提现余额
// 关键修复：**排除 settled_via='quota'**（已走路径 A 转余额的佣金不能再申请支付宝提现）
// 否则用户能双路径刷钱（同一笔佣金既转了余额又申请了真金提现）
func sumWithdrawableCommission(userId int) (totalCommission, withdrawnAmount, available float64) {
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = 1 AND (settled_via IS NULL OR settled_via = '' OR settled_via = 'withdraw')", userId).
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

// ====== 用户: 获取提现信息（余额 + 历史） ======

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

	// 兜底：禁用/删除的用户不应能发起支付宝提现
	if user, uerr := model.GetUserById(userId, false); uerr != nil || user.Status != model.UserStatusEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "账户状态异常，无法提现"})
		return
	}

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
		model.CreateUserNotification(
			withdraw.UserId,
			"提现申请已通过",
			fmt.Sprintf("您的提现申请 ¥%.2f 已审核通过，管理员将尽快转账到您的支付宝账号 %s", withdraw.Amount, withdraw.AlipayAccount),
			"withdraw_approved",
		)
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
		model.CreateUserNotification(
			withdraw.UserId,
			"提现申请被拒绝",
			fmt.Sprintf("您的提现申请 ¥%.2f 未通过审核，原因：%s", withdraw.Amount, req.RejectReason),
			"withdraw_rejected",
		)
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
		model.CreateUserNotification(
			withdraw.UserId,
			"提现已打款",
			fmt.Sprintf("您的提现申请 ¥%.2f 已完成打款，请查收支付宝到账通知", withdraw.Amount),
			"withdraw_paid",
		)
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
