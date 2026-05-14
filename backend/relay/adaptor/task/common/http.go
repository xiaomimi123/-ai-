package common

import (
	"net/http"
	"time"
)

var sharedClient *http.Client

// DefaultHTTPTimeout 兜底（Phase D 会改成从 env 读取）
const DefaultHTTPTimeout = 30 * time.Second

// HTTPClient 返回共享 HTTP 客户端
func HTTPClient() *http.Client {
	if sharedClient == nil {
		sharedClient = &http.Client{Timeout: DefaultHTTPTimeout}
	}
	return sharedClient
}
