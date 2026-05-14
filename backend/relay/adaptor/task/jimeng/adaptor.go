package jimeng

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

const (
	defaultRegion  = "cn-north-1"
	defaultService = "cv"
	apiVersion     = "2022-08-31"
)

type Adaptor struct {
	cfg ChannelConfig
}

var _ common.TaskAdaptor = &Adaptor{}

func (a *Adaptor) Init(info *common.TaskRelayInfo) {
	_ = json.Unmarshal([]byte(info.APIKey), &a.cfg)
	if a.cfg.Region == "" {
		a.cfg.Region = defaultRegion
	}
	if a.cfg.Service == "" {
		a.cfg.Service = defaultService
	}
}

func (a *Adaptor) ValidateRequest(info *common.TaskRelayInfo) error {
	if a.cfg.AccessKeyID == "" || a.cfg.SecretAccessKey == "" {
		return errors.New("jimeng channel key must be JSON {access_key_id, secret_access_key, ...}")
	}
	if strings.TrimSpace(info.Prompt) == "" {
		return errors.New("prompt is required")
	}
	return nil
}

func (a *Adaptor) BuildRequestURL(info *common.TaskRelayInfo) (string, error) {
	base := strings.TrimRight(info.BaseURL, "/")
	if base == "" {
		base = "https://visual.volcengineapi.com"
	}
	q := url.Values{}
	q.Set("Action", "CVSync2AsyncSubmitTask")
	q.Set("Version", apiVersion)
	return base + "/?" + q.Encode(), nil
}

func (a *Adaptor) buildFetchURL(info *common.TaskRelayInfo) string {
	base := strings.TrimRight(info.BaseURL, "/")
	if base == "" {
		base = "https://visual.volcengineapi.com"
	}
	q := url.Values{}
	q.Set("Action", "CVSync2AsyncGetResult")
	q.Set("Version", apiVersion)
	return base + "/?" + q.Encode()
}

func (a *Adaptor) BuildRequestHeader(info *common.TaskRelayInfo) (map[string]string, error) {
	// Auth header is added by signRequest after body is known
	return map[string]string{"Content-Type": "application/json"}, nil
}

func (a *Adaptor) BuildRequestBody(info *common.TaskRelayInfo) ([]byte, error) {
	model := info.UpstreamModelName
	if model == "" {
		model = info.OriginModelName
	}
	req := SubmitRequest{
		ReqKey: model,
		Prompt: info.Prompt,
	}
	if len(info.ImageURLs) > 0 {
		req.ImageURL = info.ImageURLs
	}
	return json.Marshal(req)
}

// signRequest writes Volcengine V4 signature headers onto httpReq for the given body.
func (a *Adaptor) signRequest(httpReq *http.Request, body []byte) {
	now := time.Now().UTC()
	shortDate := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	httpReq.Header.Set("X-Date", amzDate)
	httpReq.Header.Set("Host", httpReq.URL.Host)

	bodyHash := sha256.Sum256(body)
	httpReq.Header.Set("X-Content-Sha256", hex.EncodeToString(bodyHash[:]))

	signedHeaders := []string{"content-type", "host", "x-content-sha256", "x-date"}
	sort.Strings(signedHeaders)
	headerList := strings.Join(signedHeaders, ";")

	var canonicalHeaders strings.Builder
	for _, h := range signedHeaders {
		canonicalHeaders.WriteString(h + ":" + strings.TrimSpace(httpReq.Header.Get(h)) + "\n")
	}

	canonicalRequest := strings.Join([]string{
		httpReq.Method,
		httpReq.URL.Path,
		httpReq.URL.RawQuery,
		canonicalHeaders.String(),
		headerList,
		hex.EncodeToString(bodyHash[:]),
	}, "\n")

	credScope := fmt.Sprintf("%s/%s/%s/request", shortDate, a.cfg.Region, a.cfg.Service)
	hashCR := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"HMAC-SHA256",
		amzDate,
		credScope,
		hex.EncodeToString(hashCR[:]),
	}, "\n")

	sigKey := deriveSigningKey(a.cfg.SecretAccessKey, shortDate, a.cfg.Region, a.cfg.Service)
	signature := hex.EncodeToString(hmacSHA256(sigKey, []byte(stringToSign)))

	httpReq.Header.Set("Authorization", fmt.Sprintf(
		"HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		a.cfg.AccessKeyID, credScope, headerList, signature,
	))
}

func (a *Adaptor) DoRequest(info *common.TaskRelayInfo, body []byte) (string, []byte, error) {
	urlStr, err := a.BuildRequestURL(info)
	if err != nil {
		return "", nil, err
	}
	httpReq, err := http.NewRequest("POST", urlStr, bytes.NewReader(body))
	if err != nil {
		return "", nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	a.signRequest(httpReq, body)

	resp, err := common.HTTPClient().Do(httpReq)
	if err != nil {
		return "", nil, fmt.Errorf("jimeng submit: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	trimmed := bytes.TrimLeft(raw, " \t\r\n")
	if len(trimmed) > 0 && trimmed[0] == '<' {
		return "", raw, fmt.Errorf("upstream HTML error (status=%d)", resp.StatusCode)
	}

	var sr SubmitResponse
	if err := json.Unmarshal(raw, &sr); err != nil {
		return "", raw, fmt.Errorf("unmarshal jimeng submit: %w", err)
	}
	if sr.Code != 10000 {
		return "", raw, fmt.Errorf("jimeng submit failed code=%d msg=%s", sr.Code, sr.Message)
	}
	return sr.Data.TaskID, raw, nil
}

func (a *Adaptor) FetchTask(info *common.TaskRelayInfo, taskID string) (*common.FetchResult, error) {
	urlStr := a.buildFetchURL(info)
	model := info.UpstreamModelName
	if model == "" {
		model = info.OriginModelName
	}
	reqBody, _ := json.Marshal(FetchRequest{ReqKey: model, TaskID: taskID})

	httpReq, err := http.NewRequest("POST", urlStr, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	a.signRequest(httpReq, reqBody)

	resp, err := common.HTTPClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("jimeng fetch: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	var fr FetchResponse
	if err := json.Unmarshal(raw, &fr); err != nil {
		return nil, fmt.Errorf("unmarshal jimeng fetch: %w", err)
	}
	if fr.Code != 10000 {
		return nil, fmt.Errorf("jimeng fetch failed code=%d msg=%s", fr.Code, fr.Message)
	}

	out := &common.FetchResult{Result: raw}
	switch fr.Data.Status {
	case "done":
		out.Status = "completed"
		out.Progress = "100"
	case "generating":
		out.Status = "processing"
		out.Progress = "50"
	case "failed":
		out.Status = "failed"
		out.FailReason = fr.Data.FailReason
	default:
		out.Status = "queued"
		out.Progress = "0"
	}
	return out, nil
}
