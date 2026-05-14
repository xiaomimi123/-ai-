package common

import (
	"net/http"
	"sync"
	"time"
)

// DefaultHTTPTimeout is the default timeout for upstream HTTP requests.
const DefaultHTTPTimeout = 30 * time.Second

var (
	sharedClient *http.Client
	initOnce     sync.Once
)

// HTTPClient returns a process-wide shared HTTP client with the default timeout.
// Initialization is goroutine-safe via sync.Once.
func HTTPClient() *http.Client {
	initOnce.Do(func() {
		sharedClient = &http.Client{Timeout: DefaultHTTPTimeout}
	})
	return sharedClient
}
