package apimart

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"strings"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

// pickAPIKey 从 channel.key 字段抽出一个可用 key 给 Bearer 用。
//
// 历史背景：admin 在编辑渠道时如果粘贴多行 key（One API 新建时这么做会拆成多个渠道，
// 但编辑路径不拆），key 字段会变成 "sk-A\nsk-B\nsk-C" 这种多 key 串。
// 直接拼成 "Bearer sk-A\nsk-B\nsk-C" 给 net/http → "invalid header field value"。
//
// 假设：同一 channel 内的多个 key 属于同一 apimart 账号（典型用法是分散 rate limit）。
// 因此 submit 和 fetch 可以独立随机挑 key，不必绑定。如不同账号请用多个渠道。
func pickAPIKey(raw string) (string, error) {
	keys := make([]string, 0, 4)
	for _, line := range strings.Split(raw, "\n") {
		if k := strings.TrimSpace(line); k != "" {
			keys = append(keys, k)
		}
	}
	if len(keys) == 0 {
		return "", errors.New("apimart channel APIKey is empty")
	}
	if len(keys) == 1 {
		return keys[0], nil
	}
	// Go 1.20+ math/rand 默认已自动 seed，无需 rand.Seed
	return keys[rand.Intn(len(keys))], nil
}

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
	key, err := pickAPIKey(info.APIKey)
	if err != nil {
		return nil, err
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
		Size:       normalizeSizeForModel(model, info.Size),
		Resolution: info.Resolution,
		ImageURLs:  info.ImageURLs,
		MaskURL:    info.MaskURL,
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
	if len(sr.Data) == 0 {
		return "", raw, errors.New("upstream did not return data")
	}

	// 异步 path：有 task_id。
	if sr.Data[0].TaskID != "" {
		return sr.Data[0].TaskID, raw, nil
	}

	// 同步 path（Fix ④）：apimart 对 gpt-image-1 / gpt-image-1.5 直接返回
	// 内联 b64_json / url，没有 task_id。空 taskID + nil err 是 sync 信号，
	// 上层 RelayTaskImage 应该短路，用 ExtractSyncImages 抽图直接响应。
	if sr.Data[0].B64JSON != "" || sr.Data[0].URL != "" {
		return "", raw, nil
	}

	return "", raw, errors.New("upstream did not return task_id or inline image")
}

// ExtractSyncImages 从 apimart 同步响应里抽出图片列表。
//   - b64_json 会包成 data URI（data:image/png;base64,...），前端可直接 <img src>
//   - url 直接透传
//
// 无法解析或没有可用图片时返回空切片。
func ExtractSyncImages(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var sr SubmitResponse
	if err := json.Unmarshal(raw, &sr); err != nil {
		return nil
	}
	out := make([]string, 0, len(sr.Data))
	for _, d := range sr.Data {
		switch {
		case d.B64JSON != "":
			out = append(out, "data:image/png;base64,"+d.B64JSON)
		case d.URL != "":
			out = append(out, d.URL)
		}
	}
	return out
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
	key, err := pickAPIKey(info.APIKey)
	if err != nil {
		return nil, fmt.Errorf("build fetch header: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+key)

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
	// 抽取图片 URL 给 sync 等待路径用。apimart result.images 是
	// [{url:["https://..."], expires_at}] 结构，每个 images[i].url 是数组
	// （历史上 apimart 可能返回同一张图的多种尺寸），这里只取第一个 URL。
	if fr.Data.Status == "completed" {
		for _, img := range fr.Data.Result.Images {
			if len(img.URL) > 0 && img.URL[0] != "" {
				out.Images = append(out.Images, img.URL[0])
			}
		}
	}
	return out, nil
}
