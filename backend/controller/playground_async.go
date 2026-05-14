package controller

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/middleware"
)

// PlaygroundAsyncSubmit 是 RelayTaskImage 的 session-auth 包装。
//
// /v1/images/generations 走 TokenAuth + Distribute，依赖 Bearer Token 设置 ChannelId/Channel；
// 广场用户用的是 Cookie session 登录，没有 Bearer，所以这里复用 playground 的渠道选择路径：
//   1. 解析请求体拿 model
//   2. 调 setupPlaygroundRelayContext 设置 ctxkey.Id / TokenId / RequestModel + Authorization
//   3. 调 middleware.Distribute() 选渠道（设置 ctxkey.ChannelId / Channel）
//   4. 还原 body，调 RelayTaskImage（它会再读一次 body）
//
// 失败一律 JSON 错误返回；Distribute 自己会写 abort 响应，这里检测 IsAborted 直接返回。
func PlaygroundAsyncSubmit(c *gin.Context) {
	// 1. 读 body 拿 model；同时保留原始 bytes 给 RelayTaskImage 复用
	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{"message": "read body: " + err.Error(), "type": "invalid_request_error"},
		})
		return
	}
	var head struct {
		Model string `json:"model"`
	}
	if err := json.Unmarshal(rawBody, &head); err != nil || head.Model == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{"message": "model required", "type": "invalid_request_error"},
		})
		return
	}

	userId := c.GetInt("id")

	// 2. 构造 relay 上下文（与 PlaygroundChat / PlaygroundGenerateImage 一致）
	if err := setupPlaygroundRelayContext(c, userId, head.Model); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{"message": err.Error(), "type": "internal"},
		})
		return
	}

	// 3. 还原 body（RelayTaskImage 还要再读一次）
	c.Request.Body = io.NopCloser(bytes.NewBuffer(rawBody))
	c.Request.ContentLength = int64(len(rawBody))

	// 4. Distribute 设置 ChannelId / Channel；失败时它会自己 abort + 写响应
	middleware.Distribute()(c)
	if c.IsAborted() {
		return
	}

	// 5. body 在 Distribute 里没动，但保险起见再还原一次
	c.Request.Body = io.NopCloser(bytes.NewBuffer(rawBody))
	c.Request.ContentLength = int64(len(rawBody))

	RelayTaskImage(c)
}
