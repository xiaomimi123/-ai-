package controller

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

type GroupConfig struct {
	Key         string  `json:"key"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Priority    int     `json:"priority"`
	PriceRatio  float64 `json:"price_ratio"`
	RPMLimit    int64   `json:"rpm_limit"`
	TPMLimit    int64   `json:"tpm_limit"`
}

var UserGroups = []GroupConfig{
	{Key: "default", Name: "普通用户", Description: "默认用户组，使用标准渠道", Priority: 0, PriceRatio: 1.0, RPMLimit: 60, TPMLimit: 100000},
	{Key: "vip", Name: "VIP 用户", Description: "VIP 用户组，使用高速渠道", Priority: 1, PriceRatio: 1.0, RPMLimit: 300, TPMLimit: 500000},
	{Key: "pro", Name: "专业用户", Description: "专业用户组，无限制高速渠道", Priority: 2, PriceRatio: 0.9, RPMLimit: 0, TPMLimit: 0},
}

func GetGroupList(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": UserGroups})
}

func UpdateUserGroup(c *gin.Context) {
	var req struct {
		UserId int    `json:"user_id" binding:"required"`
		Group  string `json:"group" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	valid := false
	for _, g := range UserGroups {
		if g.Key == req.Group {
			valid = true
			break
		}
	}
	if !valid {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的用户组: " + req.Group})
		return
	}

	if err := model.DB.Model(&model.User{}).Where("id = ?", req.UserId).Update("group", req.Group).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": fmt.Sprintf("用户 #%d 已移入 %s 组", req.UserId, req.Group)})
}

func BatchUpdateUserGroup(c *gin.Context) {
	var req struct {
		UserIds []int  `json:"user_ids" binding:"required"`
		Group   string `json:"group" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	if err := model.DB.Model(&model.User{}).Where("id IN ?", req.UserIds).Update("group", req.Group).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "批量更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": fmt.Sprintf("已将 %d 个用户移入 %s 组", len(req.UserIds), req.Group)})
}

func GetGroupStats(c *gin.Context) {
	type GroupStat struct {
		Group string `json:"group"`
		Count int64  `json:"count"`
	}
	var stats []GroupStat
	model.DB.Model(&model.User{}).Select("`group`, count(*) as count").Group("`group`").Scan(&stats)

	result := make([]map[string]interface{}, 0)
	for _, stat := range stats {
		item := map[string]interface{}{"group": stat.Group, "count": stat.Count}
		for _, g := range UserGroups {
			if g.Key == stat.Group {
				item["name"] = g.Name
				item["rpm_limit"] = g.RPMLimit
				item["price_ratio"] = g.PriceRatio
				break
			}
		}
		result = append(result, item)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

func GetMyGroup(c *gin.Context) {
	userId := c.GetInt("id")
	var user model.User
	if err := model.DB.First(&user, userId).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return
	}

	group := user.Group
	if group == "" {
		group = "default"
	}

	var config *GroupConfig
	for _, g := range UserGroups {
		if g.Key == group {
			config = &g
			break
		}
	}
	if config == nil {
		config = &UserGroups[0]
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": config})
}
