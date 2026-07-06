package common

import (
	"context"
	"errors"
	"testing"
	"time"

	. "github.com/smartystreets/goconvey/convey"
)

// scriptedAdaptor 让 FetchTask 按调用顺序返回预设序列的 (result, err)。
// 超出脚本长度后重复最后一条，防止 waiter 因意外多轮询而 panic。
type scriptedAdaptor struct {
	stubAdaptor
	script    []scriptStep
	callCount int
}

type scriptStep struct {
	res *FetchResult
	err error
}

func (s *scriptedAdaptor) FetchTask(info *TaskRelayInfo, taskID string) (*FetchResult, error) {
	step := s.script[len(s.script)-1]
	if s.callCount < len(s.script) {
		step = s.script[s.callCount]
	}
	s.callCount++
	return step.res, step.err
}

func TestWaitForTaskCompletion_returnsImagesWhenCompleted(t *testing.T) {
	Convey("returns Images immediately when first poll is completed", t, func() {
		a := &scriptedAdaptor{script: []scriptStep{
			{res: &FetchResult{Status: "completed", Images: []string{"u1", "u2"}}},
		}}
		fr, err := WaitForTaskCompletion(context.Background(), a, &TaskRelayInfo{}, "task_x", 5*time.Second, 10*time.Millisecond)
		So(err, ShouldBeNil)
		So(fr.Status, ShouldEqual, "completed")
		So(fr.Images, ShouldResemble, []string{"u1", "u2"})
		So(a.callCount, ShouldEqual, 1)
	})

	Convey("polls through processing states until completed", t, func() {
		a := &scriptedAdaptor{script: []scriptStep{
			{res: &FetchResult{Status: "processing", Progress: "10"}},
			{res: &FetchResult{Status: "processing", Progress: "60"}},
			{res: &FetchResult{Status: "completed", Images: []string{"done"}}},
		}}
		fr, err := WaitForTaskCompletion(context.Background(), a, &TaskRelayInfo{}, "task_x", 5*time.Second, 5*time.Millisecond)
		So(err, ShouldBeNil)
		So(fr.Images, ShouldResemble, []string{"done"})
		So(a.callCount, ShouldEqual, 3)
	})
}

func TestWaitForTaskCompletion_failedReturnsErrorWithReason(t *testing.T) {
	Convey("failed status → error message contains FailReason", t, func() {
		a := &scriptedAdaptor{script: []scriptStep{
			{res: &FetchResult{Status: "failed", FailReason: "upstream ran out of quota"}},
		}}
		fr, err := WaitForTaskCompletion(context.Background(), a, &TaskRelayInfo{}, "task_x", 5*time.Second, 10*time.Millisecond)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "upstream ran out of quota")
		So(fr, ShouldNotBeNil)
		So(fr.Status, ShouldEqual, "failed")
	})
}

func TestWaitForTaskCompletion_timeoutReturnsErrTaskWaitTimeout(t *testing.T) {
	Convey("stuck on processing → returns ErrTaskWaitTimeout with last FetchResult", t, func() {
		a := &scriptedAdaptor{script: []scriptStep{
			{res: &FetchResult{Status: "processing", Progress: "20"}},
		}}
		fr, err := WaitForTaskCompletion(context.Background(), a, &TaskRelayInfo{}, "task_x", 40*time.Millisecond, 5*time.Millisecond)
		So(errors.Is(err, ErrTaskWaitTimeout), ShouldBeTrue)
		So(fr, ShouldNotBeNil)
		So(fr.Status, ShouldEqual, "processing")
		So(a.callCount, ShouldBeGreaterThanOrEqualTo, 2) // must have polled at least twice before timeout
	})
}

func TestWaitForTaskCompletion_respectsContextCancellation(t *testing.T) {
	Convey("ctx cancellation propagates immediately", t, func() {
		a := &scriptedAdaptor{script: []scriptStep{
			{res: &FetchResult{Status: "processing"}},
		}}
		ctx, cancel := context.WithCancel(context.Background())
		cancel() // pre-cancel
		_, err := WaitForTaskCompletion(ctx, a, &TaskRelayInfo{}, "task_x", 5*time.Second, 10*time.Millisecond)
		So(errors.Is(err, context.Canceled), ShouldBeTrue)
	})
}

func TestWaitForTaskCompletion_fetchErrorRetriesThenBubbles(t *testing.T) {
	Convey("transient fetch errors retry silently, terminal fetch errors bubble after timeout", t, func() {
		a := &scriptedAdaptor{script: []scriptStep{
			{err: errors.New("network flake")},
			{res: &FetchResult{Status: "completed", Images: []string{"ok"}}},
		}}
		fr, err := WaitForTaskCompletion(context.Background(), a, &TaskRelayInfo{}, "task_x", 500*time.Millisecond, 5*time.Millisecond)
		So(err, ShouldBeNil)
		So(fr.Images, ShouldResemble, []string{"ok"})
	})
}
