package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

func GetPlans(c *gin.Context) {
	plans, err := model.GetActivePlans()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": plans})
}

func AdminGetPlans(c *gin.Context) {
	var plans []model.Plan
	model.DB.Order("sort_order ASC, id ASC").Find(&plans)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": plans})
}

func AdminCreatePlan(c *gin.Context) {
	var plan model.Plan
	if err := c.ShouldBindJSON(&plan); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if plan.Name == "" || plan.Price <= 0 || plan.Quota <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "名称、价格和额度必填"})
		return
	}
	plan.CreatedAt = time.Now().Unix()
	plan.UpdatedAt = time.Now().Unix()
	if err := model.DB.Create(&plan).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": plan})
}

func AdminUpdatePlan(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var existing model.Plan
	if err := model.DB.First(&existing, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐不存在"})
		return
	}
	var plan model.Plan
	if err := c.ShouldBindJSON(&plan); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	plan.Id = id
	plan.CreatedAt = existing.CreatedAt
	plan.UpdatedAt = time.Now().Unix()
	if err := model.DB.Save(&plan).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": plan})
}

func AdminDeletePlan(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := model.DeletePlan(id); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminTogglePlan(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var plan model.Plan
	if err := model.DB.First(&plan, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "套餐不存在"})
		return
	}
	plan.IsAvailable = !plan.IsAvailable
	plan.UpdatedAt = time.Now().Unix()
	model.DB.Save(&plan)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": plan})
}
