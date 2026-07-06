package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/middleware"
	"github.com/songquanpeng/one-api/relay/adaptor/geminiv2"
	"github.com/songquanpeng/one-api/relay/channeltype"
	"github.com/songquanpeng/one-api/relay/relaymode"
)

// alias for readability inside this file
const gRelayModeChatCompletions = relaymode.ChatCompletions

// isGeminiChannelType 判断给定 channel.Type 是否属于走 chat/completions +
// modalities 出图的 Gemini 系。仅 Gemini（原生）和 GeminiOpenAICompatible
// 命中。其他渠道（含 apimart / OpenAI DALL-E）都走各自现有路径。
func isGeminiChannelType(channelType int) bool {
	switch channelType {
	case channeltype.Gemini, channeltype.GeminiOpenAICompatible:
		return true
	}
	return false
}

// Gemini image relay for external API callers.
//
// Fix ① 的核心：外部客户 POST /v1/images/generations 时，如果被 distributor
// 路由到 Gemini 系渠道（channeltype.Gemini / GeminiOpenAICompatible），我们
// 需要在 relay 层把请求改写成 /v1/chat/completions + modalities=["image","text"]
// 转发上游，再把上游返回的 chat/completions 响应里的图片抽出来，包装成 OpenAI
// images/generations 标准响应 {created, data:[{url}]} 返回。
//
// 这样：
//   - 客户用 client.images.generate(model="nano-banana", prompt="...") 就能直接工作
//   - 上游只需要是任何"OpenAI-兼容且支持 Gemini modalities"的 endpoint（Google
//     官方 /v1beta/openai/ 或第三方中转都行）
//   - 走标准 relay 链路，天然继承计费、重试、监控、日志

// geminiImageRequestBody 客户端 POST 到 /v1/images/generations 的请求体。
// 关键字段：Prompt / Model / ImageURLs（用于图生图 Fix ②a）。
type geminiImageRequestBody struct {
	Model     string   `json:"model"`
	Prompt    string   `json:"prompt"`
	N         int      `json:"n,omitempty"`
	Size      string   `json:"size,omitempty"`
	ImageURLs []string `json:"image_urls,omitempty"`
}

// RewriteToGeminiChatCompletion 读走请求体，把 gin.Context 的 URL Path 改成
// /v1/chat/completions，并把 body 替换为 Gemini OpenAI-compat 形式，让下游
// standard chat/completions relay 直接接手。
//
// 调用方（RelayGeminiImage）负责：wrap ResponseWriter、代 Distribute、代 Relay、
// 抽图、写最终响应。
//
// 返回原始解析出的 request 结构方便调用方后续（例如日志 / 计费）使用。
func RewriteToGeminiChatCompletion(c *gin.Context) (*geminiImageRequestBody, error) {
	rawIn, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return nil, errors.New("read body: " + err.Error())
	}
	var req geminiImageRequestBody
	if err := json.Unmarshal(rawIn, &req); err != nil {
		return nil, errors.New("bad json: " + err.Error())
	}
	if req.Prompt == "" {
		return nil, errors.New("prompt is required")
	}
	if req.Model == "" {
		return nil, errors.New("model is required")
	}

	rewritten, err := geminiv2.BuildChatCompletionRequestForImage(req.Model, req.Prompt, req.ImageURLs)
	if err != nil {
		return nil, errors.New("build chat/completions body: " + err.Error())
	}

	c.Request.Body = io.NopCloser(bytes.NewBuffer(rewritten))
	c.Request.ContentLength = int64(len(rewritten))
	c.Request.URL.Path = "/v1/chat/completions"

	return &req, nil
}

// BuildGeminiImageOKResponse 从 chat/completions 响应里抽出图片列表，构造
// OpenAI images/generations 标准响应 {created, data:[{url}]}。
//
// 一张图都没抽到 → 返回错误，让调用方走"透传上游错误"路径（客户端看到的
// 是上游 chat/completions 的原始错误而非"success but empty"，减少误诊）。
func BuildGeminiImageOKResponse(rawChatResp []byte) (gin.H, error) {
	images := geminiv2.ExtractImagesFromChatCompletions(rawChatResp)
	if len(images) == 0 {
		return nil, errors.New("upstream returned no image parts in chat/completions response")
	}
	return buildSyncImagesResponse(images), nil
}

// RelayGeminiImage 是 /v1/images/generations 落到 Gemini 系渠道时的 handler。
// 由 controller/relay.go 的 relayHelper 分发进来。
func RelayGeminiImage(c *gin.Context) {
	ctx := c.Request.Context()

	if _, err := RewriteToGeminiChatCompletion(c); err != nil {
		errResp(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return
	}

	// 包一层 ResponseWriter，让 chat/completions relay 的输出先落到 buf，
	// 供我们抽图 + 二次包装。silentWriter 定义在 controller/playground_image.go。
	origWriter := c.Writer
	silent := &silentWriter{ResponseWriter: origWriter, buf: &bytes.Buffer{}}
	c.Writer = silent

	// 复用 chat/completions relay。distributor 已经在外层 relayHelper 之前
	// 跑过（我们是被它分发进来的），所以这里不重跑。直接 relayHelper 而不是
	// Relay(c)，是因为 Relay(c) 会跑 retry loop：Path 已被我们改成
	// /v1/chat/completions，如果 retry 挑到没有 chat 能力的渠道就会飞出去。
	// 简单起见 MVP 阶段不做跨请求重试，失败由客户端处理。
	bizErr := relayHelper(c, gRelayModeChatCompletions)
	if bizErr != nil {
		// 上游失败，透传原始错误给客户端。
		c.Writer = origWriter
		errResp(c, bizErr.StatusCode, bizErr.Error.Type, bizErr.Error.Message)
		return
	}
	if c.IsAborted() {
		silent.flushErr(origWriter)
		return
	}

	resp, err := BuildGeminiImageOKResponse(silent.buf.Bytes())
	if err != nil {
		logger.SysError("RelayGeminiImage: extract images failed: " + err.Error() +
			", raw=" + truncateForLog(silent.buf.String(), 500))
		// 上游 200 但没图 → 把上游原文透传，方便客户端排查
		silent.flushErr(origWriter)
		return
	}

	origWriter.Header().Set("Content-Type", "application/json")
	origWriter.WriteHeader(http.StatusOK)
	payload, _ := json.Marshal(resp)
	_, _ = origWriter.Write(payload)

	_ = ctx // reserved for future timing/quota metrics
}

// 引用 middleware 让 import 不被 goimports 清掉（下面我们没直接调用
// middleware，但预留给未来加限流分支使用）。
var _ = middleware.Distribute

func truncateForLog(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
