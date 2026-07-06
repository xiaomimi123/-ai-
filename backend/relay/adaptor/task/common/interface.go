package common

// FetchResult 是 worker 调 FetchTask 后的标准化返回
type FetchResult struct {
	Status   string `json:"status"`   // submitted/queued/processing/completed/failed
	Progress string `json:"progress"` // "0".."100"
	// Result 是上游成功时的完整响应（含图 URL / b64 等），原样存到 tasks.data
	Result []byte `json:"result"`
	// Images 是 completed 时抽取好的图片 URL / data URI 列表。适配器负责从
	// 各自上游响应里提取，好让 sync 等待路径可以直接构造 OpenAI 标准
	// {data:[{url}]} 响应，而不必二次解码 upstream-specific JSON。
	// 非 completed 时可为空。
	Images []string `json:"images,omitempty"`
	// FailReason 上游失败时的错误描述
	FailReason string `json:"fail_reason"`
}

// TaskAdaptor 异步任务适配器接口。每个上游（apimart, jimeng, ...）实现一份。
type TaskAdaptor interface {
	// Init 初始化（从 channel.Key / channel.BaseURL 取配置）
	Init(info *TaskRelayInfo)

	// ValidateRequest 验证客户端入参（model 是否合法 / prompt 是否空 / size 是否支持）
	ValidateRequest(info *TaskRelayInfo) error

	// BuildRequestURL 构造上游 submit URL
	BuildRequestURL(info *TaskRelayInfo) (string, error)

	// BuildRequestHeader 构造请求头（含鉴权、Content-Type）
	BuildRequestHeader(info *TaskRelayInfo) (map[string]string, error)

	// BuildRequestBody 把客户端请求转成上游 payload
	BuildRequestBody(info *TaskRelayInfo) ([]byte, error)

	// DoRequest 真实发请求；返回上游 task_id + 原始响应 body
	DoRequest(info *TaskRelayInfo, body []byte) (taskID string, raw []byte, err error)

	// FetchTask worker 调用：拉一次任务状态
	FetchTask(info *TaskRelayInfo, taskID string) (*FetchResult, error)
}
