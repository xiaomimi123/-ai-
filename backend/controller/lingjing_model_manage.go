package controller

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
)

// ModelInfo 统一模型信息（聚合 abilities + model_prices + 倍率 map）
// 注意：ModelPrice schema 改为 ModelId/Name 后，这里 ModelName 字段对外
// 保留原 JSON 名（admin 前端依赖），值取 ModelId 或 ability.Model
type ModelInfo struct {
	ModelName       string  `json:"model_name"`         // API 调用用的模型 id
	DisplayName     string  `json:"display_name"`        // ModelPrice.Name 展示名
	InputRatio      float64 `json:"input_ratio"`
	CompletionRatio float64 `json:"completion_ratio"`
	InputPrice      float64 `json:"input_price"`
	OutputPrice     float64 `json:"output_price"`
	Provider        string  `json:"provider"`
	Description     string  `json:"description"`
	IsVisible       int     `json:"is_visible"` // 0/1（前端期望 int）
	PriceId         int     `json:"price_id"`
	ChannelCount    int     `json:"channel_count"`
}

// AdminGetAllModels 获取系统中所有模型的统一视图
func AdminGetAllModels(c *gin.Context) {
	// 1. 从 Ability 表获取所有去重模型 + 渠道数
	type modelChannel struct {
		Model        string `json:"model"`
		ChannelCount int    `json:"channel_count"`
	}
	var modelChannels []modelChannel
	model.DB.Raw(`
		SELECT model, COUNT(DISTINCT channel_id) as channel_count
		FROM abilities
		WHERE enabled = 1
		GROUP BY model
		ORDER BY model
	`).Scan(&modelChannels)

	// 2. 获取所有 ModelPrice 记录（定价表）
	var prices []model.ModelPrice
	model.DB.Find(&prices)
	priceMap := make(map[string]*model.ModelPrice)
	for i := range prices {
		priceMap[prices[i].ModelId] = &prices[i]
	}

	// 3. 获取倍率
	modelRatios := billingratio.ModelRatio
	completionRatios := billingratio.CompletionRatio

	// 4. 合并结果
	result := make([]ModelInfo, 0)
	seen := make(map[string]bool)
	for _, mc := range modelChannels {
		info := ModelInfo{
			ModelName:       mc.Model,
			InputRatio:      modelRatios[mc.Model],
			CompletionRatio: completionRatios[mc.Model],
			ChannelCount:    mc.ChannelCount,
			IsVisible:       0,
		}
		if p, ok := priceMap[mc.Model]; ok {
			info.DisplayName = p.Name
			info.InputPrice = p.InputPrice
			info.OutputPrice = p.OutputPrice
			info.Provider = p.Provider
			info.Description = p.Description
			if p.IsVisible {
				info.IsVisible = 1
			}
			info.PriceId = p.Id
		}
		result = append(result, info)
		seen[mc.Model] = true
	}

	// 再加上定价表中有但 Ability 没有的模型
	for _, p := range prices {
		if !seen[p.ModelId] {
			isVis := 0
			if p.IsVisible {
				isVis = 1
			}
			info := ModelInfo{
				ModelName:       p.ModelId,
				DisplayName:     p.Name,
				InputRatio:      modelRatios[p.ModelId],
				CompletionRatio: completionRatios[p.ModelId],
				InputPrice:      p.InputPrice,
				OutputPrice:     p.OutputPrice,
				Provider:        p.Provider,
				Description:     p.Description,
				IsVisible:       isVis,
				PriceId:         p.Id,
				ChannelCount:    0,
			}
			result = append(result, info)
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

// UpdateModelRequest 保留旧 JSON 字段名，前端 admin ModelManage 仍按老字段提交
type UpdateModelRequest struct {
	ModelName       string  `json:"model_name" binding:"required"`
	DisplayName     string  `json:"display_name"`
	InputRatio      float64 `json:"input_ratio"`
	CompletionRatio float64 `json:"completion_ratio"`
	InputPrice      float64 `json:"input_price"`
	OutputPrice     float64 `json:"output_price"`
	Provider        string  `json:"provider"`
	Description     string  `json:"description"`
	IsVisible       int     `json:"is_visible"`
}

func AdminUpdateModel(c *gin.Context) {
	var req UpdateModelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	// 更新倍率（内存）
	billingratio.ModelRatio[req.ModelName] = req.InputRatio
	if req.CompletionRatio > 0 {
		billingratio.CompletionRatio[req.ModelName] = req.CompletionRatio
	}
	// 同步倍率到数据库 option
	model.UpdateOption("ModelRatio", billingratio.ModelRatio2JSONString())
	model.UpdateOption("CompletionRatio", billingratio.CompletionRatio2JSONString())

	// 更新或创建定价记录（新 schema 用 ModelId）
	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.ModelName
	}
	price := &model.ModelPrice{
		ModelId:     req.ModelName,
		Name:        displayName,
		InputPrice:  req.InputPrice,
		OutputPrice: req.OutputPrice,
		Provider:    req.Provider,
		Description: req.Description,
		IsVisible:   req.IsVisible == 1,
	}

	// 查找已存在的记录（保留老字段也可以，model_id 是新唯一键）
	var existing model.ModelPrice
	if err := model.DB.Where("model_id = ?", req.ModelName).First(&existing).Error; err == nil {
		price.Id = existing.Id
		price.CreatedAt = existing.CreatedAt
		// 保留已设好的展示字段（不要被没传的字段覆盖为空）
		if displayName == req.ModelName && existing.Name != "" {
			price.Name = existing.Name
		}
		price.Tags = existing.Tags
		price.Logo = existing.Logo
		price.ContextWindow = existing.ContextWindow
		price.Featured = existing.Featured
		price.SortOrder = existing.SortOrder
	}
	if err := model.UpsertModelPrice(price); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "模型配置已更新"})
}

// AdminDeleteModel 从「模型管理」列表移除一个模型
func AdminDeleteModel(c *gin.Context) {
	modelName := c.Query("model_name")
	if modelName == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "model_name 必填"})
		return
	}

	// 1. 删 model_prices（新 schema 按 model_id 匹配）
	priceRes := model.DB.Where("model_id = ?", modelName).Delete(&model.ModelPrice{})
	if priceRes.Error != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": priceRes.Error.Error()})
		return
	}

	// 2. 兜底清理 abilities 残留：该 model 名下但 channel_id 已不存在于 channels 表
	abilityRes := model.DB.Exec(
		"DELETE FROM abilities WHERE model = ? AND channel_id NOT IN (SELECT id FROM channels)",
		modelName,
	)

	logger.SysLog(fmt.Sprintf("admin removed model: name=%s deleted_prices=%d deleted_abilities=%d",
		modelName, priceRes.RowsAffected, abilityRes.RowsAffected))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("已移除模型 %s（清除 %d 条定价 + %d 条残留 ability）",
			modelName, priceRes.RowsAffected, abilityRes.RowsAffected),
	})
}
