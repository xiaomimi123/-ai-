package controller

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/middleware"
)

type generateImageReq struct {
	Model  string `json:"model" binding:"required"`
	Prompt string `json:"prompt" binding:"required"`
	Size   string `json:"size,omitempty"`
	N      int    `json:"n,omitempty"`
}

// PlaygroundGenerateImage 广场画图接口
// - GPT Image / DALL·E 系：代理 /v1/images/generations，强制 response_format=b64_json
// - Gemini Nano Banana 系：代理 /v1/chat/completions + modalities=["image","text"]，解析内嵌 base64
//
// 统一响应格式（避免前端再分支）：
//
//	{ success: true, data: { images: ["data:image/png;base64,..."], model, prompt } }
func PlaygroundGenerateImage(c *gin.Context) {
	var req generateImageReq
	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "读取请求失败"})
		return
	}
	if err := json.Unmarshal(rawBody, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请求体格式错误"})
		return
	}
	if req.N <= 0 {
		req.N = 1
	}
	if req.Size == "" {
		req.Size = "1024x1024"
	}

	userId := c.GetInt(ctxkey.Id)

	// 内容审核：画图 prompt 风险最高，涉政涉黄会导致上游渠道被封
	if ok, hit := checkContentSafety(req.Prompt); !ok {
		logger.SysLog("playground image blocked by content filter: user=" + strconv.Itoa(userId) + " keyword=" + hit)
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "提示词包含不允许的内容",
			"code":    "CONTENT_FLAGGED",
		})
		return
	}

	// 分发到不同的上游协议
	if isNanoBanana(req.Model) {
		proxyNanoBananaImage(c, userId, req)
		return
	}
	proxyOpenAIImage(c, userId, req)
}

// isNanoBanana Gemini 2.5 Flash Image 走 chat/completions 路径
func isNanoBanana(modelId string) bool {
	lower := strings.ToLower(modelId)
	return strings.Contains(lower, "flash-image") || strings.Contains(lower, "nano-banana")
}

// proxyOpenAIImage 代理 OpenAI /v1/images/generations
// 强制 response_format=b64_json；上游返回的 data[].b64_json 转成 data URI 返回前端
func proxyOpenAIImage(c *gin.Context, userId int, req generateImageReq) {
	upstreamReq := map[string]interface{}{
		"model":           req.Model,
		"prompt":          req.Prompt,
		"n":               req.N,
		"size":            req.Size,
		"response_format": "b64_json",
	}
	body, _ := json.Marshal(upstreamReq)
	c.Request.Body = io.NopCloser(bytes.NewBuffer(body))
	c.Request.ContentLength = int64(len(body))
	c.Request.URL.Path = "/v1/images/generations"

	if err := setupPlaygroundRelayContext(c, userId, req.Model); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	origWriter := c.Writer
	silent := &silentWriter{ResponseWriter: origWriter, buf: &bytes.Buffer{}}
	c.Writer = silent
	middleware.Distribute()(c)
	if c.IsAborted() {
		silent.flushErr(origWriter)
		return
	}
	Relay(c)

	images := extractOpenAIImages(silent.buf.Bytes())
	if len(images) == 0 {
		silent.flushErr(origWriter)
		return
	}
	origWriter.Header().Set("Content-Type", "application/json")
	resp := gin.H{
		"success": true,
		"data": gin.H{
			"images": images,
			"model":  req.Model,
			"prompt": req.Prompt,
		},
	}
	payload, _ := json.Marshal(resp)
	origWriter.WriteHeader(http.StatusOK)
	_, _ = origWriter.Write(payload)
}

