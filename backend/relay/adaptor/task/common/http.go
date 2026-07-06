package common

import (
	"net/http"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/config"
)

// DefaultHTTPTimeout is a hard fallback for tests / edge cases where
// InitTaskConfig() hasn't populated config.TaskUpstreamHTTPTimeout.
// Production 走 config.TaskUpstreamHTTPTimeout（默认 180s，env 可覆盖）。
const DefaultHTTPTimeout = 30 * time.Second

var (
	sharedClient *http.Client
	initOnce     sync.Once
)

// HTTPClient returns a process-wide shared HTTP client with the configured
// timeout from config.TaskUpstreamHTTPTimeout.
//
// Fix ⑤（2026-07-07）：之前硬编码 DefaultHTTPTimeout = 30s，忽略 config；
// 引入 sync 响应支持后（Fix ④），gpt-image-1 / gpt-image-1.5 的 HTTP
// 请求本身要跑到上游把图生完（30-450s），30s 会先断开，用户看到
// "context deadline exceeded (Client.Timeout exceeded while awaiting headers)"。
//
// Initialization is goroutine-safe via sync.Once. 但因此 InitTaskConfig()
// 必须在第一次 HTTPClient() 调用之前完成（生产走 main → config init →
// 请求进来的顺序，天然满足）。
func HTTPClient() *http.Client {
	initOnce.Do(func() {
		timeout := config.TaskUpstreamHTTPTimeout
		if timeout <= 0 {
			timeout = DefaultHTTPTimeout
		}
		sharedClient = &http.Client{Timeout: timeout}
	})
	return sharedClient
}
