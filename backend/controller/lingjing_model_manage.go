package controller

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
)

// ModelInfo 统一模型信息
type ModelInfo struct {
	ModelName       string  `json:"model_name"`
	InputRatio      float64 `json:"input_ratio"`      // 输入倍率
	CompletionRatio float64 `json:"completion_ratio"`  // 补全倍率（相对于输入的倍数）
	InputPrice      float64 `json:"input_price"`       // 前台展示输入价格
	OutputPrice     float64 `json:"output_price"`      // 前台展示输出价格
	Provider        string  `json:"provider"`          // 供应商
	Category        string  `json:"category"`          // 分类
	Description     string  `json:"description"`       // 描述
	IsVisible       int     `json:"is_visible"`        // 前台是否可见
	PriceId         int     `json:"price_id"`          // ModelPrice 表的 ID，0 表示未配置定价
	ChannelCount    int     `json:"channel_count"`     // 提供此模型的渠道数
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
		priceMap[prices[i].ModelName] = &prices[i]
	}

	// 3. 获取倍率
	modelRatios := billingratio.ModelRatio
	completionRatios := billingratio.CompletionRatio

	// 4. 合并结果
	result := make([]ModelInfo, 0)

	// 先处理 Ability 表中的模型
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
			info.InputPrice = p.InputPrice
			info.OutputPrice = p.OutputPrice
			info.Provider = p.Provider
			info.Category = p.Category
			info.Description = p.Description
			info.IsVisible = p.IsVisible
			info.PriceId = p.Id
		}
		result = append(result, info)
		seen[mc.Model] = true
	}

	// 再加上定价表中有但 Ability 没有的模型（可能是手动添加的）
	for _, p := range prices {
		if !seen[p.ModelName] {
			info := ModelInfo{
				ModelName:       p.ModelName,
				InputRatio:      modelRatios[p.ModelName],
				CompletionRatio: completionRatios[p.ModelName],
				InputPrice:      p.InputPrice,
				OutputPrice:     p.OutputPrice,
				Provider:        p.Provider,
				Category:        p.Category,
				Description:     p.Description,
				IsVisible:       p.IsVisible,
				PriceId:         p.Id,
				ChannelCount:    0,
			}
			result = append(result, info)
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

// AdminUpdateModel 统一更新模型的倍率 + 定价
type UpdateModelRequest struct {
	ModelName       string  `json:"model_name" binding:"required"`
	InputRatio      float64 `json:"input_ratio"`
	CompletionRatio float64 `json:"completion_ratio"`
	InputPrice      float64 `json:"input_price"`
	OutputPrice     float64 `json:"output_price"`
	Provider        string  `json:"provider"`
	Category        string  `json:"category"`
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

	// 更新或创建定价记录
	price := &model.ModelPrice{
		ModelName:   req.ModelName,
		InputPrice:  req.InputPrice,
		OutputPrice: req.OutputPrice,
		Provider:    req.Provider,
		Category:    req.Category,
		Description: req.Description,
		IsVisible:   req.IsVisible,
	}

	// 查找已存在的记录
	var existing model.ModelPrice
	if err := model.DB.Where("model_name = ?", req.ModelName).First(&existing).Error; err == nil {
		price.Id = existing.Id
	}
	model.UpsertModelPrice(price)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "模型配置已更新"})
}

// AdminDeleteModel 从「模型管理」列表移除一个模型
//
// 背景：AdminGetAllModels 是 abilities 和 model_prices 两表的 UNION。
// 删除渠道时 One API 会自动清 abilities，但 model_prices 是灵镜扩展表不会联动，
// 导致列表里残留 channel_count=0 的「僵尸模型」。此 handler 清理这类残留。
//
// 行为：
//   1. 删 model_prices 定价记录（前台模型广场也会同步消失）
//   2. 兜底删 abilities 里指向已不存在 channel 的残留行
//   3. 不动 ModelRatio/CompletionRatio（倍率 map 全局共用，可能被别的同名模型引用）
func AdminDeleteModel(c *gin.Context) {
	modelName := c.Query("model_name")
	if modelName == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "model_name 必填"})
		return
	}

	// 1. 删 model_prices
	priceRes := model.DB.Where("model_name = ?", modelName).Delete(&model.ModelPrice{})
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
