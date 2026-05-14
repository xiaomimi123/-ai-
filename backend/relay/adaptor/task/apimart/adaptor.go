package apimart

import (
	"errors"
	"fmt"
	"strings"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

// Adaptor 实现 common.TaskAdaptor for apimart.ai 异步图像协议
type Adaptor struct{}

// compile-time assertion
var _ common.TaskAdaptor = &Adaptor{}

func (a *Adaptor) Init(info *common.TaskRelayInfo) {
	// apimart 不需要预处理
}

func (a *Adaptor) ValidateRequest(info *common.TaskRelayInfo) error {
	if strings.TrimSpace(info.Prompt) == "" {
		return errors.New("prompt is required")
	}
	if info.OriginModelName == "" {
		return errors.New("model is required")
	}
	if info.N < 0 || info.N > 10 {
		return errors.New("n must be 1-10")
	}
	if len(info.ImageURLs) > 16 {
		return errors.New("image_urls exceeds max 16")
	}
	return nil
}

// normalizeBaseURL 把用户配的 BaseURL 规范化为 host 形式（去尾斜杠 / 去重复 /v1）
// 这避免了 2026-05-13 在生产上遇到的 path 重复 bug:
// 用户在 admin 后台填 base_url 为 https://api.apimart.ai/v1 → 拼接 /v1/images/generations
// → 最终 URL 变成 https://api.apimart.ai/v1/images/generations/v1/images/generations (404)
func normalizeBaseURL(raw string) string {
	u := strings.TrimRight(raw, "/")
	u = strings.TrimSuffix(u, "/v1")
	return u
}

func (a *Adaptor) BuildRequestURL(info *common.TaskRelayInfo) (string, error) {
	if info.BaseURL == "" {
		return "", errors.New("apimart channel BaseURL is empty")
	}
	return fmt.Sprintf("%s/v1/images/generations", normalizeBaseURL(info.BaseURL)), nil
}

func (a *Adaptor) BuildRequestHeader(info *common.TaskRelayInfo) (map[string]string, error) {
	if info.APIKey == "" {
		return nil, errors.New("apimart channel APIKey is empty")
	}
	return map[string]string{
		"Authorization": "Bearer " + info.APIKey,
		"Content-Type":  "application/json",
	}, nil
}

// BuildRequestBody / DoRequest / FetchTask — implemented in Task B3/B4. Stubs here so we satisfy the interface.
func (a *Adaptor) BuildRequestBody(info *common.TaskRelayInfo) ([]byte, error) {
	return nil, errors.New("not implemented (Task B3)")
}

func (a *Adaptor) DoRequest(info *common.TaskRelayInfo, body []byte) (string, []byte, error) {
	return "", nil, errors.New("not implemented (Task B3)")
}

func (a *Adaptor) FetchTask(info *common.TaskRelayInfo, taskID string) (*common.FetchResult, error) {
	return nil, errors.New("not implemented (Task B4)")
}
