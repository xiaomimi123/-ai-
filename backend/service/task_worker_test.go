package service

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	. "github.com/smartystreets/goconvey/convey"
)

func TestTaskWorker_start_then_stop(t *testing.T) {
	Convey("Start then Stop runs the tick at least once and exits cleanly", t, func() {
		var fired atomic.Int32
		w := NewTaskWorker(50*time.Millisecond, 10, func(context.Context) {
			fired.Add(1)
		})
		w.Start()
		time.Sleep(180 * time.Millisecond)
		w.Stop()
		So(w.IsStopped(), ShouldBeTrue)
		So(fired.Load(), ShouldBeGreaterThanOrEqualTo, 1)
	})
}

func TestTaskWorker_tick_invoked_multiple_times(t *testing.T) {
	Convey("Worker ticks roughly at the configured interval", t, func() {
		var fired atomic.Int32
		w := NewTaskWorker(40*time.Millisecond, 10, func(context.Context) {
			fired.Add(1)
		})
		w.Start()
		time.Sleep(170 * time.Millisecond)
		w.Stop()
		// ~4 ticks in 170ms but we allow drift; assert >=3
		So(fired.Load(), ShouldBeGreaterThanOrEqualTo, int32(3))
	})
}

func TestTaskWorker_panic_recovered(t *testing.T) {
	Convey("Panic in tick is recovered; worker keeps going", t, func() {
		var ticks atomic.Int32
		w := NewTaskWorker(30*time.Millisecond, 10, func(context.Context) {
			n := ticks.Add(1)
			if n == 1 {
				panic("simulated tick panic")
			}
		})
		w.Start()
		time.Sleep(150 * time.Millisecond)
		w.Stop()
		So(ticks.Load(), ShouldBeGreaterThan, int32(1))
	})
}

func TestTaskWorker_idempotent_stop(t *testing.T) {
	Convey("Stop is idempotent (calling twice does not deadlock or panic)", t, func() {
		w := NewTaskWorker(50*time.Millisecond, 10, func(context.Context) {})
		w.Start()
		time.Sleep(80 * time.Millisecond)
		w.Stop()
		w.Stop() // must not block / panic
		So(w.IsStopped(), ShouldBeTrue)
	})
}
