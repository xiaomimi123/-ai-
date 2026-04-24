package controller

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/model"
)

// imageModelIds 广场画图支持的模型（首版写死）
// 扩展时新增 model_id 并确保后端渠道里有对应路由；客户端按此名字显示
var imageModelIds = map[string]bool{
	"gpt-image-1":             true,
	"gpt-image-2":             true,
	"dall-e-3":                true,
	"gemini-2.5-flash-image":  true,
	"nano-banana":             true, // Gemini 2.5 Flash Image 的别名
}

type playgroundModel struct {
	Id            string  `json:"id"`
	Name          string  `json:"name"`
	Provider      string  `json:"provider"`
	Description   string  `json:"description"`
	Logo          string  `json:"logo"`
	InputPrice    float64 `json:"input_price,omitempty"`
	OutputPrice   float64 `json:"output_price,omitempty"`
	ContextWindow string  `json:"context_window,omitempty"`
	Featured      bool    `json:"featured"`
}

// GetPlaygroundModels 返回广场可用的聊天/画图模型列表
// 数据源：model_prices 表（只取 is_visible=true）
// 分组依据：model_id 在 imageModelIds 里 → image，否则 → chat
func GetPlaygroundModels(c *gin.Context) {
	prices, err := model.GetVisibleModelPrices()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	chat := make([]playgroundModel, 0)
	image := make([]playgroundModel, 0)
	for _, p := range prices {
		item := playgroundModel{
			Id:            p.ModelId,
			Name:          p.Name,
			Provider:      p.Provider,
			Description:   p.Description,
			Logo:          p.Logo,
			InputPrice:    p.InputPrice,
			OutputPrice:   p.OutputPrice,
			ContextWindow: p.ContextWindow,
			Featured:      p.Featured,
		}
		if isImageModel(p.ModelId) {
			image = append(image, item)
		} else {
			chat = append(chat, item)
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"chat":  chat,
			"image": image,
		},
	})
}

// isImageModel 按 model_id 判断是否属于画图模型
// 大小写不敏感；另外兼容 "xx-image" / "image-xx" 命名前后缀以便将来新增模型不需改代码
func isImageModel(modelId string) bool {
	lower := strings.ToLower(modelId)
	if imageModelIds[lower] {
		return true
	}
	if strings.Contains(lower, "dall-e") || strings.Contains(lower, "gpt-image") {
		return true
	}
	if strings.Contains(lower, "flash-image") || strings.Contains(lower, "nano-banana") {
		return true
	}
	return false
}
