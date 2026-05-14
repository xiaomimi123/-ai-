package jimeng

// SubmitRequest jimeng CVSync2AsyncSubmitTask payload
type SubmitRequest struct {
	ReqKey   string   `json:"req_key"`
	Prompt   string   `json:"prompt"`
	Seed     int      `json:"seed,omitempty"`
	ImageURL []string `json:"image_url,omitempty"`
}

// SubmitResponse
type SubmitResponse struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
	Data      struct {
		TaskID string `json:"task_id"`
	} `json:"data"`
}

// FetchRequest CVSync2AsyncGetResult payload
type FetchRequest struct {
	ReqKey string `json:"req_key"`
	TaskID string `json:"task_id"`
}

// FetchResponse
type FetchResponse struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
	Data      struct {
		Status     string   `json:"status"` // generating / done / failed
		ImageURLs  []string `json:"image_urls,omitempty"`
		FailReason string   `json:"fail_reason,omitempty"`
	} `json:"data"`
}

// ChannelConfig stored as JSON in channel.Key
type ChannelConfig struct {
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	Region          string `json:"region"`  // default cn-north-1
	Service         string `json:"service"` // default cv
}
