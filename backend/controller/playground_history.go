package controller

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
)

// ListPlaygroundChats GET /api/lingjing/playground/chats?page=1&page_size=20
// 返回摘要（id/title/model/时间），不含 messages，前端拿到后单独拉详情
func ListPlaygroundChats(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	chats, total, err := model.ListPlaygroundChats(userId, (page-1)*pageSize, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"list":      chats,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// GetPlaygroundChat GET /api/lingjing/playground/chats/:id
// 返回完整消息数组（已解析 JSON）
func GetPlaygroundChat(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的 id"})
		return
	}
	chat, err := model.GetPlaygroundChatById(id, userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	// messages 存的是 JSON 字符串，为了前端直接用，这里解析回数组
	var messages []map[string]interface{}
	_ = json.Unmarshal([]byte(chat.Messages), &messages)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"id":         chat.Id,
			"title":      chat.Title,
			"model":      chat.Model,
			"messages":   messages,
			"created_at": chat.CreatedAt,
			"updated_at": chat.UpdatedAt,
		},
	})
}

// DeletePlaygroundChatHandler DELETE /api/lingjing/playground/chats/:id
func DeletePlaygroundChatHandler(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效的 id"})
		return
	}
	if err := model.DeletePlaygroundChat(id, userId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
