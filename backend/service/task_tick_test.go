package service

import (
	"context"
	"testing"

	"github.com/songquanpeng/one-api/model"
	. "github.com/smartystreets/goconvey/convey"
)

// mockBilling captures calls on the TaskBillingFn interface so tests can
// verify the worker drives the expected lifecycle events.
type mockBilling struct {
	successCalls int
	failureCalls int
	lastReason   string
}

func (m *mockBilling) OnSuccess(t *model.Task, _ []byte) error {
	m.successCalls++
	return nil
}

func (m *mockBilling) OnFailure(t *model.Task, reason string) error {
	m.failureCalls++
	m.lastReason = reason
	return nil
}

func TestTickContext_interface_assembly(t *testing.T) {
	Convey("TickContext.BillingFn satisfies TaskBillingFn", t, func() {
		mb := &mockBilling{}
		tc := &TickContext{BillingFn: mb}
		So(tc.BillingFn, ShouldNotBeNil)

		// exercise via interface
		var iface TaskBillingFn = tc.BillingFn
		_ = iface.OnSuccess(&model.Task{}, nil)
		_ = iface.OnFailure(&model.Task{}, "reason")
		So(mb.successCalls, ShouldEqual, 1)
		So(mb.failureCalls, ShouldEqual, 1)
		So(mb.lastReason, ShouldEqual, "reason")
	})
}

// Note: Tick itself depends on model.DB and Redis being available, so it's
// covered by E2E tests in Phase I rather than a unit test here.

func TestMockBilling_implements_interface(t *testing.T) {
	Convey("mockBilling satisfies TaskBillingFn at compile time", t, func() {
		_ = context.Background()
		var _ TaskBillingFn = &mockBilling{}
		So(true, ShouldBeTrue)
	})
}
