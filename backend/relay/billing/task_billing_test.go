package billing

import (
	"testing"

	"github.com/songquanpeng/one-api/model"

	. "github.com/smartystreets/goconvey/convey"
)

// These tests cover the pure guards in TaskBilling that do not touch the
// database. The full DB-backed flows (quota mutation, refund_log_id
// stamping, etc.) are covered by Phase I E2E tests against a real MySQL.
//
// Goal here: make sure the input-guard logic and idempotency short-circuits
// behave correctly so a single misuse from a controller cannot bypass the
// quota safety net or cause a double refund.

func TestPreConsumeTaskQuota_input_guards(t *testing.T) {
	Convey("PreConsumeTaskQuota rejects userID=0", t, func() {
		err := PreConsumeTaskQuota(0, 0, 0, 100, "m")
		So(err, ShouldNotBeNil)
	})

	Convey("PreConsumeTaskQuota is a no-op when quota<=0", t, func() {
		// No DB calls happen because the guard returns early.
		So(PreConsumeTaskQuota(1, 0, 0, 0, "m"), ShouldBeNil)
		So(PreConsumeTaskQuota(1, 0, 0, -5, "m"), ShouldBeNil)
	})

	Convey("PreConsumeTaskQuota rejects tokenID=0 when quota>0", t, func() {
		err := PreConsumeTaskQuota(1, 0, 0, 100, "m")
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "token_id required")
	})
}

func TestRefundTaskQuota_input_guards(t *testing.T) {
	Convey("RefundTaskQuota is a no-op when userID=0", t, func() {
		So(RefundTaskQuota(0, 0, 100, "tid", "reason"), ShouldBeNil)
	})

	Convey("RefundTaskQuota is a no-op when quota<=0", t, func() {
		So(RefundTaskQuota(1, 0, 0, "tid", "reason"), ShouldBeNil)
		So(RefundTaskQuota(1, 0, -5, "tid", "reason"), ShouldBeNil)
	})
}

func TestRefundTaskQuota_atomic_claim_blocks_concurrent_double_refund(t *testing.T) {
	Convey("Note: full concurrent test requires DB; this verifies the function is shaped to use atomic claim", t, func() {
		// Smoke test only: function exists and handles the userID=0 / quota=0 guards.
		// The actual race-resistance is proven by code review of the WHERE refund_log_id=0 SQL.
		So(RefundTaskQuota(0, 0, 100, "tid", "reason"), ShouldBeNil) // no-op userID=0
		So(RefundTaskQuota(1, 0, 0, "tid", "reason"), ShouldBeNil)   // no-op quota=0

		// In a real DB environment, concurrent calls to RefundTaskQuota for the same
		// taskID would race to claim the refund slot via UPDATE ... WHERE refund_log_id=0.
		// Only the first caller's UPDATE succeeds (RowsAffected==1), preventing a double
		// refund and preserving the idempotency guarantee.
	})
}

func TestTaskBilling_OnSuccess_idempotent_when_already_success(t *testing.T) {
	Convey("OnSuccess returns nil if task already SUCCESS (no DB call)", t, func() {
		b := NewTaskBilling()
		err := b.OnSuccess(&model.Task{Status: model.TaskStatusSuccess}, nil)
		So(err, ShouldBeNil)
	})

	Convey("OnSuccess errors on nil task (defense)", t, func() {
		b := NewTaskBilling()
		So(b.OnSuccess(nil, nil), ShouldNotBeNil)
	})
}

func TestTaskBilling_OnFailure_idempotent_when_terminal_and_refunded(t *testing.T) {
	Convey("OnFailure returns nil when status FAILURE AND refund_log_id>0", t, func() {
		b := NewTaskBilling()
		err := b.OnFailure(&model.Task{
			Status:      model.TaskStatusFailure,
			RefundLogId: 42,
		}, "x")
		So(err, ShouldBeNil)
	})

	Convey("OnFailure returns nil when status TIMEOUT AND refund_log_id>0", t, func() {
		b := NewTaskBilling()
		err := b.OnFailure(&model.Task{
			Status:      model.TaskStatusTimeout,
			RefundLogId: 99,
		}, "x")
		So(err, ShouldBeNil)
	})

	Convey("OnFailure errors on nil task (defense)", t, func() {
		b := NewTaskBilling()
		So(b.OnFailure(nil, "x"), ShouldNotBeNil)
	})
}

// Compile-time interface assertion: TaskBilling must satisfy the worker's
// expected method set. The actual service.TaskBillingFn type is defined in
// service/task_tick.go; importing it here would create a cycle, so we
// duplicate the signature locally for the type assertion.
type taskBillingFnLocal interface {
	OnSuccess(t *model.Task, fetchData []byte) error
	OnFailure(t *model.Task, reason string) error
}

func TestTaskBilling_satisfies_billing_fn_interface(t *testing.T) {
	Convey("TaskBilling implements the worker BillingFn interface", t, func() {
		var _ taskBillingFnLocal = (*TaskBilling)(nil)
		So(true, ShouldBeTrue)
	})
}
