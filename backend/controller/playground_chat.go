package controller

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/common/random"
	"github.com/songquanpeng/one-api/middleware"
	"github.com/songquanpeng/one-api/model"
)

const playgroundTokenName = "__playground__"

// playgroundChatReq 前端发起广场聊天的请求体
// ChatId 可选：不传则新建对话；传了则追加到已有对话
// 其余字段原样透传给 /v1/chat/completions（后端不解析 messages 内部结构）
type playgroundChatReq struct {
	ChatId   int64                    `json:"chat_id,omitempty"`
	Model    string                   `json:"model" binding:"required"`
	Messages []map[string]interface{} `json:"messages" binding:"required"`
	Stream   bool                     `json:"stream,omitempty"`
	// 其他 OpenAI 兼容字段（temperature / top_p / max_tokens 等）放 Extra
	Extra map[string]interface{} `json:"-"`
}

// PlaygroundChat 广场聊天：代理 /v1/chat/completions，成功后写入 playground_chats
// 鉴权：session（前置 UserAuth 中间件）+ 余额校验（PlaygroundBalanceCheck）
func PlaygroundChat(c *gin.Context) {
	// 读原始 body，允许透传非结构化字段
	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "读取请求失败"})
		return
	}
	var req playgroundChatReq
	if err := json.Unmarshal(rawBody, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请求体格式错误"})
		return
	}
	if req.Model == "" || len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "model 和 messages 必填"})
		return
	}

	userId := c.GetInt(ctxkey.Id)

	// 内容审核：只检查最后一条 user 消息（减少误判，用户多轮对话早期的合法内容不会被反复打分）
	if ok, hit := checkContentSafety(extractLastUserMessage(req.Messages)); !ok {
		logger.SysLog("playground chat blocked by content filter: user=" + strconv.Itoa(userId) + " keyword=" + hit)
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "消息包含不允许的内容",
			"code":    "CONTENT_FLAGGED",
		})
		return
	}

	// 准备或创建聊天记录：用户消息立刻入库（哪怕上游失败也有迹可循）
	chatId, err := ensurePlaygroundChat(userId, req.ChatId, req.Model, req.Messages)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "保存对话失败: " + err.Error()})
		return
	}
	// 通过响应头把 chat_id 回传前端（SSE 模式下 body 无法塞自定义字段）
	c.Writer.Header().Set("X-Playground-Chat-Id", strconv.FormatInt(chatId, 10))

	// 剥离我们自己加的 chat_id 字段，其余原样转发到 /v1/chat/completions
	passthrough := stripChatId(rawBody)
	c.Request.Body = io.NopCloser(bytes.NewBuffer(passthrough))
	c.Request.ContentLength = int64(len(passthrough))
	c.Request.URL.Path = "/v1/chat/completions"

	// 构造 relay 上下文（模拟 TokenAuth 的行为）
	if err := setupPlaygroundRelayContext(c, userId, req.Model); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	// 包一层 ResponseWriter：边转发边捕获 assistant 回复用于落库
	capture := &captureWriter{ResponseWriter: c.Writer, buf: &bytes.Buffer{}}
	c.Writer = capture

	// 分发渠道 → 调用 relay
	middleware.Distribute()(c)
	if c.IsAborted() {
		return
	}
	Relay(c)

	// 无论成功失败，尝试抽取 assistant 消息持久化
	if assistant := extractAssistantMessage(capture.buf.Bytes(), req.Stream); assistant != "" {
		appendAssistantMessage(chatId, userId, req.Messages, assistant, req.Model)
	}
}

// ensurePlaygroundChat 有 chat_id 就追加、没有就建新
// 建新时自动生成 title（取首条 user 消息前 20 字）
func ensurePlaygroundChat(userId int, chatId int64, modelName string, messages []map[string]interface{}) (int64, error) {
	if chatId > 0 {
		chat, err := model.GetPlaygroundChatById(chatId, userId)
		if err != nil {
			return 0, err
		}
		bs, _ := json.Marshal(messages)
		return chat.Id, model.UpdatePlaygroundChatMessages(chat.Id, userId, string(bs))
	}
	// 新建
	title := extractTitle(messages)
	bs, _ := json.Marshal(messages)
	chat := &model.PlaygroundChat{
		UserId:   userId,
		Title:    title,
		Model:    modelName,
		Messages: string(bs),
	}
	if err := model.CreatePlaygroundChat(chat); err != nil {
		return 0, err
	}
	return chat.Id, nil
}

