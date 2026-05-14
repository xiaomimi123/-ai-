package service

import (
	"context"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
	. "github.com/smartystreets/goconvey/convey"
)

// setupTestRedis returns a Redis client connected to localhost:6379 DB 15.
// If Redis is not reachable, the test is skipped: CI must not require
// a running Redis instance.
func setupTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	c := redis.NewClient(&redis.Options{
		Addr:        "localhost:6379",
		DB:          15,
		DialTimeout: 500 * time.Millisecond,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if err := c.Ping(ctx).Err(); err != nil {
		_ = c.Close()
		t.Skipf("redis not available on localhost:6379 (%v), skipping", err)
	}
	if err := c.FlushDB(context.Background()).Err(); err != nil {
		t.Fatalf("FlushDB failed: %v", err)
	}
	return c
}

func TestTaskErrorCounter_IncrementAndGet(t *testing.T) {
	Convey("Increment increases counter, Get reads it", t, func() {
		r := setupTestRedis(t)
		defer r.Close()
		c := NewTaskErrorCounter(r)

		n, err := c.Increment("task_xxx")
		So(err, ShouldBeNil)
		So(n, ShouldEqual, int64(1))

		n, err = c.Increment("task_xxx")
		So(err, ShouldBeNil)
		So(n, ShouldEqual, int64(2))

		got, err := c.Get("task_xxx")
		So(err, ShouldBeNil)
		So(got, ShouldEqual, int64(2))
	})
}

func TestTaskErrorCounter_GetMissingKeyReturnsZero(t *testing.T) {
	Convey("Get on a missing key returns 0 without error", t, func() {
		r := setupTestRedis(t)
		defer r.Close()
		c := NewTaskErrorCounter(r)

		got, err := c.Get("task_never_seen")
		So(err, ShouldBeNil)
		So(got, ShouldEqual, int64(0))
	})
}

func TestTaskErrorCounter_Reset(t *testing.T) {
	Convey("Reset clears the counter", t, func() {
		r := setupTestRedis(t)
		defer r.Close()
		c := NewTaskErrorCounter(r)

		_, _ = c.Increment("task_xxx")
		_, _ = c.Increment("task_xxx")
		err := c.Reset("task_xxx")
		So(err, ShouldBeNil)

		got, err := c.Get("task_xxx")
		So(err, ShouldBeNil)
		So(got, ShouldEqual, int64(0))
	})
}

func TestTaskErrorCounter_TTL(t *testing.T) {
	Convey("Increment sets TTL of at least 30 minutes", t, func() {
		r := setupTestRedis(t)
		defer r.Close()
		c := NewTaskErrorCounter(r)

		_, err := c.Increment("task_xxx")
		So(err, ShouldBeNil)

		ttl := r.TTL(context.Background(), "task:fetch_errors:task_xxx").Val()
		So(ttl, ShouldBeGreaterThan, 30*time.Minute)
		So(ttl, ShouldBeLessThanOrEqualTo, 1*time.Hour)
	})
}
