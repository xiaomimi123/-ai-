package middleware

import (
	"bytes"
	"fmt"
	"io"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
)

func abortWithMessage(c *gin.Context, statusCode int, message string) {
	c.JSON(statusCode, gin.H{
		"error": gin.H{
			"message": helper.MessageWithRequestId(message, c.GetString(helper.RequestIdKey)),
			"type":    "one_api_error",
		},
	})
	c.Abort()
	logger.Error(c.Request.Context(), message)
}

func getRequestModel(c *gin.Context) (string, error) {
	var modelRequest ModelRequest

	// multipart 请求（目前只有 /v1/images/edits 官方图生图协议）走独立分支：
	// UnmarshalBodyReusable 对 multipart 的 ShouldBind 在实际测试中无法可靠
	// 抽出 model 字段（2026-07-06 线上 503 复现），因此这里直接 ParseMultipartForm
	// 取 FormValue。GetRequestBody 已经把全体 body 缓存到 ctxkey，我们读完后
	// 再把 Body 还原成 buffer 让下游 handler 能重新解析。
	contentType := c.Request.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		requestBody, err := common.GetRequestBody(c)
		if err != nil {
			return "", fmt.Errorf("get body for multipart: %w", err)
		}
		c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
		if err := c.Request.ParseMultipartForm(32 << 20); err != nil {
			return "", fmt.Errorf("parse multipart form: %w", err)
		}
		modelRequest.Model = c.Request.FormValue("model")
		// 还原 body 供下游 handler 再解析。ParseMultipartForm 已经把内容
		// 转移到 c.Request.MultipartForm，Body 保持 buffer 以防其他 handler
		// 也 io.ReadAll。
		c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
	} else {
		err := common.UnmarshalBodyReusable(c, &modelRequest)
		if err != nil {
			return "", fmt.Errorf("common.UnmarshalBodyReusable failed: %w", err)
		}
	}

	if strings.HasPrefix(c.Request.URL.Path, "/v1/moderations") {
		if modelRequest.Model == "" {
			modelRequest.Model = "text-moderation-stable"
		}
	}
	if strings.HasSuffix(c.Request.URL.Path, "embeddings") {
		if modelRequest.Model == "" {
			modelRequest.Model = c.Param("model")
		}
	}
	if strings.HasPrefix(c.Request.URL.Path, "/v1/images/generations") {
		if modelRequest.Model == "" {
			modelRequest.Model = "dall-e-2"
		}
	}
	// 官方 /v1/images/edits 客户端偶尔省略 model 字段（OpenAI SDK 默认可省），
	// 兜底成 gpt-image-1（灵镜当前 apimart 主力图像模型）。
	if strings.HasPrefix(c.Request.URL.Path, "/v1/images/edits") {
		if modelRequest.Model == "" {
			modelRequest.Model = "gpt-image-1"
		}
	}
	if strings.HasPrefix(c.Request.URL.Path, "/v1/audio/transcriptions") || strings.HasPrefix(c.Request.URL.Path, "/v1/audio/translations") {
		if modelRequest.Model == "" {
			modelRequest.Model = "whisper-1"
		}
	}
	return modelRequest.Model, nil
}

func isModelInList(modelName string, models string) bool {
	modelList := strings.Split(models, ",")
	for _, model := range modelList {
		if modelName == model {
			return true
		}
	}
	return false
}
