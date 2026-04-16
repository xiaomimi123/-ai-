package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

func GetNotices(c *gin.Context) {
	notices, err := model.GetActiveNotices()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": notices})
}

func AdminCreateNotice(c *gin.Context) {
	var notice model.Notice
	if err := c.ShouldBindJSON(&notice); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if err := model.CreateNotice(&notice); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": notice})
}

func AdminDeleteNotice(c *gin.Context) {
	id := c.Param("id")
	if err := model.DB.Delete(&model.Notice{}, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ====== 通知中心 ======

// GetUserNotifications 合并返回个人通知 + 最新系统公告 + 未读数
func GetUserNotifications(c *gin.Context) {
	userId := c.GetInt("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	const pageSize = 20

	var personal []model.UserNotification
	model.DB.Where("user_id = ?", userId).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&personal)

	// 注意：Notice 表字段是 is_active（int），不是 enabled
	var notices []model.Notice
	model.DB.Where("is_active = 1").
		Order("sort_order DESC, created_at DESC").
		Limit(5).
		Find(&notices)

	var unreadCount int64
	model.DB.Model(&model.UserNotification{}).
		Where("user_id = ? AND is_read = ?", userId, false).
		Count(&unreadCount)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"personal":     personal,
			"notices":      notices,
			"unread_count": unreadCount,
		},
	})
}

// MarkNotificationRead 标记已读；:id = "all" 代表全部
func MarkNotificationRead(c *gin.Context) {
	userId := c.GetInt("id")
	idStr := c.Param("id")

	if idStr == "all" {
		model.DB.Model(&model.UserNotification{}).
			Where("user_id = ? AND is_read = ?", userId, false).
			Update("is_read", true)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "已全部标为已读"})
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效 ID"})
		return
	}
	model.DB.Model(&model.UserNotification{}).
		Where("id = ? AND user_id = ?", id, userId).
		Update("is_read", true)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetUnreadCount 返回未读数，用于侧栏红点
func GetUnreadCount(c *gin.Context) {
	userId := c.GetInt("id")
	var count int64
	model.DB.Model(&model.UserNotification{}).
		Where("user_id = ? AND is_read = ?", userId, false).
		Count(&count)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": count})
}
