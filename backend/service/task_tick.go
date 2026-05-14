package service

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/adaptor/task"
	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

// TaskBillingFn is called by the worker on terminal state transitions.
// Implementation is provided by relay/billing in Task F1; for now main.go
// will pass a stub that does nothing.
type TaskBillingFn interface {
	OnSuccess(t *model.Task, fetchData []byte) error
	OnFailure(t *model.Task, reason string) error
}

// TickContext is the dependency-injection bundle a tick needs.
type TickContext struct {
	ErrorCounter *TaskErrorCounter
	BillingFn    TaskBillingFn
}

// taskFetchConcurrency caps per-platform fan-out so a single slow upstream
// cannot starve the others. Per Task D4 plan: 5 concurrent FetchTask calls
// per platform per tick.
const taskFetchConcurrency = 5

// Tick is the unit of work the worker runs on its interval.
// The worker invokes Tick serially (one inflight at a time); inside Tick
// we do bounded concurrent FetchTask calls per platform.
func Tick(ctx context.Context, tc *TickContext) {
	// 1. Reclaim timed-out tasks (turn them into FAILURE + refund via billing)
	timeoutTasks, err := model.ListTimeoutTasks(config.TaskWorkerBatchSize)
	if err != nil {
		logger.SysError("list timeout tasks: " + err.Error())
	} else {
		for i := range timeoutTasks {
			t := &timeoutTasks[i]
			logger.SysLog("task timeout reclaim task_id=" + t.TaskID)
			if tc.BillingFn != nil {
				_ = tc.BillingFn.OnFailure(t, "worker_timeout")
			}
		}
	}

	// 2. Fetch pending tasks (grouped by platform, capped per-platform concurrency)
	pending, err := model.ListPendingTasks(config.TaskWorkerBatchSize)
	if err != nil {
		logger.SysError("list pending tasks: " + err.Error())
		return
	}

	groups := map[string][]model.Task{}
	for _, t := range pending {
		groups[t.Platform] = append(groups[t.Platform], t)
	}

	var wg sync.WaitGroup
	for platform, ts := range groups {
		wg.Add(1)
		go func(p string, tasks []model.Task) {
			defer wg.Done()
			sem := make(chan struct{}, taskFetchConcurrency)
			var iwg sync.WaitGroup
			for i := range tasks {
				tk := tasks[i] // capture by value
				sem <- struct{}{}
				iwg.Add(1)
				go func(tk model.Task) {
					defer func() {
						<-sem
						iwg.Done()
					}()
					fetchOne(ctx, &tk, tc)
				}(tk)
			}
			iwg.Wait()
		}(platform, ts)
	}
	wg.Wait()

	// 3. Daily cleanup window (hour==3 and minute==0). The worker interval is
	// short enough (default 5s) that this minute can match multiple ticks; the
	// underlying DELETE is idempotent (old rows already gone after first hit).
	clock := time.Now()
	if clock.Hour() == 3 && clock.Minute() == 0 {
		if n, err := model.CleanOldTasks(config.TaskRetentionDays); err == nil && n > 0 {
			logger.SysLog("task cleanup removed " + strconv.FormatInt(n, 10) + " old records")
		} else if err != nil {
			logger.SysError("task cleanup: " + err.Error())
		}
	}
}

// fetchOne polls upstream for one task and applies state transitions.
// On adaptor error, it bumps the Redis error counter and force-fails after
// config.TaskMaxFetchErrors consecutive failures.
func fetchOne(ctx context.Context, t *model.Task, tc *TickContext) {
	// selectAll=true: we need channel.Key for upstream auth, which is
	// Omit'd by default in GetChannelById.
	channel, err := model.GetChannelById(t.ChannelId, true)
	if err != nil {
		// Channel disappeared — treat as upstream-not-reachable; bump counter
		if tc.ErrorCounter != nil {
			_, _ = tc.ErrorCounter.Increment(t.TaskID)
		}
		logger.SysError("task fetch: missing channel task_id=" + t.TaskID +
			" channel_id=" + strconv.Itoa(t.ChannelId) + " err=" + err.Error())
		return
	}

	adaptor := task.AdaptorOf(t.Platform)
	if adaptor == nil {
		logger.SysError("task fetch: no adaptor for platform " + t.Platform)
		return
	}

	info := &common.TaskRelayInfo{
		UserID:    t.UserId,
		ChannelID: t.ChannelId,
		BaseURL:   channel.GetBaseURL(),
		APIKey:    channel.Key,
	}
	adaptor.Init(info)

	res, err := adaptor.FetchTask(info, t.PrivateData.UpstreamTaskID)
	if err != nil {
		var n int64
		if tc.ErrorCounter != nil {
			n, _ = tc.ErrorCounter.Increment(t.TaskID)
		}
		logger.SysError("task fetch error task_id=" + t.TaskID +
			" attempt=" + strconv.FormatInt(n, 10) + "/" + strconv.Itoa(config.TaskMaxFetchErrors) +
			" err=" + err.Error())
		if int(n) >= config.TaskMaxFetchErrors {
			if tc.BillingFn != nil {
				_ = tc.BillingFn.OnFailure(t, "fetch_max_retries: "+err.Error())
			}
			if tc.ErrorCounter != nil {
				_ = tc.ErrorCounter.Reset(t.TaskID)
			}
		}
		return
	}

	// Non-error fetch: reset the error counter; the upstream is talking again.
	if tc.ErrorCounter != nil {
		_ = tc.ErrorCounter.Reset(t.TaskID)
	}

	switch res.Status {
	case "completed":
		logger.SysLog("task done task_id=" + t.TaskID + " status=success")
		if tc.BillingFn != nil {
			_ = tc.BillingFn.OnSuccess(t, res.Result)
		}
	case "failed":
		logger.SysLog("task done task_id=" + t.TaskID + " status=failure reason=" + res.FailReason)
		if tc.BillingFn != nil {
			_ = tc.BillingFn.OnFailure(t, res.FailReason)
		}
	case "processing":
		_ = model.UpdateTaskStatus(model.DB, t.TaskID, map[string]interface{}{
			"status":   model.TaskStatusInProgress,
			"progress": res.Progress,
		})
	case "queued":
		_ = model.UpdateTaskStatus(model.DB, t.TaskID, map[string]interface{}{
			"status": model.TaskStatusQueued,
		})
	}
	_ = ctx // reserved for future cancellation wiring
}
