package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

func GetModelPrices(c *gin.Context) {
	prices, err := model.GetVisibleModelPrices()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": prices})
}

func AdminUpsertModelPrice(c *gin.Context) {
	var price model.ModelPrice
	if err := c.ShouldBindJSON(&price); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if err := model.UpsertModelPrice(&price); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": price})
}

func AdminDeleteModelPrice(c *gin.Context) {
	id := c.Param("id")
	if err := model.DB.Delete(&model.ModelPrice{}, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
