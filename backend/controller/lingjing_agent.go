package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/model"
)

// scopeUserIDs 返回调用者能看到的 user.id 列表。
//   - admin/root (role >= 10) → (nil, false) 不加 filter
//   - agent (role == 5)       → (ids, true) 仅 inviter_id = self.id 的下线
//
// 所有 agent-visible handler 必须在 SQL 之前调一次此 helper。
// 漏调 = 代理看到别家数据 = 严重安全 bug。
func scopeUserIDs(c *gin.Context) ([]int, bool) {
	if c.GetInt("role") >= model.RoleAdminUser {
		return nil, false
	}
	selfId := c.GetInt("id")
	var ids []int
	model.DB.Model(&model.User{}).
		Where("inviter_id = ?", selfId).
		Pluck("id", &ids)
	if ids == nil {
		ids = []int{} // 空 slice 而不是 nil，便于 caller 直接传给 GORM IN()
	}
	return ids, true
}

// ============ Overview ============

func AgentGetOverview(c *gin.Context) {
	selfId := c.GetInt("id")
	teamIds, scoped := scopeUserIDs(c)

	// 本月起点
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local).Unix()
	monthEnd := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.Local).Unix()

	// 团队人数
	var teamSize int64
	q := model.DB.Model(&model.User{})
	if scoped {
		q = q.Where("inviter_id = ?", selfId)
	}
	q.Count(&teamSize)

	// 团队营收（本月）
	var monthRevenue float64
	rq := model.DB.Model(&model.Order{}).
		Where("status = ? AND paid_at >= ? AND paid_at < ?", 1, monthStart, monthEnd)
	if scoped {
		if len(teamIds) == 0 {
			monthRevenue = 0
		} else {
			rq.Where("user_id IN ?", teamIds).Select("COALESCE(SUM(amount), 0)").Scan(&monthRevenue)
		}
	} else {
		rq.Select("COALESCE(SUM(amount), 0)").Scan(&monthRevenue)
	}

	// 我的佣金累计（pending + settled，含未结算）
	var myCommission float64
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status IN (?, ?)", selfId,
			model.CommissionStatusPending, model.CommissionStatusSettled).
		Select("COALESCE(SUM(amount), 0)").Scan(&myCommission)

	// 团队本月调用数
	var monthCalls int64
	cq := model.DB.Table("logs").Where("created_at >= ? AND created_at < ?", monthStart, monthEnd)
	if scoped {
		if len(teamIds) == 0 {
			monthCalls = 0
		} else {
			cq.Where("user_id IN ?", teamIds).Count(&monthCalls)
		}
	} else {
		cq.Count(&monthCalls)
	}

	// 邀请信息（aff_code + 邀请链接 + 当前生效佣金比例）
	// 跟 controller/lingjing_referral.go:DistributeCommission 的优先级规则一致：
	// affiliate_rate > 0 用专属，否则 fallback 全局
	affCode := ""
	inviteLink := ""
	commissionRate := 0.0
	commissionRateSource := "global"
	if u, uerr := model.GetUserById(selfId, false); uerr == nil && u != nil {
		affCode = u.AffCode
		inviteLink = fmt.Sprintf("%s/register?ref=%s",
			strings.TrimRight(config.ServerAddress, "/"), u.AffCode)
		if u.AffiliateRate > 0 && u.AffiliateRate <= 1 {
			commissionRate = u.AffiliateRate
			commissionRateSource = "personal"
		} else {
			globalRate, _, _ := getReferralCfg()
			commissionRate = globalRate
			commissionRateSource = "global"
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"team_size":              teamSize,
			"month_revenue":          monthRevenue,
			"my_commission":          myCommission,
			"month_calls":            monthCalls,
			"aff_code":               affCode,
			"invite_link":            inviteLink,
			"commission_rate":        commissionRate,
			"commission_rate_source": commissionRateSource,
		},
	})
}

// ============ Team Members ============

func AgentListTeamMembers(c *gin.Context) {
	teamIds, scoped := scopeUserIDs(c)
	if scoped && len(teamIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 15
	}
	keyword := strings.TrimSpace(c.Query("keyword"))

	q := model.DB.Model(&model.User{})
	if scoped {
		q = q.Where("id IN ?", teamIds)
	}
	if keyword != "" {
		q = q.Where("username LIKE ? OR email LIKE ? OR display_name LIKE ?",
			"%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	}

	var total int64
	q.Count(&total)

	var users []model.User
	q.Select("id, username, display_name, email, `group`, quota, used_quota, request_count, status, created_time").
		Order("id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&users)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": users, "total": total})
}

// ============ Team Orders ============

func AgentListTeamOrders(c *gin.Context) {
	teamIds, scoped := scopeUserIDs(c)
	if scoped && len(teamIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 15
	}
	status := strings.TrimSpace(c.Query("status"))

	q := model.DB.Model(&model.Order{})
	if scoped {
		q = q.Where("user_id IN ?", teamIds)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	q.Count(&total)

	type row struct {
		model.Order
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	var list []row
	q.Select("orders.*, u.username, u.email").
		Joins("LEFT JOIN users u ON u.id = orders.user_id").
		Order("orders.id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Scan(&list)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "total": total})
}

// ============ Team Logs ============

func AgentListTeamLogs(c *gin.Context) {
	teamIds, scoped := scopeUserIDs(c)
	if scoped && len(teamIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 15
	}
	username := strings.TrimSpace(c.Query("username"))
	modelName := strings.TrimSpace(c.Query("model_name"))

	q := model.DB.Table("logs")
	if scoped {
		q = q.Where("user_id IN ?", teamIds)
	}
	if username != "" {
		q = q.Where("username LIKE ?", "%"+username+"%")
	}
	if modelName != "" {
		q = q.Where("model_name LIKE ?", "%"+modelName+"%")
	}

	var total int64
	q.Count(&total)

	var list []map[string]any
	q.Order("id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&list)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "total": total})
}

// ============ My Commissions ============

func AgentListMyCommissions(c *gin.Context) {
	selfId := c.GetInt("id")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 15
	}
	status := strings.TrimSpace(c.Query("status"))

	q := model.DB.Model(&model.Commission{}).Where("user_id = ?", selfId)
	if status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	q.Count(&total)

	// 统计：累计 / 待结算 / 已结算
	var totalAmt, pendingAmt, settledAmt float64
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status IN (?, ?)", selfId,
			model.CommissionStatusPending, model.CommissionStatusSettled).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalAmt)
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = ?", selfId, model.CommissionStatusPending).
		Select("COALESCE(SUM(amount), 0)").Scan(&pendingAmt)
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = ?", selfId, model.CommissionStatusSettled).
		Select("COALESCE(SUM(amount), 0)").Scan(&settledAmt)

	type row struct {
		model.Commission
		FromUsername string `json:"from_username"`
	}
	var list []row
	q.Select("commissions.*, u.username as from_username").
		Joins("LEFT JOIN users u ON u.id = commissions.from_user_id").
		Order("commissions.id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Scan(&list)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    list,
		"total":   total,
		"stats": gin.H{
			"total":   totalAmt,
			"pending": pendingAmt,
			"settled": settledAmt,
		},
	})
}
