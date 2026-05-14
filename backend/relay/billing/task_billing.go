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
