package controller

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/adaptor/task"
	taskcommon "github.com/songquanpeng/one-api/relay/adaptor/task/common"
	"github.com/songquanpeng/one-api/relay/billing"
)

// taskRequestBody is the subset of OpenAI-compatible image-generation fields
// the task framework cares about. Unknown fields stay in OriginalRequestBody
// for the adaptor to read directly if needed.
type taskRequestBody struct {
	Model      string   `json:"model"`
	Prompt     string   `json:"prompt"`
	N          int      `json:"n"`
	Size       string   `json:"size"`
	Resolution string   `json:"resolution"`
	ImageURLs  []string `json:"image_urls"`
}

// RelayTaskImage handles POST /v1/images/generations for async (task-based)
// channels. The dispatcher in controller.relay routes here when
// ENABLE_TASK_SYSTEM is on AND the selected channel.Type is async
// (task.IsAsyncTaskType). The sync path is untouched.
//
// Flow:
//  1. Read request body + middleware-set context (user/token/channel/group)
//  2. Look up channel for BaseURL/Key (selectAll=true so we get the Key)
//  3. Resolve adaptor via platform name
//  4. Build TaskRelayInfo, init + validate against the adaptor
//  5. Pre-consume quota (stub today; F1 makes it real)
//  6. Insert task row in NOT_START
//  7. BuildRequestBody → DoRequest → upstream task_id
//  8. Update task to SUBMITTED with upstream_task_id + raw response
//  9. Respond OpenAI-style {data: [{task_id, status}]}
//
// On any failure after pre-consume we refund (no-op today) and either fail
// the task row or skip creating it. Errors are best-effort logged; we never
// double-deduct quota.
func RelayTaskImage(c *gin.Context) {
	ctx := c.Request.Context()

	// 1. Parse request body. We keep the raw bytes so the adaptor can re-read
	//    any fields beyond our struct (e.g. quality, response_format).
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		errResp(c, http.StatusBadRequest, "invalid_request_error", "read body: "+err.Error())
		return
	}
	var req taskRequestBody
	if err := json.Unmarshal(raw, &req); err != nil {
		errResp(c, http.StatusBadRequest, "invalid_request_error", "bad json: "+err.Error())
		return
	}

	// 2. Read context (set by middleware.Distribute / TokenAuth).
	//    ctxkey constants verified in common/ctxkey/key.go:
	//      Id        → user id
	//      TokenId   → token id
	//      ChannelId → channel.Id
	//      Channel   → channel.Type
	//      Group     → user group
	userID := c.GetInt(ctxkey.Id)
	tokenID := c.GetInt(ctxkey.TokenId)
	channelID := c.GetInt(ctxkey.ChannelId)
	channelType := c.GetInt(ctxkey.Channel)
	group := c.GetString(ctxkey.Group)

	if channelID == 0 {
		errResp(c, http.StatusBadRequest, "no_channel",
			"no channel selected (middleware missing or model unsupported)")
		return
	}

	// 3. Look up the full channel row (selectAll=true → includes Key).
	channel, err := model.GetChannelById(channelID, true)
	if err != nil {
		errResp(c, http.StatusBadRequest, "channel_not_found", err.Error())
		return
	}

	// 4. Resolve adaptor. Should never be nil here because the dispatcher
	//    only routes us in when IsAsyncTaskType returned true, but be defensive.
	platform := task.PlatformOf(channelType)
	adaptor := task.AdaptorOf(platform)
	if adaptor == nil {
		errResp(c, http.StatusInternalServerError, "internal",
			"no adaptor for channel type "+strconv.Itoa(channelType))
		return
	}

	// Apply channel-level model_mapping (client model → upstream model). Reuse
	// the existing Channel.GetModelMapping() helper so we stay in sync with the
	// sync relay path and don't duplicate JSON parsing logic.
	upstreamModel := req.Model
	if mapping := channel.GetModelMapping(); mapping != nil {
		if mapped, ok := mapping[req.Model]; ok && mapped != "" {
			upstreamModel = mapped
		}
	}

	info := &taskcommon.TaskRelayInfo{
		UserID:              userID,
		TokenID:             tokenID,
		ChannelID:           channelID,
		BaseURL:             channel.GetBaseURL(),
		APIKey:              channel.Key,
		OriginModelName:     req.Model,
		UpstreamModelName:   upstreamModel,
		Prompt:              req.Prompt,
		Size:                req.Size,
		Resolution:          req.Resolution,
		N:                   req.N,
		ImageURLs:           req.ImageURLs,
		Group:               group,
		OriginalRequestBody: raw,
	}

	adaptor.Init(info)
	if err := adaptor.ValidateRequest(info); err != nil {
		errResp(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return
	}

	// 5. Pre-consume quota. Stub today (always nil); F1 will reject when
	//    user/token quota is insufficient. We compute the estimate here so
	//    F1 can swap the stub body without changing callers.
	//
	//    preLogID is the audit-log row id PreConsumeTaskQuota wrote. The
	//    row is created BEFORE we know taskUUID (since CreateTask runs
	//    later), so we backfill task_id on it after CreateTask succeeds.
	//    preLogID==0 means no log row exists (no-op path or insert failed).
	estimatedQuota := estimateImageQuota(req)
	preLogID, err := billing.PreConsumeTaskQuota(userID, tokenID, channelID, estimatedQuota, req.Model)
	if err != nil {
		errResp(c, http.StatusPaymentRequired, "insufficient_quota", err.Error())
		return
	}

	// 6. Create the task record up-front in NOT_START. We commit before
	//    talking to upstream so a slow/failed upstream call still leaves an
	//    audit trail the user can query (and the worker can timeout-reclaim).
	taskUUID := "task_" + uuid.New().String()
	timeoutAt := time.Now().Add(time.Duration(config.TaskTimeoutMinutes) * time.Minute).Unix()
	taskRecord := &model.Task{
		TaskID:    taskUUID,
		Platform:  platform,
		UserId:    userID,
		Group:     group,
		ChannelId: channelID,
		Quota:     estimatedQuota,
		Action:    "image_generations",
		Status:    model.TaskStatusNotStart,
		Properties: model.TaskProperties{
			Input:             req.Prompt,
			OriginModelName:   req.Model,
			UpstreamModelName: upstreamModel,
		},
		PrivateData: model.TaskPrivateData{TokenId: tokenID},
		TimeoutAt:   timeoutAt,
	}
	if err := model.CreateTask(taskRecord); err != nil {
		// Refund best-effort; today this is a no-op since PreConsume is a stub.
		_ = billing.RefundTaskQuota(userID, channelID, estimatedQuota, taskUUID, "create_task_failed")
		errResp(c, http.StatusInternalServerError, "internal", "create task: "+err.Error())
		return
	}

	// Backfill task_id on the pre-consume audit row now that taskUUID exists.
	// Best-effort: a failed UPDATE must not fail the request — the quota debit
	// and task row are already committed, and the audit row is still queryable
	// via user_id + channel_id + content + timestamp.
	if preLogID > 0 {
		if err := model.LOG_DB.Model(&model.Log{}).Where("id = ?", preLogID).Update("task_id", taskUUID).Error; err != nil {
			logger.SysError("backfill pre-consume task_id failed: " + err.Error())
		}
	}

	// 7. Submit to upstream.
	body, err := adaptor.BuildRequestBody(info)
	if err != nil {
		_ = model.UpdateTaskStatus(model.DB, taskUUID, map[string]interface{}{
			"status":      model.TaskStatusFailure,
			"fail_reason": "build_body: " + err.Error(),
			"finish_time": time.Now().Unix(),
		})
		_ = billing.RefundTaskQuota(userID, channelID, estimatedQuota, taskUUID, "build_body_failed")
		errResp(c, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	upstreamTaskID, rawResp, err := adaptor.DoRequest(info, body)
	if err != nil {
		_ = model.UpdateTaskStatus(model.DB, taskUUID, map[string]interface{}{
			"status":      model.TaskStatusFailure,
			"fail_reason": err.Error(),
			"finish_time": time.Now().Unix(),
		})
		_ = billing.RefundTaskQuota(userID, channelID, estimatedQuota, taskUUID, "submit_failed")
		errResp(c, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}

	// 8. Update task to SUBMITTED with upstream task_id + raw response.
	taskRecord.PrivateData.UpstreamTaskID = upstreamTaskID
	updates := map[string]interface{}{
		"status":       model.TaskStatusSubmitted,
		"submit_time":  time.Now().Unix(),
		"private_data": taskRecord.PrivateData,
	}
	if len(rawResp) > 0 && json.Valid(rawResp) {
		updates["data"] = json.RawMessage(rawResp)
	}
	if err := model.UpdateTaskStatus(model.DB, taskUUID, updates); err != nil {
		// Update failure is non-fatal: the task row exists, the worker will
		// pick it up via timeout/poll, and we have the upstream id logged.
		logger.Errorf(ctx, "RelayTaskImage update SUBMITTED failed task_id=%s err=%s", taskUUID, err.Error())
	}

	logger.SysLog("task submit task_id=" + taskUUID +
		" user_id=" + strconv.Itoa(userID) +
		" channel=" + strconv.Itoa(channelID) +
		" platform=" + platform +
		" upstream_task_id=" + upstreamTaskID +
		" quota=" + strconv.Itoa(estimatedQuota))

	// 9. Respond OpenAI-style.
	c.JSON(http.StatusOK, gin.H{
		"created": time.Now().Unix(),
		"data": []gin.H{
			{"task_id": taskUUID, "status": "submitted"},
		},
	})
}

// errResp writes a structured OpenAI-style error response.
func errResp(c *gin.Context, code int, typ, msg string) {
	c.JSON(code, gin.H{"error": gin.H{"message": msg, "type": typ}})
}

// estimateImageQuota returns a quota estimate for an async image-generation
// request before upstream submit.
//
// 计费约定：
//   - 图像模型在 model_prices.input_price 里存 "$ / 张"（USD per image）
//   - 项目内 quota 换算：1 USD = config.QuotaPerUnit quota（默认 500000）
//
// 因此 quotaPerImage = input_price × QuotaPerUnit。
// 当模型未在 model_prices 配置 / 配置价格 ≤ 0 / DB 查询失败时回退到 1024 quota/张
// 兜底（保持旧行为，避免发布过程中新模型零扣费）。
//
// 备注：这里只是 pre-consume 估算，真正按结算价扣费要等任务回调（F1+）。
func estimateImageQuota(req taskRequestBody) int {
	n := req.N
	if n <= 0 {
		n = 1
	}
	const fallbackPerImage = 1024

	price, err := model.GetModelPriceByModelID(req.Model)
	if err != nil || price == nil || price.InputPrice <= 0 {
		// 兜底：未配置或查询失败时维持旧行为 1024/张，记录一行 SysLog 方便排查
		if req.Model != "" {
			logger.SysLog("estimateImageQuota: no price config for model=" + req.Model + ", fallback to 1024/image")
		}
		return fallbackPerImage * n
	}

	quotaPerImage := int(price.InputPrice * config.QuotaPerUnit)
	if quotaPerImage <= 0 {
		quotaPerImage = fallbackPerImage
	}
	return quotaPerImage * n
}

// shouldDispatchToTaskRelay decides whether the current image-generation
// request should be routed to the async task framework instead of the
// existing synchronous image relay flow.
//
// It returns true only when BOTH conditions hold:
//   - the ENABLE_TASK_SYSTEM feature flag is on, AND
//   - the channel selected by middleware has an async task type
//     (see relay/adaptor/task.IsAsyncTaskType).
//
// When the flag is off, this MUST return false unconditionally so the sync
// path remains byte-level equivalent to pre-feature behavior.
func shouldDispatchToTaskRelay(c *gin.Context, enabled bool) bool {
	if !enabled {
		return false
	}
	// distributor middleware stores channel.Type under ctxkey.Channel.
	return task.IsAsyncTaskType(c.GetInt(ctxkey.Channel))
}

// shouldDispatchToTaskRelayFromConfig is the production wrapper that reads
// the live feature flag from config. Kept separate from shouldDispatchToTaskRelay
// so the decision logic stays unit-testable without touching package globals.
func shouldDispatchToTaskRelayFromConfig(c *gin.Context) bool {
	return shouldDispatchToTaskRelay(c, config.EnableTaskSystem)
}
