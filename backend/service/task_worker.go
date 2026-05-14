package service

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/songquanpeng/one-api/common/logger"
)

// TaskWorker runs a periodic tick function in a single goroutine.
// Used by the async task system to poll upstream for pending tasks.
type TaskWorker struct {
	interval  time.Duration
	batchSize int
	tickFn    func(ctx context.Context)

	stopCh    chan struct{}
	stoppedCh chan struct{}
	stopped   atomic.Bool
	startOnce sync.Once
	stopOnce  sync.Once
}

// NewTaskWorker constructs a worker; call Start to begin the loop.
// batchSize is exposed for tick functions that need to limit work per tick.
func NewTaskWorker(interval time.Duration, batchSize int, tick func(context.Context)) *TaskWorker {
	return &TaskWorker{
		interval:  interval,
		batchSize: batchSize,
		tickFn:    tick,
		stopCh:    make(chan struct{}),
		stoppedCh: make(chan struct{}),
	}
}

// Start launches the loop goroutine. Safe to call exactly once;
// subsequent calls are no-ops.
func (w *TaskWorker) Start() {
	w.startOnce.Do(func() {
		go w.loop()
	})
}

// Stop signals the loop to exit and waits for it. Safe to call multiple times.
func (w *TaskWorker) Stop() {
	w.stopOnce.Do(func() {
		close(w.stopCh)
		<-w.stoppedCh
	})
}

// BatchSize exposes the configured batch size to tick functions.
func (w *TaskWorker) BatchSize() int { return w.batchSize }

// IsStopped reports whether the loop has exited.
func (w *TaskWorker) IsStopped() bool { return w.stopped.Load() }

func (w *TaskWorker) loop() {
	defer func() {
		w.stopped.Store(true)
		close(w.stoppedCh)
	}()
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			logger.SysLog("task worker stopped")
			return
		case <-ticker.C:
			w.runTick()
		}
	}
}

// runTick invokes the tick function with a timeout context and recovers panics.
func (w *TaskWorker) runTick() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*w.interval)
	defer cancel()
	defer func() {
		if r := recover(); r != nil {
			logger.SysError("task worker tick panic recovered")
		}
	}()
	w.tickFn(ctx)
}
