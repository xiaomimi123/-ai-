package apimart

import "encoding/json"

// SubmitRequest 提交任务请求体（apimart 格式）
type SubmitRequest struct {
	Model      string   `json:"model"`
	Prompt     string   `json:"prompt"`
	N          int      `json:"n,omitempty"`
	Size       string   `json:"size,omitempty"`
	Resolution string   `json:"resolution,omitempty"`
	ImageURLs  []string `json:"image_urls,omitempty"`
	// MaskURL 局部重绘用的遮罩（黑白 PNG，白色区域会被重绘）。
	// Fix ②c：仅 /v1/images/edits 会填这个字段。
	MaskURL string `json:"mask_url,omitempty"`
}

// SubmitResponse 提交后的响应。apimart 走两种模式：
//   - 异步：data[].task_id 有值，客户端后续 poll /v1/tasks/{id}
//   - 同步：data[].b64_json 或 data[].url 有值（OpenAI DALL-E 风格）
//     gpt-image-1 / gpt-image-1.5 走这条。task_id 会缺失。
type SubmitResponse struct {
	Code int `json:"code"`
	Data []struct {
		Status  string `json:"status"`
		TaskID  string `json:"task_id"`
		B64JSON string `json:"b64_json,omitempty"`
		URL     string `json:"url,omitempty"`
	} `json:"data"`
	Error *APIError `json:"error,omitempty"`
}

// FetchResponse GET /v1/tasks/{id} 上游返回
type FetchResponse struct {
	Code int `json:"code"`
	Data struct {
		ID            string  `json:"id"`
		Status        string  `json:"status"` // submitted/processing/completed/failed
		Progress      int     `json:"progress"`
		Created       int64   `json:"created"`
		Completed     int64   `json:"completed"`
		ActualTime    int     `json:"actual_time"`
		Cost          float64 `json:"cost"`
		EstimatedTime int     `json:"estimated_time"`
		Result        struct {
			Images []struct {
				URL       []string `json:"url"`
				ExpiresAt int64    `json:"expires_at"`
			} `json:"images"`
		} `json:"result"`
		Error *APIError `json:"error,omitempty"`
	} `json:"data"`
}

type APIError struct {
	// Code is intentionally json.RawMessage because apimart inconsistently returns
	// integer codes (e.g., 400) or empty string ("") in the same field. We don't
	// surface Code in error messages; only Message and Type are used.
	Code    json.RawMessage `json:"code,omitempty"`
	Message string          `json:"message"`
	Type    string          `json:"type"`
}
