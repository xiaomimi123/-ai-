package model

import (
	"errors"

	"gorm.io/gorm"
)

// PlaygroundChat 模型广场聊天历史
// messages 字段存 JSON 数组，结构：[{"role":"user|assistant","content":"..."}, ...]
// 每用户最多保留 50 条，新建时淘汰最老
type PlaygroundChat struct {
	Id        int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId    int    `json:"user_id" gorm:"index:idx_user_time,priority:1;not null"`
	Title     string `json:"title" gorm:"size:100"`
	Model     string `json:"model" gorm:"size:64"`
	Messages  string `json:"messages" gorm:"type:json"` // 存 JSON 字符串
	CreatedAt int64  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt int64  `json:"updated_at" gorm:"index:idx_user_time,priority:2;autoUpdateTime"`
}

const playgroundChatMaxPerUser = 50

// InitPlaygroundTables 初始化广场相关表
func InitPlaygroundTables() error {
	return DB.AutoMigrate(&PlaygroundChat{})
}

// CreatePlaygroundChat 创建新对话，并清理超限的老对话
func CreatePlaygroundChat(chat *PlaygroundChat) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(chat).Error; err != nil {
			return err
		}
		return trimPlaygroundChats(tx, chat.UserId)
	})
}

// UpdatePlaygroundChatMessages 追加/覆盖消息并更新 updated_at
func UpdatePlaygroundChatMessages(chatId int64, userId int, messages string) error {
	return DB.Model(&PlaygroundChat{}).
		Where("id = ? AND user_id = ?", chatId, userId).
		Update("messages", messages).Error
}

// GetPlaygroundChatById 取单条对话（校验归属）
func GetPlaygroundChatById(chatId int64, userId int) (*PlaygroundChat, error) {
	var chat PlaygroundChat
	err := DB.Where("id = ? AND user_id = ?", chatId, userId).First(&chat).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("对话不存在")
		}
		return nil, err
	}
	return &chat, nil
}

// ListPlaygroundChats 返回用户的对话列表（只取摘要字段，不含 messages）
func ListPlaygroundChats(userId int, offset, limit int) ([]PlaygroundChat, int64, error) {
	var chats []PlaygroundChat
	var total int64
	q := DB.Model(&PlaygroundChat{}).Where("user_id = ?", userId)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Select("id", "user_id", "title", "model", "created_at", "updated_at").
		Order("updated_at DESC").
		Offset(offset).Limit(limit).
		Find(&chats).Error
	return chats, total, err
}

// DeletePlaygroundChat 删除单条
func DeletePlaygroundChat(chatId int64, userId int) error {
	return DB.Where("id = ? AND user_id = ?", chatId, userId).
		Delete(&PlaygroundChat{}).Error
}

// trimPlaygroundChats 淘汰超过 50 条的老对话
// 保留最近 50 条（按 updated_at DESC），其余删除
func trimPlaygroundChats(tx *gorm.DB, userId int) error {
	var ids []int64
	if err := tx.Model(&PlaygroundChat{}).
		Where("user_id = ?", userId).
		Order("updated_at DESC").
		Offset(playgroundChatMaxPerUser).
		Limit(10000). // 兜底上限，避免理论上的 OOM
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	return tx.Where("user_id = ? AND id IN ?", userId, ids).
		Delete(&PlaygroundChat{}).Error
}
