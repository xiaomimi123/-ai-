package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/billing"
)

// AdminListTasks handles GET /api/admin/tasks
// Query params: p (page), page_size, platform, status, user_id, keyword
func AdminListTasks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("p", "0"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize > 100 {
		pageSize = 100
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if page < 0 {
		page = 0
	}
	platform := c.Query("platform")
	status := c.Query("status")
	userIDStr := c.Query("user_id")
	keyword := c.Query("keyword")

	q := model.DB.Model(&model.Task{})
	if platform != "" {
		q = q.Where("platform = ?", platform)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if userIDStr != "" {
		if uid, err := strconv.Atoi(userIDStr); err == nil {
			q = q.Where("user_id = ?", uid)
		}
	}
	if keyword != "" {
		q = q.Where("task_id LIKE ?", "%"+keyword+"%")
	}

	var total int64
	q.Count(&total)
	var rows []model.Task
	q.Order("created_at DESC").Limit(pageSize).Offset(page * pageSize).Find(&rows)

	c.JSON(http.StatusOK, gin.H{
		"data":      rows,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// AdminGetTask handles GET /api/admin/tasks/:id
func AdminGetTask(c *gin.Context) {
	t, err := model.GetTaskByTaskID(c.Param("id"))
	if err != nil || t == nil {
		errResp(c, http.StatusNotFound, "not_found_error", "task not found")
		return
	}
	c.JSON(http.StatusOK, t)
}

// AdminRetryTask handles POST /api/admin/tasks/:id/retry
// Only FAILURE/TIMEOUT can be retried.
func AdminRetryTask(c *gin.Context) {
	t, err := model.GetTaskByTaskID(c.Param("id"))
	if err != nil || t == nil {
		errResp(c, http.StatusNotFound, "not_found_error", "task not found")
		return
	}
	if t.Status != model.TaskStatusFailure && t.Status != model.TaskStatusTimeout {
		errResp(c, http.StatusBadRequest, "invalid_state",
			"only FAILURE or TIMEOUT tasks can be retried (got "+string(t.Status)+")")
		return
	}

	// Reset to SUBMITTED so worker picks it back up. Extend timeout.
	newTimeoutAt := time.Now().Add(time.Duration(config.TaskTimeoutMinutes) * time.Minute).Unix()
	updates := map[string]interface{}{
		"status":      model.TaskStatusSubmitted,
		"fail_reason": "",
		"finish_time": int64(0),
		"timeout_at":  newTimeoutAt,
	}
	if err := model.UpdateTaskStatus(model.DB, t.TaskID, updates); err != nil {
		errResp(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": t.TaskID, "status": "submitted"})
}

// AdminRefundTask handles POST /api/admin/tasks/:id/refund
// Only SUCCESS can be manually refunded (post-success customer complaints).
// Body: {"reason": "string"} required.
func AdminRefundTask(c *gin.Context) {
	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.Reason == "" {
		errResp(c, http.StatusBadRequest, "invalid_request_error", "reason required")
		return
	}

	t, err := model.GetTaskByTaskID(c.Param("id"))
	if err != nil || t == nil {
		errResp(c, http.StatusNotFound, "not_found_error", "task not found")
		return
	}
	if t.Status != model.TaskStatusSuccess {
		errResp(c, http.StatusBadRequest, "invalid_state",
			"only SUCCESS tasks can be manually refunded (got "+string(t.Status)+")")
		return
	}

	// Mark refunded via FAILURE transition with admin reason; call billing.
	reason := "admin_manual_refund: " + req.Reason
	_ = model.UpdateTaskStatus(model.DB, t.TaskID, map[string]interface{}{
		"status":      model.TaskStatusFailure,
		"fail_reason": reason,
	})
	if err := billing.RefundTaskQuota(t.UserId, t.ChannelId, t.Quota, t.TaskID, reason); err != nil {
		errResp(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": t.TaskID, "status": "refunded"})
}
