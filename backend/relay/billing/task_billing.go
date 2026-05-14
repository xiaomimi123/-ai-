package billing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

// TaskBilling implements the service.TaskBillingFn interface and owns the
// quota lifecycle for async tasks:
//
//	submit     →  PreConsumeTaskQuota   (debit user+token quota + audit log)
//	submit-err →  RefundTaskQuota       (credit user+token quota + audit log)
//	worker OK  →  TaskBilling.OnSuccess (mark SUCCESS + settle consume log)
//	worker ERR →  TaskBilling.OnFailure (mark FAILURE + refund)
//	admin pay  →  AdminRefundTask uses  RefundTaskQuota directly
//
// All quota mutations go through model.PreConsumeTokenQuota /
// model.PostConsumeTokenQuota so user.quota and token.remain_quota stay in
// sync (matching the synchronous /v1/chat/completions accounting path).
//
// Note on referral: model.RecordConsumeLog does NOT trigger commission
// distribution — DistributeCommission is wired exclusively to payment
// order completion (see controller/lingjing_pay.go). Task consumption
// therefore matches sync consumption: it does not generate referral
// commission. If/when referral on usage is desired, that change applies
// to the sync path first and this file second.

type TaskBilling struct{}

// NewTaskBilling returns a billing handler suitable for service.TickContext.
func NewTaskBilling() *TaskBilling { return &TaskBilling{} }

// PreConsumeTaskQuota reserves predicted quota when an async task is
// submitted. Uses model.PreConsumeTokenQuota which:
//   - checks user.quota and token.remain_quota,
//   - debits both atomically (or only user.quota if the token is unlimited),
//   - sends low-quota notifications when relevant.
//
// On insufficient-quota the error bubbles back to the controller, which
// surfaces it as HTTP 402. An audit log row is written (LogTypeManage,
// not LogTypeConsume) so the reservation appears in audit history without
// double-counting against usage dashboards once the settle log lands.
//
// quota <= 0 is treated as a no-op (free model / preview path).
func PreConsumeTaskQuota(userID, tokenID, channelID, quota int, modelName string) error {
	if userID == 0 {
		return errors.New("user_id required")
	}
	if quota <= 0 {
		return nil
	}
	if tokenID == 0 {
		// Defensive: PreConsumeTokenQuota requires a real token row.
		// Task submit always provides one via ctxkey.TokenId; reject otherwise.
		return errors.New("token_id required")
	}
	if err := model.PreConsumeTokenQuota(tokenID, int64(quota)); err != nil {
		return err
	}
	// Audit row. LogTypeManage so SumUsedQuota(LogTypeConsume) is not
	// inflated before settle lands in OnSuccess.
	model.RecordLog(context.Background(), userID, model.LogTypeManage,
		fmt.Sprintf("[async task pre-consume] model=%s channel=%d quota=%d",
			modelName, channelID, quota))
	return nil
}

// RefundTaskQuota credits back predicted quota when an async task fails to
// reach a successful terminal state (submit error, build-body error, user
// cancel, worker timeout, admin manual refund).
//
// Idempotency: callers may invoke this multiple times for the same task
// (e.g. submit-failed path + worker timeout reclaim if records cross).
// We dedupe via tasks.refund_log_id — the field is set to the audit log
// id on the first successful refund. Subsequent calls return nil without
// touching quota.
//
// quota is credited via model.PostConsumeTokenQuota with negative delta
// (mirroring relay/billing.ReturnPreConsumedQuota), so both user.quota and
// token.remain_quota are restored.
func RefundTaskQuota(userID, channelID, quota int, taskID, reason string) error {
	if userID == 0 || quota <= 0 {
		return nil
	}

	// Look up task to (a) get tokenID for full credit, (b) check idempotency.
	t, err := model.GetTaskByTaskID(taskID)
	if err != nil || t == nil {
		// Task row not yet created (very early failure in submit path,
		// before model.CreateTask succeeds). PreConsumeTokenQuota already
		// debited both user.quota and token.remain_quota, but we have no
		// task row to find tokenID — best-effort credit user.quota only.
		// This is a known edge case: the submit-failed callers happen
		// AFTER CreateTask in the controller, so this branch only fires
		// when CreateTask itself failed.
		if err := model.IncreaseUserQuota(userID, int64(quota)); err != nil {
			return fmt.Errorf("refund (user-only): %w", err)
		}
		model.RecordLog(context.Background(), userID, model.LogTypeManage,
			fmt.Sprintf("[async task refund pre-record] task=%s channel=%d quota=%d reason=%s",
				taskID, channelID, quota, reason))
		return nil
	}

	if t.RefundLogId > 0 {
		// Already refunded — no-op.
		logger.SysLog(fmt.Sprintf("task refund skipped (already refunded) task_id=%s refund_log_id=%d",
			taskID, t.RefundLogId))
		return nil
	}

	tokenID := t.PrivateData.TokenId
	if tokenID > 0 {
		// Negative delta restores both user and token quota.
		if err := model.PostConsumeTokenQuota(tokenID, int64(-quota)); err != nil {
			return fmt.Errorf("refund quota: %w", err)
		}
	} else {
		if err := model.IncreaseUserQuota(userID, int64(quota)); err != nil {
			return fmt.Errorf("refund user quota: %w", err)
		}
	}

	// Audit row — write directly so we can capture the row id and stamp
	// it onto tasks.refund_log_id for idempotency. LogTypeManage so the
	// refund doesn't inflate consumption dashboards.
	logRow := &model.Log{
		UserId:    userID,
		ChannelId: channelID,
		Type:      model.LogTypeManage,
		Quota:     quota, // positive = credit (refund)
		ModelName: t.Properties.OriginModelName,
		Content: fmt.Sprintf("[async task refund] task=%s reason=%s",
			taskID, reason),
		CreatedAt: time.Now().Unix(),
		TaskId:    taskID,
	}
	logRow.Username = model.GetUsernameById(userID)
	if dbErr := model.LOG_DB.Create(logRow).Error; dbErr != nil {
		logger.SysError("task refund: failed to record audit log: " + dbErr.Error())
	} else {
		// Stamp the refund_log_id on the task for idempotency on retries.
		if err := model.UpdateTaskStatus(model.DB, taskID, map[string]interface{}{
			"refund_log_id": logRow.Id,
		}); err != nil {
			logger.SysError("task refund: failed to stamp refund_log_id: " + err.Error())
		}
	}
	return nil
}

