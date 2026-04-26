package render

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common"
)

// StreamNormalizer：把 chat.completion.chunk 的 SSE 输出补齐到 OpenAI 严格规范
// 修复 OpenClaw / OpenAI Python SDK 等严格客户端对 GPT/Gemini 等 channel 解析失败的问题
//   - 首条 chunk 注入 delta.role:"assistant"
//   - 每条 chunk 确保有 finish_reason 字段（即使值为 null）
//   - 流结束前若上游未发 finish_reason:"stop"，自动补一条 stop chunk
//
// 环境变量 STREAM_NORMALIZER=on 启用（默认关闭，保持原透传行为）
// 仅对 object=="chat.completion.chunk" 生效，其他 SSE（如错误事件、admin 流）原样透传
const (
	envStreamNormalizer    = "STREAM_NORMALIZER"
	streamRoleEmittedKey   = "_stream_role_emitted"
	streamFinishEmittedKey = "_stream_finish_emitted"
	streamIdKey            = "_stream_id"
	streamModelKey         = "_stream_model"
)

func streamNormalizerEnabled() bool {
	return os.Getenv(envStreamNormalizer) == "on"
}

func StringData(c *gin.Context, str string) {
	str = strings.TrimPrefix(str, "data: ")
	str = strings.TrimSuffix(str, "\r")

	if streamNormalizerEnabled() {
		str = normalizeChunk(c, str)
	}

	c.Render(-1, common.CustomEvent{Data: "data: " + str})
	c.Writer.Flush()
}

func ObjectData(c *gin.Context, object interface{}) error {
	jsonData, err := json.Marshal(object)
	if err != nil {
		return fmt.Errorf("error marshalling object: %w", err)
	}
	StringData(c, string(jsonData))
	return nil
}

func Done(c *gin.Context) {
	// 兜底：流结束时若上游未发 finish_reason:"stop"（如 gemini adaptor），补一条
	if streamNormalizerEnabled() {
		if emitted, _ := c.Get(streamFinishEmittedKey); emitted != true {
			stopChunk := buildStopChunk(
				stringFromCtx(c, streamIdKey),
				stringFromCtx(c, streamModelKey),
			)
			c.Render(-1, common.CustomEvent{Data: "data: " + stopChunk})
			c.Writer.Flush()
		}
	}
	StringData(c, "[DONE]")
}

// normalizeChunk 修补 chat.completion.chunk 类型的 SSE 数据
// 非 chat completion 的内容（[DONE] / 非 JSON / object 字段非匹配）原样返回
func normalizeChunk(c *gin.Context, str string) string {
	trimmed := strings.TrimSpace(str)
	if trimmed == "" || trimmed == "[DONE]" || !strings.HasPrefix(trimmed, "{") {
		return str
	}

	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(trimmed), &raw); err != nil {
		return str
	}

	if obj, _ := raw["object"].(string); obj != "chat.completion.chunk" {
		return str
	}

	// 记录 id/model 给 Done() 的 stop chunk 兜底用
	if id, ok := raw["id"].(string); ok && id != "" {
		c.Set(streamIdKey, id)
	}
	if model, ok := raw["model"].(string); ok && model != "" {
		c.Set(streamModelKey, model)
	}

	choices, ok := raw["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return str
	}

	changed := false
	for _, ch := range choices {
		choice, ok := ch.(map[string]interface{})
		if !ok {
			continue
		}

		// 1. delta.role 注入：本次流的首条 chunk 缺 role 时补 "assistant"
		if delta, ok := choice["delta"].(map[string]interface{}); ok {
			if _, hasRole := delta["role"]; !hasRole {
				if emitted, _ := c.Get(streamRoleEmittedKey); emitted != true {
					delta["role"] = "assistant"
					choice["delta"] = delta
					changed = true
				}
			}
			c.Set(streamRoleEmittedKey, true)
		}

		// 2. finish_reason 字段必存（哪怕是 null）
		if _, has := choice["finish_reason"]; !has {
			choice["finish_reason"] = nil
			changed = true
		}

		// 3. 标记是否已 emit 过 finish_reason:"stop"
		if fr, _ := choice["finish_reason"].(string); fr == "stop" {
			c.Set(streamFinishEmittedKey, true)
		}
	}

	if !changed {
		return str
	}

	out, err := json.Marshal(raw)
	if err != nil {
		return str
	}
	return string(out)
}

func stringFromCtx(c *gin.Context, key string) string {
	if v, exists := c.Get(key); exists {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func buildStopChunk(id, model string) string {
	chunk := map[string]interface{}{
		"id":      id,
		"object":  "chat.completion.chunk",
		"created": 0,
		"model":   model,
		"choices": []interface{}{
			map[string]interface{}{
				"index":         0,
				"delta":         map[string]interface{}{},
				"finish_reason": "stop",
			},
		},
	}
	b, _ := json.Marshal(chunk)
	return string(b)
}
