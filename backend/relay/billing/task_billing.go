package billing

import (
	"github.com/songquanpeng/one-api/model"
)

// TaskBilling is a no-op stub for the async task billing logic.
// Real implementation lands in Task F1; this lets main.go compile against
// the service.TaskBillingFn interface without circular dependencies.
type TaskBilling struct{}

// NewTaskBilling returns a stub TaskBilling. Phase F will replace its methods
// with real consume/refund logic against quota_log + referral.
func NewTaskBilling() *TaskBilling { return &TaskBilling{} }

func (b *TaskBilling) OnSuccess(t *model.Task, _ []byte) error { return nil }
func (b *TaskBilling) OnFailure(t *model.Task, _ string) error { return nil }

// PreConsumeTaskQuota is a no-op stub for the async task submit path
// (called by controller.RelayTaskImage). Real implementation lands in
// Task F1 — it will reserve quota against user/token and return
// insufficient-quota errors. Returning nil today is intentional and safe
// for E2 because pre-consume is gated behind the ENABLE_TASK_SYSTEM
// feature flag, which is off in production.
func PreConsumeTaskQuota(userID, tokenID, channelID, quota int, modelName string) error {
	return nil
}

// RefundTaskQuota is a no-op stub for the async task submit path
// (called by controller.RelayTaskImage on submit-failure rollback).
// Real implementation lands in Task F1 — it will refund quota and write
// a quota_log audit row. Returning nil today is safe because PreConsume
// is also a no-op; nothing was actually deducted to refund.
func RefundTaskQuota(userID, channelID, quota int, taskID, reason string) error {
	return nil
}
