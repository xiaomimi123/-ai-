package apimart

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
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
	// trim 防御：复制粘贴的 key 常带尾部 \n / \r / 空格，
	// net/http 会以 "invalid header field value" 拒绝整个请求
	key := strings.TrimSpace(info.APIKey)
	if key == "" {
		return nil, errors.New("apimart channel APIKey is empty")
	}
	return map[string]string{
		"Authorization": "Bearer " + key,
		"Content-Type":  "application/json",
	}, nil
}

func (a *Adaptor) BuildRequestBody(info *common.TaskRelayInfo) ([]byte, error) {
	model := info.UpstreamModelName
	if model == "" {
		model = info.OriginModelName
	}
	n := info.N
	if n <= 0 {
		n = 1
	}
	req := SubmitRequest{
		Model:      model,
		Prompt:     info.Prompt,
		N:          n,
		Size:       info.Size,
		Resolution: info.Resolution,
		ImageURLs:  info.ImageURLs,
	}
	return json.Marshal(req)
}

func (a *Adaptor) DoRequest(info *common.TaskRelayInfo, body []byte) (string, []byte, error) {
	url, err := a.BuildRequestURL(info)
	if err != nil {
		return "", nil, err
	}
	headers, err := a.BuildRequestHeader(info)
	if err != nil {
		return "", nil, err
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return "", nil, fmt.Errorf("build request: %w", err)
	}
	for k, v := range headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := common.HTTPClient().Do(httpReq)
	if err != nil {
		return "", nil, fmt.Errorf("upstream request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, fmt.Errorf("read upstream body: %w", err)
	}

	// 防 HTML 错误页（2026-05-13 在生产上调试到的真实 bug）
	// 上游返 nginx default page / Cloudflare challenge / 404 HTML 页时，
	// 第一个字符是 '<'，json.Unmarshal 会报 "invalid character '<' looking for beginning of value"。
	// 我们提前用首字节判断给出更人话的错误，避免用户看到 cryptic 的 unmarshal 错误。
	trimmed := bytes.TrimLeft(raw, " \t\r\n")
	if len(trimmed) > 0 && trimmed[0] == '<' {
		return "", raw, fmt.Errorf("upstream returned non-JSON (likely HTML error page, status=%d): %s",
			resp.StatusCode, truncate(string(raw), 200))
	}

	var sr SubmitResponse
	if err := json.Unmarshal(raw, &sr); err != nil {
		return "", raw, fmt.Errorf("unmarshal upstream response: %w (body: %s)", err, truncate(string(raw), 200))
	}

	if sr.Error != nil {
		return "", raw, fmt.Errorf("upstream error: %s (%s)", sr.Error.Message, sr.Error.Type)
	}
	if len(sr.Data) == 0 || sr.Data[0].TaskID == "" {
		return "", raw, errors.New("upstream did not return task_id")
	}

	return sr.Data[0].TaskID, raw, nil
}

// truncate returns the first n runes of s plus "...", preserving UTF-8 boundaries.
// We use rune-count (not byte-count) so multi-byte sequences (Chinese, emoji) are not split.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "..."
}

func (a *Adaptor) FetchTask(info *common.TaskRelayInfo, taskID string) (*common.FetchResult, error) {
	url := fmt.Sprintf("%s/v1/tasks/%s", normalizeBaseURL(info.BaseURL), taskID)

	httpReq, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("build fetch request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(info.APIKey))

	resp, err := common.HTTPClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("fetch upstream: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read fetch body: %w", err)
	}

	// Same HTML-error guard as DoRequest (defensive parity)
	trimmed := bytes.TrimLeft(raw, " \t\r\n")
	if len(trimmed) > 0 && trimmed[0] == '<' {
		return nil, fmt.Errorf("upstream returned non-JSON on fetch (status=%d): %s",
			resp.StatusCode, truncate(string(raw), 200))
	}

	var fr FetchResponse
	if err := json.Unmarshal(raw, &fr); err != nil {
		return nil, fmt.Errorf("unmarshal fetch response: %w", err)
	}

	out := &common.FetchResult{
		Status:   fr.Data.Status,
		Progress: strconv.Itoa(fr.Data.Progress),
		Result:   raw, // 完整原文存到 tasks.data
	}
	if fr.Data.Error != nil {
		out.FailReason = fr.Data.Error.Message
	}
	return out, nil
}
