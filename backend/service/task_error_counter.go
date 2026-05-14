package service

import (
	"context"
	"time"

	"github.com/go-redis/redis/v8"
)

// taskErrorTTL is the lifetime of the per-task fetch-error counter key.
// 1 hour is comfortably larger than the longest expected task timeout
// (TaskTimeoutMinutes default 10m), so a stuck task keeps accumulating
// failures into the same counter, while abandoned counters auto-clean.
const taskErrorTTL = 1 * time.Hour

// TaskErrorCounter tracks per-task upstream fetch failures in Redis.
//
// The TaskWorker (Phase D3/D4) calls Increment after each failed
// FetchTask attempt; when the returned count reaches
// config.TaskMaxFetchErrors the worker force-fails the task and
// triggers a quota refund. Reset is called when a task transitions
// to a terminal state on its own so the key is removed eagerly.
//
// Storage uses redis.Cmdable so it works with both the single-node
// (*redis.Client) and cluster (redis.UniversalClient) modes set up
// in common.RDB.
type TaskErrorCounter struct {
	r redis.Cmdable
}

// NewTaskErrorCounter builds a counter backed by the given Redis client.
// Pass common.RDB in production code.
func NewTaskErrorCounter(r redis.Cmdable) *TaskErrorCounter {
	return &TaskErrorCounter{r: r}
}

func taskErrorKey(taskID string) string {
	return "task:fetch_errors:" + taskID
}

// Increment atomically increases the error counter for taskID and
// refreshes its TTL. Returns the new count after this call.
func (c *TaskErrorCounter) Increment(taskID string) (int64, error) {
	ctx := context.Background()
	key := taskErrorKey(taskID)
	pipe := c.r.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, taskErrorTTL)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

// Get returns the current error count for taskID, or 0 if the key
// is unset or expired.
func (c *TaskErrorCounter) Get(taskID string) (int64, error) {
	ctx := context.Background()
	n, err := c.r.Get(ctx, taskErrorKey(taskID)).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return n, nil
}

// Reset deletes the counter key for taskID. Safe to call when the key
// does not exist.
func (c *TaskErrorCounter) Reset(taskID string) error {
	return c.r.Del(context.Background(), taskErrorKey(taskID)).Err()
}
