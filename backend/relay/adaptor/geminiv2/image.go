package geminiv2

import (
	"encoding/json"
	"strings"
)

// Gemini 的图像生成走 /v1/chat/completions + modalities:["image","text"]，
// 上游把生成的图片以两种方式返回：
//
//  1. choices[].message.content 是数组，含 {type:"image_url", image_url:{url:"..."}}
//     的 part（可能是 https URL，也可能是 data:image/...;base64,... 内联）
//  2. choices[].message.content 是字符串，里面内嵌了 data:image/...;base64,...
//     片段（少数上游厂商这么干，为了兼容 OpenAI SDK 的默认 string content 解析）
//
// ExtractImagesFromChatCompletions 兼容以上两种，返回按 choices 顺序、每个
// choice 内按 part 顺序的图片 URL / data URI 列表。malformed 输入返回空切片
// 而非报错，因为调用方（sync 响应构造）已经在处理"无图"的降级路径。

// ExtractImagesFromChatCompletions 从 chat/completions 响应体里抽出所有图片。
// 详见文件顶部注释。
func ExtractImagesFromChatCompletions(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var resp struct {
		Choices []struct {
			Message struct {
				Content json.RawMessage `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil
	}
	var out []string
	for _, ch := range resp.Choices {
		out = append(out, parseContent(ch.Message.Content)...)
	}
	return out
}

// parseContent 处理 message.content 的两种可能形态（数组 / 字符串）。
func parseContent(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	// 尝试数组结构
	var arr []struct {
		Type     string `json:"type"`
		ImageURL struct {
			URL string `json:"url"`
		} `json:"image_url"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &arr); err == nil && len(arr) > 0 {
		out := make([]string, 0, len(arr))
		for _, item := range arr {
			if item.Type == "image_url" && item.ImageURL.URL != "" {
				out = append(out, item.ImageURL.URL)
			}
		}
		return out
	}
	// 尝试字符串结构
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil
	}
	return scanDataURIs(s)
}

// scanDataURIs 从任意文本里提取 data:image/...;base64,... 片段。
// 终止边界：换行、空白、引号、反引号。
func scanDataURIs(s string) []string {
	var out []string
	for {
		idx := strings.Index(s, "data:image/")
		if idx < 0 {
			break
		}
		rest := s[idx:]
		end := strings.IndexAny(rest, "\n\r\t \"'`")
		if end < 0 {
			out = append(out, rest)
			break
		}
		out = append(out, rest[:end])
		s = rest[end:]
	}
	return out
}

// BuildChatCompletionRequestForImage 把 OpenAI images/generations 风格的
// {model, prompt, image_urls} 转成 Gemini OpenAI-compat chat/completions
// 风格的请求体：
//
//   - modalities: ["image","text"] 是关键，告诉上游要出图
//   - 无 imageURLs → messages[0].content 是纯字符串 prompt
//   - 有 imageURLs → messages[0].content 是数组，[{type:text}, {type:image_url}...]
//
// 用于外部 API 客户走 /v1/images/generations 时，被 RelayGeminiImage 分支
// 抢在 sync 图像 relay 之前重写 body。
func BuildChatCompletionRequestForImage(model, prompt string, imageURLs []string) ([]byte, error) {
	msg := map[string]interface{}{"role": "user"}
	if len(imageURLs) == 0 {
		msg["content"] = prompt
	} else {
		parts := []map[string]interface{}{{"type": "text", "text": prompt}}
		for _, u := range imageURLs {
			parts = append(parts, map[string]interface{}{
				"type":      "image_url",
				"image_url": map[string]string{"url": u},
			})
		}
		msg["content"] = parts
	}
	req := map[string]interface{}{
		"model":      model,
		"modalities": []string{"image", "text"},
		"messages":   []map[string]interface{}{msg},
		"stream":     false,
	}
	return json.Marshal(req)
}
