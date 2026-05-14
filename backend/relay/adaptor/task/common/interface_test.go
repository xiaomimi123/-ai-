package common

import (
	"net/http"
	"sync"
	"testing"

	. "github.com/smartystreets/goconvey/convey"
)

// 编译期断言：任何实现 TaskAdaptor 的类型必须有这些方法
type stubAdaptor struct{}

func (s *stubAdaptor) Init(info *TaskRelayInfo)                                {}
func (s *stubAdaptor) ValidateRequest(info *TaskRelayInfo) error               { return nil }
func (s *stubAdaptor) BuildRequestURL(info *TaskRelayInfo) (string, error)     { return "", nil }
func (s *stubAdaptor) BuildRequestHeader(info *TaskRelayInfo) (map[string]string, error) {
	return nil, nil
}
func (s *stubAdaptor) BuildRequestBody(info *TaskRelayInfo) ([]byte, error)    { return nil, nil }
func (s *stubAdaptor) DoRequest(info *TaskRelayInfo, body []byte) (taskID string, raw []byte, err error) {
	return "", nil, nil
}
func (s *stubAdaptor) FetchTask(info *TaskRelayInfo, taskID string) (*FetchResult, error) {
	return nil, nil
}

func TestStubImplementsTaskAdaptor(t *testing.T) {
	Convey("stubAdaptor must satisfy TaskAdaptor interface", t, func() {
		var a TaskAdaptor = &stubAdaptor{}
		So(a, ShouldNotBeNil)
	})
}

func TestHTTPClient_concurrent_safe(t *testing.T) {
	Convey("concurrent calls to HTTPClient must return identical instance", t, func() {
		var clients [10]*http.Client
		var wg sync.WaitGroup
		for i := 0; i < 10; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				clients[idx] = HTTPClient()
			}(i)
		}
		wg.Wait()

		first := clients[0]
		So(first, ShouldNotBeNil)
		for _, c := range clients {
			So(c, ShouldEqual, first)
		}
	})
}