// OnSuccess is invoked by the worker (service/task_tick.go) when an
// upstream task reports a successful terminal state. It:
//
//  1. Idempotency: if the task is already SUCCESS, return nil.
//  2. Transition the row to SUCCESS with progress=100 and optional payload.
//  3. Write a LogTypeConsume audit row with TaskId set — this is the
//     actual "consumption happened" entry that powers usage dashboards.
//  4. Update used_quota counters (user.used_quota, channel.used_quota)
//     to match the sync /v1/images and /v1/chat post-consume bookkeeping.
//
// MVP scope: we settle at the pre-consumed quota (t.Quota). The
// upstream-actual-cost diff path (Task F2 deferred) will diff fetchData
// against t.Quota and Post/Refund the delta — wired here as a follow-up.
func (b *TaskBilling) OnSuccess(t *model.Task, fetchData []byte) error {
	if t == nil {
		return errors.New("task nil")
	}
	if t.Status == model.TaskStatusSuccess {
		return nil // idempotent
	}

	now := time.Now().Unix()
	updates := map[string]interface{}{
		"status":      model.TaskStatusSuccess,
		"finish_time": now,
		"progress":    "100",
		"fail_reason": "",
	}
	if len(fetchData) > 0 {
		updates["data"] = fetchData
	}
	if err := model.UpdateTaskStatus(model.DB, t.TaskID, updates); err != nil {
		return fmt.Errorf("task settle status: %w", err)
	}

	if t.Quota > 0 {
		// Settlement consume-log entry. Quota positive (debit already
		// happened in pre-consume). This is the row that feeds usage
		// dashboards via SumUsedQuota(LogTypeConsume).
		model.RecordConsumeLog(context.Background(), &model.Log{
			UserId:    t.UserId,
			ChannelId: t.ChannelId,
			ModelName: t.Properties.OriginModelName,
			Quota:     t.Quota,
			Content:   "[async task settle]",
			TaskId:    t.TaskID,
		})
		// Mirror sync path bookkeeping.
		model.UpdateUserUsedQuotaAndRequestCount(t.UserId, int64(t.Quota))
		model.UpdateChannelUsedQuota(t.ChannelId, int64(t.Quota))
	}

	logger.SysLog(fmt.Sprintf("task settle task_id=%s quota=%d", t.TaskID, t.Quota))
	return nil
}

// OnFailure is invoked by the worker on terminal failure paths (worker
// timeout reclaim, fetch max retries, upstream FAILURE status). It:
//
//  1. Idempotency: if the task is already in a terminal failure state
//     (FAILURE / TIMEOUT) AND the refund has already been issued
//     (refund_log_id > 0), return nil — no double refund.
//  2. Otherwise transition the row to FAILURE/TIMEOUT and refund via
//     RefundTaskQuota (which is itself idempotent via refund_log_id).
func (b *TaskBilling) OnFailure(t *model.Task, reason string) error {
	if t == nil {
		return errors.New("task nil")
	}

	terminalFailure := t.Status == model.TaskStatusFailure || t.Status == model.TaskStatusTimeout
	if terminalFailure && t.RefundLogId > 0 {
		// Already failed AND already refunded.
		return nil
	}

	// Use TIMEOUT status when the caller signaled timeout so reporting
	// distinguishes the two terminal-failure flavors.
	targetStatus := model.TaskStatusFailure
	if reason == "worker_timeout" {
		targetStatus = model.TaskStatusTimeout
	}

	if !terminalFailure {
		now := time.Now().Unix()
		updates := map[string]interface{}{
			"status":      targetStatus,
			"finish_time": now,
			"fail_reason": reason,
		}
		if err := model.UpdateTaskStatus(model.DB, t.TaskID, updates); err != nil {
			return fmt.Errorf("task failure status: %w", err)
		}
	}

	return RefundTaskQuota(t.UserId, t.ChannelId, t.Quota, t.TaskID, reason)
}
