package ctxkey

const (
	Config            = "config"
	Id                = "id"
	Username          = "username"
	Role              = "role"
	Status            = "status"
	Channel           = "channel"
	ChannelId         = "channel_id"
	SpecificChannelId = "specific_channel_id"
	RequestModel      = "request_model"
	ConvertedRequest  = "converted_request"
	OriginalModel     = "original_model"
	Group             = "group"
	ModelMapping      = "model_mapping"
	ChannelName       = "channel_name"
	TokenId           = "token_id"
	TokenName         = "token_name"
	BaseURL           = "base_url"
	AvailableModels   = "available_models"
	KeyRequestBody    = "key_request_body"
	SystemPrompt      = "system_prompt"
	// ForceAsync 由 Playground 的 PlaygroundAsyncSubmit 在调用 RelayTaskImage
	// 之前设为 true。sync-by-default 引入后（Fix ③），API 路径要默认阻塞轮询
	// 到出图；Playground 前端已经写了 poll 逻辑，反而需要立即拿到 task_id。
	// 这个 flag 就是给 Playground 走"保留旧行为"的开关。
	ForceAsync = "force_async"
)
