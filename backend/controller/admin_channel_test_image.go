package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/adaptor/task"
	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

// AdminTestChannelImage runs a real image submit against the upstream for an async task channel.
// Does NOT consume quota or persist a task row — purely a connectivity / config test.
// Only valid for channel.Type ∈ {57 ApiMart, 58 Jimeng}.
//
// 标准 /api/channel/test/:id 走 chat-completions payload，被异步图像上游 400 拒绝，
// 因此专门拆一个端点出来。这里直接调 task adaptor 的 DoRequest 拿到上游 task_id 即视为通过，
// 不轮询 FetchTask（避免真的生成图、消耗上游配额）。
func AdminTestChannelImage(c *gin.Context) {
	idStr := c.Param("id")
	channelId, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid channel id",
		})
		return
	}

	channel, err := model.GetChannelById(channelId, true)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "channel not found: " + err.Error(),
		})
		return
	}

	platform := task.PlatformOf(channel.Type)
	adaptor := task.AdaptorOf(platform)
	if adaptor == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "channel type " + strconv.Itoa(channel.Type) + " is not an async task channel; use the regular test button",
		})
		return
	}

	// Pick first model from channel's models list as the test target
	testModel := ""
	if channel.Models != "" {
		parts := strings.Split(channel.Models, ",")
		if len(parts) > 0 {
			testModel = strings.TrimSpace(parts[0])
		}
	}
	if testModel == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "channel has no models configured",
		})
		return
	}

	// Resolve upstream model via channel.GetModelMapping if present
	upstreamModel := testModel
	if mapping := channel.GetModelMapping(); mapping != nil {
		if mapped, ok := mapping[testModel]; ok && mapped != "" {
			upstreamModel = mapped
		}
	}

	info := &common.TaskRelayInfo{
		ChannelID:         channel.Id,
		BaseURL:           channel.GetBaseURL(),
		APIKey:            channel.Key,
		OriginModelName:   testModel,
		UpstreamModelName: upstreamModel,
		Prompt:            "a small red apple on a white table, simple",
		Size:              "1:1",
		Resolution:        "1k",
		N:                 1,
	}

	adaptor.Init(info)
	if err := adaptor.ValidateRequest(info); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "validate failed: " + err.Error(),
			"model":   testModel,
		})
		return
	}

	body, err := adaptor.BuildRequestBody(info)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "build body failed: " + err.Error(),
			"model":   testModel,
		})
		return
	}

	startedAt := time.Now()
	upstreamTaskID, _, err := adaptor.DoRequest(info, body)
	elapsed := time.Since(startedAt).Milliseconds()

	if err != nil {
		logger.SysLog("admin test-image FAILED channel_id=" + strconv.Itoa(channel.Id) +
			" model=" + testModel + " err=" + err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success":    false,
			"message":    "upstream submit failed: " + err.Error(),
			"model":      testModel,
			"elapsed_ms": elapsed,
		})
		return
	}

	logger.SysLog("admin test-image OK channel_id=" + strconv.Itoa(channel.Id) +
		" model=" + testModel + " upstream_task_id=" + upstreamTaskID)
	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"message":          "submit succeeded (upstream task created — not polled to completion to avoid generating a real image)",
		"model":            testModel,
		"upstream_task_id": upstreamTaskID,
		"elapsed_ms":       elapsed,
	})
}