// appendAssistantMessage 在已有 messages 数组末尾追加 assistant 回复并存库
// 失败不中断主流程，仅 log（用户看得到流式回复，"历史没存上"不会立刻报障）
func appendAssistantMessage(chatId int64, userId int, userMessages []map[string]interface{}, assistant, modelName string) {
	all := append(userMessages, map[string]interface{}{
		"role":    "assistant",
		"content": assistant,
	})
	bs, err := json.Marshal(all)
	if err != nil {
		logger.SysError("playground: marshal messages failed: " + err.Error())
		return
	}
	if err := model.UpdatePlaygroundChatMessages(chatId, userId, string(bs)); err != nil {
		logger.SysError("playground: save assistant message failed: " + err.Error())
	}
}

// extractTitle 取首条 user 消息前 20 个字符作为 title
func extractTitle(messages []map[string]interface{}) string {
	for _, m := range messages {
		if role, _ := m["role"].(string); role != "user" {
			continue
		}
		content, _ := m["content"].(string)
		content = strings.TrimSpace(content)
		if content == "" {
			continue
		}
		runes := []rune(content)
		if len(runes) > 20 {
			return string(runes[:20]) + "…"
		}
		return content
	}
	return "新对话"
}

// stripChatId 从前端 body 里把我们自己塞的 chat_id 字段删掉，避免透传到上游
func stripChatId(raw []byte) []byte {
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return raw
	}
	delete(m, "chat_id")
	out, err := json.Marshal(m)
	if err != nil {
		return raw
	}
	return out
}

// setupPlaygroundRelayContext 构造 relay 所需的 ctxkey 上下文
// 关键点：
//   - 为当前用户 ensure 一个隐藏的 Playground token（UnlimitedQuota=true，余额控制走用户 quota）
//   - 设置 Authorization header 让下游路径中的老逻辑能读到（容错）
func setupPlaygroundRelayContext(c *gin.Context, userId int, modelName string) error {
	token, err := ensurePlaygroundToken(userId)
	if err != nil {
		return err
	}
	c.Set(ctxkey.Id, userId)
	c.Set(ctxkey.TokenId, token.Id)
	c.Set(ctxkey.TokenName, token.Name)
	c.Set(ctxkey.RequestModel, modelName)
	c.Request.Header.Set("Authorization", "Bearer "+token.Key)
	// 让 relay 走通用模型校验：Distribute 会用 RequestModel 查渠道
	return nil
}

// ensurePlaygroundToken 保证用户有一个 "__playground__" token
// 存在则复用，不存在则新建（UnlimitedQuota=true）
func ensurePlaygroundToken(userId int) (*model.Token, error) {
	tokens, err := model.GetAllUserTokens(userId, 0, 200, "")
	if err != nil {
		return nil, err
	}
	for _, t := range tokens {
		if t.Name == playgroundTokenName {
			return t, nil
		}
	}
	t := &model.Token{
		UserId:         userId,
		Name:           playgroundTokenName,
		Key:            random.GenerateKey(),
		CreatedTime:    helper.GetTimestamp(),
		AccessedTime:   helper.GetTimestamp(),
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Status:         model.TokenStatusEnabled,
	}
	if err := t.Insert(); err != nil {
		return nil, err
	}
	return t, nil
}

// captureWriter 透明包装 gin.ResponseWriter，同时把写入内容复制一份到 buf
type captureWriter struct {
	gin.ResponseWriter
	buf *bytes.Buffer
}

func (w *captureWriter) Write(b []byte) (int, error) {
	w.buf.Write(b)
	return w.ResponseWriter.Write(b)
}

func (w *captureWriter) WriteString(s string) (int, error) {
	w.buf.WriteString(s)
	return w.ResponseWriter.WriteString(s)
}

// extractAssistantMessage 从 relay 输出里抽出 assistant 文本
// - 流式：按 SSE 逐行解析 data: {...}，拼 delta.content
// - 非流式：解析为 JSON，读 choices[0].message.content
// 只在最佳努力下工作；抽不到就返回空字符串，调用方会跳过落库
func extractAssistantMessage(raw []byte, streamed bool) string {
	if len(raw) == 0 {
		return ""
	}
	if streamed {
		return parseSSEAssistant(raw)
	}
	return parseJSONAssistant(raw)
}

func parseSSEAssistant(raw []byte) string {
	var sb strings.Builder
	for _, line := range bytes.Split(raw, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		payload := bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
		if len(payload) == 0 || bytes.Equal(payload, []byte("[DONE]")) {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal(payload, &chunk); err != nil {
			continue
		}
		for _, ch := range chunk.Choices {
			sb.WriteString(ch.Delta.Content)
		}
	}
	return sb.String()
}

func parseJSONAssistant(raw []byte) string {
	var resp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return ""
	}
	if len(resp.Choices) == 0 {
		return ""
	}
	return resp.Choices[0].Message.Content
}