// proxyNanoBananaImage 代理到 /v1/chat/completions 的 Gemini Image 出图路径
// 非流式调用，等 relay 完整返回后从 message 里抽出 inline image
func proxyNanoBananaImage(c *gin.Context, userId int, req generateImageReq) {
	upstreamReq := map[string]interface{}{
		"model":      req.Model,
		"modalities": []string{"image", "text"},
		"messages": []map[string]interface{}{
			{"role": "user", "content": req.Prompt},
		},
		"stream": false,
	}
	body, _ := json.Marshal(upstreamReq)
	c.Request.Body = io.NopCloser(bytes.NewBuffer(body))
	c.Request.ContentLength = int64(len(body))
	c.Request.URL.Path = "/v1/chat/completions"

	if err := setupPlaygroundRelayContext(c, userId, req.Model); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	origWriter := c.Writer
	silent := &silentWriter{ResponseWriter: origWriter, buf: &bytes.Buffer{}}
	c.Writer = silent
	middleware.Distribute()(c)
	if c.IsAborted() {
		silent.flushErr(origWriter)
		return
	}
	Relay(c)

	images := extractNanoBananaImages(silent.buf.Bytes())
	if len(images) == 0 {
		silent.flushErr(origWriter)
		return
	}
	origWriter.Header().Set("Content-Type", "application/json")
	resp := gin.H{
		"success": true,
		"data": gin.H{
			"images": images,
			"model":  req.Model,
			"prompt": req.Prompt,
		},
	}
	payload, _ := json.Marshal(resp)
	origWriter.WriteHeader(http.StatusOK)
	_, _ = origWriter.Write(payload)
}

// extractOpenAIImages 从 /v1/images/generations 响应里取出 data URI
// 响应结构: { data: [ { b64_json: "..." } | { url: "..." } ] }
// 优先取 b64_json；回退到 url（虽然我们请求的是 b64_json，但兜底）
func extractOpenAIImages(raw []byte) []string {
	var resp struct {
		Data []struct {
			B64Json string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil
	}
	out := make([]string, 0, len(resp.Data))
	for _, d := range resp.Data {
		if d.B64Json != "" {
			out = append(out, "data:image/png;base64,"+d.B64Json)
		} else if d.URL != "" {
			out = append(out, d.URL)
		}
	}
	return out
}

// extractNanoBananaImages 从 Gemini chat/completions 响应里取 inline_data
// Gemini 兼容 OpenAI 格式时图片通常以两种方式出现：
//  1. message.content 是数组，含 {type:"image_url", image_url:{url:"data:..."}}
//  2. message.content 字符串里直接是 data:image/...;base64,... 片段
func extractNanoBananaImages(raw []byte) []string {
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
	out := make([]string, 0)
	for _, ch := range resp.Choices {
		out = append(out, parseGeminiContent(ch.Message.Content)...)
	}
	return out
}

// parseGeminiContent content 可能是 string 或 []{type,image_url/text}
func parseGeminiContent(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	// 先尝试数组结构
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
	// 再尝试字符串结构：搜索内嵌的 data URI
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil
	}
	return scanDataURIs(s)
}

// scanDataURIs 从任意文本里提取 data:image/...;base64,... 片段
func scanDataURIs(s string) []string {
	var out []string
	for {
		idx := strings.Index(s, "data:image/")
		if idx < 0 {
			break
		}
		rest := s[idx:]
		// 到下一个非 base64 字符为止（空白 / 引号 / 反引号）
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

// silentWriter 吃掉 relay 的默认输出，让我们自己重写响应体
type silentWriter struct {
	gin.ResponseWriter
	buf *bytes.Buffer
}

func (w *silentWriter) Write(b []byte) (int, error) {
	return w.buf.Write(b)
}

func (w *silentWriter) WriteString(s string) (int, error) {
	return w.buf.WriteString(s)
}

func (w *silentWriter) WriteHeader(statusCode int) {
	// 不直接写到下游；由 flushErr / 调用方决定最终响应
}

// flushErr 当上游失败时，把 silent 缓存的错误响应透传给真实 writer
// 只在 target 还没写入过时生效；buf 为空时兜底一个通用错误，避免 200 空 body
func (w *silentWriter) flushErr(target gin.ResponseWriter) {
	// gin.ResponseWriter.Size() 在未写入时返回 -1
	if target.Size() >= 0 {
		return // 已经写过了，不再覆盖
	}
	target.Header().Set("Content-Type", "application/json")
	if w.buf.Len() > 0 {
		target.WriteHeader(http.StatusOK)
		_, _ = target.Write(w.buf.Bytes())
		return
	}
	// buf 空 = 上游什么都没写就失败了（理论上不应发生，兜底）
	target.WriteHeader(http.StatusInternalServerError)
	_, _ = target.Write([]byte(`{"success":false,"message":"画图服务暂时不可用"}`))
}
