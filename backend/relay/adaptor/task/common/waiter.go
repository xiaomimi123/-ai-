package common

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// ErrTaskWaitTimeout 表示 WaitForTaskCompletion 在指定 timeout 内没有拿到
// 终态。调用方（sync-mode relay）看到这个错误应回落到"返回 task_id 让客户
// 端自己 poll"的降级路径，而不是给客户端 504。
var ErrTaskWaitTimeout = errors.New("task wait timeout")

// WaitForTaskCompletion 反复调 adaptor.FetchTask 直到任务终态或超时。
//
//   - completed → (fr, nil)，Images 已由 adaptor 抽好
//   - failed    → (fr, error)，error 消息含上游 FailReason
//   - 超时      → (last fr, ErrTaskWaitTimeout)，last fr 是最后一次成功轮询到的状态
//   - ctx 取消  → (nil, ctx.Err())
//
// 轮询期间的瞬时错误（网络抖动、上游 502）不立刻返回，被 sleep 掩掉，
// 直到成功一次或触发 timeout。这与线上的 apimart 行为一致（其自身 CDN
// 偶发 5xx 但重试即恢复）。
func WaitForTaskCompletion(
	ctx context.Context,
	adaptor TaskAdaptor,
	info *TaskRelayInfo,
	taskID string,
	timeout time.Duration,
	pollInterval time.Duration,
) (*FetchResult, error) {
	deadline := time.Now().Add(timeout)
	var lastRes *FetchResult

	for {
		if err := ctx.Err(); err != nil {
			return lastRes, err
		}
		if time.Now().After(deadline) {
			return lastRes, ErrTaskWaitTimeout
		}

		res, err := adaptor.FetchTask(info, taskID)
		if err == nil {
			lastRes = res
			switch res.Status {
			case "completed":
				return res, nil
			case "failed":
				reason := res.FailReason
				if reason == "" {
					reason = "upstream reported failure"
				}
				return res, fmt.Errorf("task failed: %s", reason)
			}
		}
		// 非终态（submitted / processing / queued） OR 瞬时 fetch 错误 → 继续轮询
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return lastRes, ErrTaskWaitTimeout
		}
		sleep := pollInterval
		if sleep > remaining {
			sleep = remaining
		}
		select {
		case <-ctx.Done():
			return lastRes, ctx.Err()
		case <-time.After(sleep):
		}
	}
}
