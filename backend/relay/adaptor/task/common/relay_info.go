package common

// TaskRelayInfo 在 controller / worker / adaptor 之间传递的上下文
type TaskRelayInfo struct {
	UserID    int
	TokenID   int
	ChannelID int

	BaseURL string // channel.BaseURL，例如 https://api.apimart.ai
	APIKey  string // channel.Key

	OriginModelName   string // 客户端请求里的 model，例如 gpt-image-2
	UpstreamModelName string // model_mapping 转换后的上游 model

	// 客户端请求体已 unmarshal 后的字段
	Prompt     string
	Size       string
	Resolution string
	N          int
	ImageURLs  []string
	// MaskURL 是 /v1/images/edits 里的 mask 文件，转成 data URI 后填入。
	// Fix ②c：apimart 上游用这个字段做局部重绘。Gemini 不原生支持像素级
	// mask，收到时会忽略（或作为语义提示注入 prompt，见 geminiv2 分支）。
	MaskURL string

	// 给 adaptor 透传的原始 JSON（用于 BuildRequestBody 不丢字段）
	OriginalRequestBody []byte

	// 灵镜业务：分组 / 计费上下文
	Group string
}
