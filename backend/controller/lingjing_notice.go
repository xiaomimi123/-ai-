package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

func GetNotices(c *gin.Context) {
	notices, err := model.GetActiveNotices()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": notices})
}

func AdminCreateNotice(c *gin.Context) {
	var notice model.Notice
	if err := c.ShouldBindJSON(&notice); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if err := model.CreateNotice(&notice); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": notice})
}

func AdminDeleteNotice(c *gin.Context) {
	id := c.Param("id")
	if err := model.DB.Delete(&model.Notice{}, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
