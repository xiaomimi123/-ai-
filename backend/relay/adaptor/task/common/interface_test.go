package common

import (
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
