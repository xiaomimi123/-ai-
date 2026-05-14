package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/relay/adaptor/task"
)

// RelayTaskImage handles async task image generation (ApiMart / Jimeng).
// Full implementation lands in Task E2; for E1 this is a stub so the
// dispatcher branch in relayHelper compiles and the route is reachable.
func RelayTaskImage(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": gin.H{
			"message": "async task relay not implemented yet (Task E2)",
			"type":    "not_implemented",
			"code":    "task_relay_stub",
		},
	})
}

// shouldDispatchToTaskRelay decides whether the current image-generation
// request should be routed to the async task framework instead of the
// existing synchronous image relay flow.
//
// It returns true only when BOTH conditions hold:
//   - the ENABLE_TASK_SYSTEM feature flag is on, AND
//   - the channel selected by middleware has an async task type
//     (see relay/adaptor/task.IsAsyncTaskType).
//
// When the flag is off, this MUST return false unconditionally so the sync
// path remains byte-level equivalent to pre-feature behavior.
func shouldDispatchToTaskRelay(c *gin.Context, enabled bool) bool {
	if !enabled {
		return false
	}
	// distributor middleware stores channel.Type under ctxkey.Channel.
	return task.IsAsyncTaskType(c.GetInt(ctxkey.Channel))
}

// shouldDispatchToTaskRelayFromConfig is the production wrapper that reads
// the live feature flag from config. Kept separate from shouldDispatchToTaskRelay
// so the decision logic stays unit-testable without touching package globals.
func shouldDispatchToTaskRelayFromConfig(c *gin.Context) bool {
	return shouldDispatchToTaskRelay(c, config.EnableTaskSystem)
}
