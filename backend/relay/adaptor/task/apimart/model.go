package apimart

// SubmitRequest 提交任务请求体（apimart 格式）
type SubmitRequest struct {
	Model      string   `json:"model"`
	Prompt     string   `json:"prompt"`
	N          int      `json:"n,omitempty"`
	Size       string   `json:"size,omitempty"`
	Resolution string   `json:"resolution,omitempty"`
	ImageURLs  []string `json:"image_urls,omitempty"`
}

// SubmitResponse 提交后的异步响应
type SubmitResponse struct {
	Code int `json:"code"`
	Data []struct {
		Status string `json:"status"`
		TaskID string `json:"task_id"`
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
	Code    int    `json:"code"`
	Message string `json:"message"`
	Type    string `json:"type"`
}
