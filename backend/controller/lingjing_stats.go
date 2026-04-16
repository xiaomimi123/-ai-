package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

func GetUserDashboardStats(c *gin.Context) {
	userId := c.GetInt("id")
	now := time.Now()

	type DailyUsage struct {
		Date        string `json:"date"`
		Quota       int64  `json:"quota"`
		Count       int64  `json:"count"`
		InputToken  int64  `json:"input_token"`
		OutputToken int64  `json:"output_token"`
	}

	var dailyUsage []DailyUsage
	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
		end := start.Add(24 * time.Hour)
		var quota, count, inputToken, outputToken int64
		model.DB.Model(&model.Log{}).
			Where("user_id = ? AND created_at >= ? AND created_at < ? AND type = 2", userId, start.Unix(), end.Unix()).
			Select("COALESCE(SUM(quota),0), COUNT(*), COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0)").
			Row().Scan(&quota, &count, &inputToken, &outputToken)
		dailyUsage = append(dailyUsage, DailyUsage{Date: day.Format("01/02"), Quota: quota, Count: count, InputToken: inputToken, OutputToken: outputToken})
	}

	type ModelUsage struct {
		Model string `json:"model"`
		Count int64  `json:"count"`
		Quota int64  `json:"quota"`
	}
	var modelUsage []ModelUsage
	weekAgo := now.AddDate(0, 0, -7).Unix()
	model.DB.Model(&model.Log{}).
		Where("user_id = ? AND created_at >= ? AND type = 2", userId, weekAgo).
		Select("model_name as model, COUNT(*) as count, COALESCE(SUM(quota),0) as quota").
		Group("model_name").Order("count DESC").Limit(8).Scan(&modelUsage)

	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	var todayCount, todayQuota int64
	model.DB.Model(&model.Log{}).Where("user_id = ? AND created_at >= ? AND type = 2", userId, todayStart).
		Select("COUNT(*), COALESCE(SUM(quota),0)").Row().Scan(&todayCount, &todayQuota)

	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()
	var monthCount, monthQuota int64
	model.DB.Model(&model.Log{}).Where("user_id = ? AND created_at >= ? AND type = 2", userId, monthStart).
		Select("COUNT(*), COALESCE(SUM(quota),0)").Row().Scan(&monthCount, &monthQuota)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"daily_usage": dailyUsage,
			"model_usage": modelUsage,
			"today":       gin.H{"count": todayCount, "quota": todayQuota, "cost": float64(todayQuota) / 500000.0},
			"month":       gin.H{"count": monthCount, "quota": monthQuota, "cost": float64(monthQuota) / 500000.0},
		},
	})
}

func GetAdminDashboardStats(c *gin.Context) {
	now := time.Now()

	var totalUsers int64
	model.DB.Model(&model.User{}).Count(&totalUsers)

	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	var todayNewUsers int64
	model.DB.Model(&model.User{}).Where("created_time >= ?", todayStart).Count(&todayNewUsers)

	type DailyRevenue struct {
		Date    string  `json:"date"`
		Revenue float64 `json:"revenue"`
		Count   int64   `json:"count"`
		Users   int64   `json:"users"`
	}
	var dailyRevenue []DailyRevenue
	for i := 29; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
		end := start.Add(24 * time.Hour)
		var quota, count, users int64
		model.DB.Model(&model.Log{}).
			Where("created_at >= ? AND created_at < ? AND type = 2", start.Unix(), end.Unix()).
			Select("COALESCE(SUM(quota),0), COUNT(*), COUNT(DISTINCT user_id)").
			Row().Scan(&quota, &count, &users)
		dailyRevenue = append(dailyRevenue, DailyRevenue{Date: day.Format("01/02"), Revenue: float64(quota) / 500000.0, Count: count, Users: users})
	}

	var totalCalls, totalQuota int64
	model.DB.Model(&model.Log{}).Where("type = 2").Select("COUNT(*), COALESCE(SUM(quota),0)").Row().Scan(&totalCalls, &totalQuota)

	var todayCalls, todayQuota int64
	model.DB.Model(&model.Log{}).Where("created_at >= ? AND type = 2", todayStart).Select("COUNT(*), COALESCE(SUM(quota),0)").Row().Scan(&todayCalls, &todayQuota)

	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()
	var monthCalls, monthQuota int64
	model.DB.Model(&model.Log{}).Where("created_at >= ? AND type = 2", monthStart).Select("COUNT(*), COALESCE(SUM(quota),0)").Row().Scan(&monthCalls, &monthQuota)

	type ModelRank struct {
		Model string `json:"model"`
		Count int64  `json:"count"`
		Quota int64  `json:"quota"`
		Users int64  `json:"users"`
	}
	weekAgo := now.AddDate(0, 0, -7).Unix()
	var modelRank []ModelRank
	model.DB.Model(&model.Log{}).Where("created_at >= ? AND type = 2", weekAgo).
		Select("model_name as model, COUNT(*) as count, COALESCE(SUM(quota),0) as quota, COUNT(DISTINCT user_id) as users").
		Group("model_name").Order("count DESC").Limit(10).Scan(&modelRank)

	type ChannelStat struct {
		Status int   `json:"status"`
		Count  int64 `json:"count"`
	}
	var channelStats []ChannelStat
	model.DB.Model(&model.Channel{}).Select("status, COUNT(*) as count").Group("status").Scan(&channelStats)

	type UserRank struct {
		UserId   int    `json:"user_id"`
		Username string `json:"username"`
		Quota    int64  `json:"quota"`
		Count    int64  `json:"count"`
	}
	var userRank []UserRank
	model.DB.Table("logs").Joins("JOIN users ON users.id = logs.user_id").
		Where("logs.created_at >= ? AND logs.type = 2", monthStart).
		Select("logs.user_id, users.username, COALESCE(SUM(logs.quota),0) as quota, COUNT(*) as count").
		Group("logs.user_id, users.username").Order("quota DESC").Limit(10).Scan(&userRank)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"summary": gin.H{
				"total_users": totalUsers, "today_new_users": todayNewUsers,
				"total_calls": totalCalls, "total_revenue": float64(totalQuota) / 500000.0,
				"today_calls": todayCalls, "today_revenue": float64(todayQuota) / 500000.0,
				"month_calls": monthCalls, "month_revenue": float64(monthQuota) / 500000.0,
			},
			"daily_revenue": dailyRevenue, "model_rank": modelRank,
			"channel_stats": channelStats, "user_rank": userRank,
		},
	})
}

func GetAdminRealtimeStats(c *gin.Context) {
	now := time.Now()
	oneHourAgo := now.Add(-1 * time.Hour).Unix()
	var hourCalls int64
	model.DB.Model(&model.Log{}).Where("created_at >= ? AND type = 2", oneHourAgo).Count(&hourCalls)
	var activeChannels int64
	model.DB.Model(&model.Channel{}).Where("status = 1").Count(&activeChannels)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"hour_calls": hourCalls, "active_channels": activeChannels, "timestamp": now.Unix()}})
}
