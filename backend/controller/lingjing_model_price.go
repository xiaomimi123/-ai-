package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

// ====== 公开接口 ======

// GetModelPrices 公开接口：返回前台可见的模型（模型广场使用）
// 注意 handler 名保持为 GetModelPrices 以避免破坏 router 现有引用；内部语义是「公开可见」
func GetModelPrices(c *gin.Context) {
	prices, err := model.GetVisibleModelPrices()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": prices})
}

// GetPublicModelPrices spec 指定的别名，语义等同 GetModelPrices
func GetPublicModelPrices(c *gin.Context) {
	GetModelPrices(c)
}

// ====== 管理员 CRUD ======

// AdminGetModelPrices 管理员获取所有模型（包含隐藏）
func AdminGetModelPrices(c *gin.Context) {
	var prices []model.ModelPrice
	model.DB.Order("sort_order ASC, id ASC").Find(&prices)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": prices})
}

// AdminCreateModelPrice 新增模型
func AdminCreateModelPrice(c *gin.Context) {
	var m model.ModelPrice
	if err := c.ShouldBindJSON(&m); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误: " + err.Error()})
		return
	}
	if m.ModelId == "" || m.Name == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "model_id 和 name 不能为空"})
		return
	}
	if err := model.DB.Create(&m).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "创建失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": m})
}

// AdminUpdateModelPrice 修改模型（全量覆盖）
func AdminUpdateModelPrice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效 ID"})
		return
	}
	var existing model.ModelPrice
	if err := model.DB.First(&existing, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "模型不存在"})
		return
	}
	var payload model.ModelPrice
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误: " + err.Error()})
		return
	}
	payload.Id = id
	// 保留 CreatedAt，避免被覆盖为 0
	payload.CreatedAt = existing.CreatedAt
	if err := model.DB.Save(&payload).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "更新失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": payload})
}

// AdminDeleteModelPrice 删除模型定价
func AdminDeleteModelPrice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效 ID"})
		return
	}
	if err := model.DB.Delete(&model.ModelPrice{}, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "已删除"})
}

// AdminToggleModelVisibility 切换显示/隐藏
func AdminToggleModelVisibility(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效 ID"})
		return
	}
	var m model.ModelPrice
	if err := model.DB.First(&m, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "模型不存在"})
		return
	}
	m.IsVisible = !m.IsVisible
	if err := model.DB.Save(&m).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	status := "已显示"
	if !m.IsVisible {
		status = "已隐藏"
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": status, "data": m})
}

// AdminUpsertModelPrice 兼容老 handler —— router 旧引用保留；等同 create-or-update
func AdminUpsertModelPrice(c *gin.Context) {
	var m model.ModelPrice
	if err := c.ShouldBindJSON(&m); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误: " + err.Error()})
		return
	}
	if err := model.UpsertModelPrice(&m); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": m})
}
