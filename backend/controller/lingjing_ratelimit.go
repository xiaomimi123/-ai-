package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

// SetTokenRateLimit 管理员设置令牌速率限制
func SetTokenRateLimit(c *gin.Context) {
	tokenIdStr := c.Param("id")
	tokenId, err := strconv.Atoi(tokenIdStr)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的令牌 ID"})
		return
	}

	var req struct {
		RPM int64 `json:"rpm"`
		TPM int64 `json:"tpm"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	// 使用原始 SQL 更新（Token 模型可能没有 rpm/tpm 字段）
	if err := model.DB.Exec("UPDATE tokens SET rpm = ?, tpm = ? WHERE id = ?", req.RPM, req.TPM, tokenId).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "更新失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("令牌 #%d 速率限制已更新：RPM=%d, TPM=%d", tokenId, req.RPM, req.TPM),
	})
}
