package controller

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/billing"
)

// GetTask handles GET /v1/tasks/:id — returns a single task in OpenAI-style
// JSON for the requesting user. Admins (role >= model.RoleAdminUser) may
// fetch tasks belonging to any user; ordinary users are scoped to their own
// tasks via model.GetUserTask.
//
// Routes are wired in E5. errResp is shared with task_relay.go (E2).
func GetTask(c *gin.Context) {
	taskID := c.Param("id")
	userID := c.GetInt(ctxkey.Id)

	var t *model.Task
	var err error
	if isAdminRequest(c) {
		t, err = model.GetTaskByTaskID(taskID)
	} else {
		t, err = model.GetUserTask(userID, taskID)
	}
	if err != nil || t == nil {
		errResp(c, http.StatusNotFound, "not_found_error", "task not found or expired")
		return
	}
	c.JSON(http.StatusOK, taskToOpenAIView(t))
}

// GetTasksBatch handles POST /v1/tasks/batch — batched lookup of up to 50
// task ids. Non-admin callers only see tasks they own (user_id filter).
// Returns {"data": [<task view>, ...]} with tasks in unspecified order;
// missing ids are silently skipped (clients diff against their request set).
func GetTasksBatch(c *gin.Context) {
	var req struct {
		TaskIDs []string `json:"task_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.TaskIDs) == 0 {
		errResp(c, http.StatusBadRequest, "invalid_request_error", "task_ids required")
		return
	}
	if len(req.TaskIDs) > 50 {
		errResp(c, http.StatusBadRequest, "invalid_request_error", "max 50 task_ids per batch")
		return
	}

	userID := c.GetInt(ctxkey.Id)

	var tasks []model.Task
	q := model.DB.Where("task_id IN ?", req.TaskIDs)
	if !isAdminRequest(c) {
		q = q.Where("user_id = ?", userID)
	}
	q.Find(&tasks)

	out := make([]gin.H, 0, len(tasks))
	for i := range tasks {
		out = append(out, taskToOpenAIView(&tasks[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// CancelTask handles POST /v1/tasks/:id/cancel — marks an in-flight task as
// FAILURE with reason "user_canceled" so the worker stops polling, and
// refunds the predicted quota via billing.RefundTaskQuota (stub today;
// F1 wires real quota refund + audit row).
//
// Only cancelable states (NOT_START/SUBMITTED/QUEUED/IN_PROGRESS/UNKNOWN)
// transition; terminal states (SUCCESS/FAILURE/TIMEOUT) reject with 400.
func CancelTask(c *gin.Context) {
	taskID := c.Param("id")
	userID := c.GetInt(ctxkey.Id)

	var t *model.Task
	var err error
	if isAdminRequest(c) {
		t, err = model.GetTaskByTaskID(taskID)
	} else {
		t, err = model.GetUserTask(userID, taskID)
	}
	if err != nil || t == nil {
		errResp(c, http.StatusNotFound, "not_found_error", "task not found")
		return
	}

	switch t.Status {
	case model.TaskStatusNotStart, model.TaskStatusSubmitted,
		model.TaskStatusQueued, model.TaskStatusInProgress, model.TaskStatusUnknown:
		// cancelable; fall through
	default:
		errResp(c, http.StatusBadRequest, "invalid_state",
			"task in state "+string(t.Status)+" cannot be canceled")
		return
	}

	// Mark FAILURE with user_canceled reason; refund predicted quota.
	// Worker filters on non-terminal status so this stops further polling.
	_ = model.UpdateTaskStatus(model.DB, taskID, map[string]interface{}{
		"status":      model.TaskStatusFailure,
		"fail_reason": "user_canceled",
	})
	_ = billing.RefundTaskQuota(t.UserId, t.ChannelId, t.Quota, taskID, "user_canceled")

	c.JSON(http.StatusOK, gin.H{"id": taskID, "status": "canceled"})
}

// taskToOpenAIView projects an internal model.Task into an OpenAI-shaped
// response envelope. Status names are flattened to the OpenAI vocabulary
// (queued / submitted / in_progress / completed / failed) so the SDK can
// reuse its image-generation polling helpers.
func taskToOpenAIView(t *model.Task) gin.H {
	var status string
	switch t.Status {
	case model.TaskStatusSuccess:
		status = "completed"
	case model.TaskStatusFailure, model.TaskStatusTimeout:
		status = "failed"
	case model.TaskStatusInProgress:
		status = "in_progress"
	case model.TaskStatusQueued, model.TaskStatusUnknown:
		status = "queued"
	case model.TaskStatusSubmitted, model.TaskStatusNotStart:
		status = "submitted"
	default:
		status = "submitted"
	}

	progress := 0
	if t.Progress != "" {
		_, _ = fmt.Sscanf(t.Progress, "%d", &progress)
	}

	view := gin.H{
		"id":           t.TaskID,
		"object":       "task",
		"status":       status,
		"progress":     progress,
		"created_at":   t.CreatedAt,
		"started_at":   t.StartTime,
		"completed_at": t.FinishTime,
		"model":        t.Properties.OriginModelName,
	}

	if t.Status == model.TaskStatusSuccess && len(t.Data) > 0 {
		// Pass-through raw upstream data; clients parse per-platform.
		view["result"] = gin.H{"raw": t.Data}
		view["usage"] = gin.H{
			"cost_quota": t.Quota,
			// 500_000 quota per USD matches the modelRatio convention
			// documented in feedback_oneapi_field_semantics — F1 may
			// recompute usage from the actual billing row.
			"cost_usd": float64(t.Quota) / 500000.0,
		}
	}
	if status == "failed" {
		view["error"] = gin.H{"message": t.FailReason}
	}
	return view
}

// isAdminRequest reports whether the current request is from an admin user,
// using the role set by middleware/auth.go authHelper (c.Set("role", role)).
// Pattern mirrors controller/user.go which reads c.GetInt(ctxkey.Role) and
// compares against model.RoleAdminUser (= 10).
func isAdminRequest(c *gin.Context) bool {
	return c.GetInt(ctxkey.Role) >= model.RoleAdminUser
}
