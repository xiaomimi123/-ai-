package model

import (
	"fmt"
	"time"

	"github.com/songquanpeng/one-api/common/logger"
)

// Order 支付订单表
type Order struct {
	Id            int     `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId        int     `json:"user_id" gorm:"index;not null"`
	OrderNo       string  `json:"order_no" gorm:"uniqueIndex;size:64;not null"`
	PlanId        int     `json:"plan_id" gorm:"default:0"`
	Amount        float64 `json:"amount" gorm:"type:decimal(10,2);not null"`
	Quota         int64   `json:"quota" gorm:"not null"`
	Status        int     `json:"status" gorm:"default:0"` // 0待支付 1已支付 2已取消
	PaymentMethod string  `json:"payment_method" gorm:"size:20"`
	TradeNo       string  `json:"trade_no" gorm:"size:128"`
	Remark        string  `json:"remark" gorm:"size:255"`
	CreatedAt     int64   `json:"created_at" gorm:"autoCreateTime"`
	PaidAt        int64   `json:"paid_at"`
}

// Referral 分销关系表
type Referral struct {
	Id             int       `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId         int       `json:"user_id" gorm:"uniqueIndex;not null"`
	InviterId      int       `json:"inviter_id" gorm:"index;not null"`
	CommissionRate float64   `json:"commission_rate" gorm:"type:decimal(4,2);default:0.10"`
	CreatedAt      time.Time `json:"created_at"`
}

// Commission 佣金记录表
type Commission struct {
	Id         int       `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId     int       `json:"user_id" gorm:"index;not null"`
	FromUserId int       `json:"from_user_id" gorm:"not null"`
	OrderId    int       `json:"order_id"`
	Amount     float64   `json:"amount" gorm:"type:decimal(10,2);not null"`
	Status     int       `json:"status" gorm:"default:0"` // 0待结算 1已结算
	CreatedAt  time.Time `json:"created_at"`
}

// UserNotification 个人通知表
// type: withdraw_approved / withdraw_rejected / withdraw_paid / topup_success / system
type UserNotification struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId    int    `json:"user_id" gorm:"index;not null"`
	Title     string `json:"title" gorm:"size:128"`
	Content   string `json:"content" gorm:"size:512"`
	Type      string `json:"type" gorm:"size:32;index"`
	IsRead    bool   `json:"is_read" gorm:"default:false;index"`
	CreatedAt int64  `json:"created_at" gorm:"autoCreateTime"`
}

// WithdrawRequest 提现申请表
// status: 0=待审核 1=已通过 2=已拒绝 3=已打款
type WithdrawRequest struct {
	Id            int     `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId        int     `json:"user_id" gorm:"index;not null"`
	Amount        float64 `json:"amount" gorm:"type:decimal(10,2);not null"`
	AlipayAccount string  `json:"alipay_account" gorm:"size:100"`
	RealName      string  `json:"real_name" gorm:"size:50"`
	Status        int     `json:"status" gorm:"default:0;index"`
	RejectReason  string  `json:"reject_reason" gorm:"size:255"`
	AdminRemark   string  `json:"admin_remark" gorm:"size:255"`
	CreatedAt     int64   `json:"created_at" gorm:"autoCreateTime"`
	ProcessedAt   int64   `json:"processed_at"`
	ProcessedBy   int     `json:"processed_by"`
}

// Plan 套餐定价表
type Plan struct {
	Id          int     `json:"id" gorm:"primaryKey;autoIncrement"`
	Name        string  `json:"name" gorm:"size:100;not null"`
	Description string  `json:"description" gorm:"size:500"`
	Price       float64 `json:"price" gorm:"type:decimal(10,2);not null"`
	Quota       int64   `json:"quota" gorm:"not null"`
	BonusQuota  int64   `json:"bonus_quota" gorm:"default:0"`
	IsAvailable bool    `json:"is_available" gorm:"default:true"`
	SortOrder   int     `json:"sort_order" gorm:"default:0"`
	CreatedAt   int64   `json:"created_at"`
	UpdatedAt   int64   `json:"updated_at"`
}

// Notice 公告表
type Notice struct {
	Id        int       `json:"id" gorm:"primaryKey;autoIncrement"`
	Title     string    `json:"title" gorm:"size:200;not null"`
	Content   string    `json:"content" gorm:"type:text"`
	IsActive  int       `json:"is_active" gorm:"default:1"`
	SortOrder int       `json:"sort_order" gorm:"default:0"`
	CreatedAt time.Time `json:"created_at"`
}

// ModelPrice 模型定价表（模型广场展示信息）
// Logo 字段存品牌名（LobeHub icons key），如 "deepseek" / "openai" / "anthropic"
// Tags 逗号分隔，如 "对话,国产"；ContextWindow 展示字符串，如 "64K" / "1M"
type ModelPrice struct {
	Id            int     `json:"id" gorm:"primaryKey;autoIncrement"`
	ModelId       string  `json:"model_id" gorm:"uniqueIndex;size:64"` // 即 API 调用时填的 model 值
	Name          string  `json:"name" gorm:"size:64"`                 // 展示名，如 "Claude Sonnet 4.6"
	Provider      string  `json:"provider" gorm:"size:32"`
	Description   string  `json:"description" gorm:"size:512"`
	Tags          string  `json:"tags" gorm:"size:128"`           // 逗号分隔
	Logo          string  `json:"logo" gorm:"size:32"`            // LobeHub icon key
	InputPrice    float64 `json:"input_price" gorm:"type:decimal(10,4)"`
	OutputPrice   float64 `json:"output_price" gorm:"type:decimal(10,4)"`
	ContextWindow string  `json:"context_window" gorm:"size:16"`
	Featured      bool    `json:"featured" gorm:"default:false"`
	IsVisible     bool    `json:"is_visible" gorm:"default:true"`
	SortOrder     int     `json:"sort_order" gorm:"default:0;index"`
	CreatedAt     int64   `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt     int64   `json:"updated_at" gorm:"autoUpdateTime"`
}

// InitLingjingTables 初始化灵镜AI扩展表
func InitLingjingTables() error {
	err := DB.AutoMigrate(
		&Order{},
		&Referral{},
		&Commission{},
		&Plan{},
		&Notice{},
		&ModelPrice{},
		&WithdrawRequest{},
		&UserNotification{},
	)
	if err != nil {
		return err
	}
	// 扩展 Token 表添加速率限制字段（忽略已存在的错误）
	DB.Exec("ALTER TABLE tokens ADD COLUMN rpm BIGINT DEFAULT 0")
	DB.Exec("ALTER TABLE tokens ADD COLUMN tpm BIGINT DEFAULT 0")

	// model_prices 老数据兼容：旧 schema 字段 model_name，新 schema 用 model_id + name
	// 已存在的行若 model_id 为空，用 model_name 回填，保证老数据在新 UI 能显示
	DB.Exec("UPDATE model_prices SET model_id = model_name WHERE (model_id IS NULL OR model_id = '') AND model_name IS NOT NULL AND model_name != ''")
	DB.Exec("UPDATE model_prices SET name = model_name WHERE (name IS NULL OR name = '') AND model_name IS NOT NULL AND model_name != ''")

	// 空表注入 10 条默认展示模型
	var modelCount int64
	DB.Model(&ModelPrice{}).Count(&modelCount)
	if modelCount == 0 {
		logger.SysLog("seeding default model prices...")
		defaults := []ModelPrice{
			{ModelId: "deepseek-chat", Name: "DeepSeek V3", Provider: "DeepSeek", Description: "综合能力旗舰，性价比之王，适合日常开发和内容创作", Tags: "对话,国产", Logo: "deepseek", InputPrice: 0.002, OutputPrice: 0.008, ContextWindow: "64K", Featured: false, IsVisible: true, SortOrder: 1},
			{ModelId: "deepseek-reasoner", Name: "DeepSeek R1", Provider: "DeepSeek", Description: "深度推理模型，复杂逻辑与数学推导首选，媲美 o1", Tags: "推理,国产", Logo: "deepseek", InputPrice: 0.004, OutputPrice: 0.016, ContextWindow: "64K", Featured: false, IsVisible: true, SortOrder: 2},
			{ModelId: "qwen-max", Name: "Qwen Max", Provider: "阿里云", Description: "通义千问旗舰版，中文理解和长文处理能力出众", Tags: "对话,国产", Logo: "qwen", InputPrice: 0.004, OutputPrice: 0.012, ContextWindow: "1M", Featured: false, IsVisible: true, SortOrder: 3},
			{ModelId: "gpt-4o", Name: "GPT-4o", Provider: "OpenAI", Description: "多模态旗舰，支持图文理解，综合能力领先，开发者首选", Tags: "对话,海外", Logo: "openai", InputPrice: 0.018, OutputPrice: 0.072, ContextWindow: "128K", Featured: true, IsVisible: true, SortOrder: 4},
			{ModelId: "gpt-4o-mini", Name: "GPT-4o Mini", Provider: "OpenAI", Description: "轻量快速，价格实惠，适合简单对话和批量处理任务", Tags: "对话,海外", Logo: "openai", InputPrice: 0.001, OutputPrice: 0.004, ContextWindow: "128K", Featured: false, IsVisible: true, SortOrder: 5},
			{ModelId: "claude-sonnet-4-6", Name: "Claude Sonnet 4.6", Provider: "Anthropic", Description: "当前综合能力最强均衡模型，代码与长文档处理出众，SWE-bench 72.7%", Tags: "对话,推理,海外", Logo: "anthropic", InputPrice: 0.022, OutputPrice: 0.108, ContextWindow: "1M", Featured: true, IsVisible: true, SortOrder: 6},
			{ModelId: "claude-haiku-4-5", Name: "Claude Haiku 4.5", Provider: "Anthropic", Description: "快速轻量，响应迅速，适合高并发和简单任务", Tags: "对话,海外", Logo: "anthropic", InputPrice: 0.007, OutputPrice: 0.036, ContextWindow: "200K", Featured: false, IsVisible: true, SortOrder: 7},
			{ModelId: "gemini-2.5-pro", Name: "Gemini 2.5 Pro", Provider: "Google", Description: "多模态旗舰，原生视频理解，长上下文处理卓越", Tags: "对话,推理,海外", Logo: "google", InputPrice: 0.009, OutputPrice: 0.072, ContextWindow: "1M", Featured: false, IsVisible: true, SortOrder: 8},
			{ModelId: "gemini-2.5-flash", Name: "Gemini 2.5 Flash", Provider: "Google", Description: "高性价比，速度极快，支持超长上下文，适合批量任务", Tags: "对话,海外", Logo: "google", InputPrice: 0.0011, OutputPrice: 0.0043, ContextWindow: "1M", Featured: false, IsVisible: true, SortOrder: 9},
			{ModelId: "o3", Name: "o3", Provider: "OpenAI", Description: "顶级推理模型，竞赛数学和复杂分析场景首选", Tags: "推理,海外", Logo: "openai", InputPrice: 0.072, OutputPrice: 0.288, ContextWindow: "200K", Featured: false, IsVisible: true, SortOrder: 10},
		}
		if err := DB.Create(&defaults).Error; err != nil {
			logger.SysError("failed to seed default model prices: " + err.Error())
		}
	}

	return nil
}

// ===== Order =====

func CreateOrder(order *Order) error {
	return DB.Create(order).Error
}

func GetOrderByOrderNo(orderNo string) (*Order, error) {
	var order Order
	err := DB.Where("order_no = ?", orderNo).First(&order).Error
	return &order, err
}

func GetOrdersByUserId(userId int, page, pageSize int) ([]Order, int64, error) {
	var orders []Order
	var total int64
	DB.Model(&Order{}).Where("user_id = ?", userId).Count(&total)
	err := DB.Where("user_id = ?", userId).
		Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&orders).Error
	return orders, total, err
}

func UpdateOrderStatus(orderNo string, status int, tradeNo string) error {
	updates := map[string]interface{}{"status": status}
	if tradeNo != "" {
		updates["trade_no"] = tradeNo
	}
	if status == 1 {
		now := time.Now()
		updates["paid_at"] = &now
	}
	return DB.Model(&Order{}).Where("order_no = ?", orderNo).Updates(updates).Error
}

// ===== Plan =====

func GetActivePlans() ([]Plan, error) {
	var plans []Plan
	err := DB.Where("is_available = ?", true).Order("sort_order ASC, id ASC").Find(&plans).Error
	return plans, err
}

func CreatePlan(plan *Plan) error {
	return DB.Create(plan).Error
}

func UpdatePlan(plan *Plan) error {
	return DB.Save(plan).Error
}

func DeletePlan(id int) error {
	return DB.Delete(&Plan{}, id).Error
}

// ===== Referral =====

func CreateReferral(userId, inviterId int) error {
	referral := &Referral{
		UserId:         userId,
		InviterId:      inviterId,
		CommissionRate: 0.10,
	}
	return DB.Create(referral).Error
}

func GetReferralByUserId(userId int) (*Referral, error) {
	var referral Referral
	err := DB.Where("user_id = ?", userId).First(&referral).Error
	return &referral, err
}

func GetReferralsByInviterId(inviterId int) ([]Referral, error) {
	var referrals []Referral
	err := DB.Where("inviter_id = ?", inviterId).Find(&referrals).Error
	return referrals, err
}

// ===== Commission =====

func CreateCommission(commission *Commission) error {
	return DB.Create(commission).Error
}

func GetCommissionsByUserId(userId int) ([]Commission, error) {
	var commissions []Commission
	err := DB.Where("user_id = ?", userId).Order("created_at DESC").Find(&commissions).Error
	return commissions, err
}

// ===== Notice =====

func GetActiveNotices() ([]Notice, error) {
	var notices []Notice
	err := DB.Where("is_active = 1").Order("sort_order DESC, created_at DESC").Find(&notices).Error
	return notices, err
}

func CreateNotice(notice *Notice) error {
	return DB.Create(notice).Error
}

// ===== ModelPrice =====

// GetVisibleModelPrices 返回前台可见的模型（按 sort_order, id 排序）
func GetVisibleModelPrices() ([]ModelPrice, error) {
	var prices []ModelPrice
	err := DB.Where("is_visible = ?", true).Order("sort_order ASC, id ASC").Find(&prices).Error
	return prices, err
}

// UpsertModelPrice 按 model_id 幂等写入
func UpsertModelPrice(price *ModelPrice) error {
	if price.ModelId == "" {
		return DB.Create(price).Error
	}
	var existing ModelPrice
	if err := DB.Where("model_id = ?", price.ModelId).First(&existing).Error; err == nil {
		price.Id = existing.Id
	}
	return DB.Save(price).Error
}

// ===== Seed Data =====

func SeedDefaultPlans() {
	var count int64
	DB.Model(&Plan{}).Count(&count)
	if count > 0 {
		return
	}
	logger.SysLog("Seeding default plans...")
	now := time.Now().Unix()
	plans := []Plan{
		{Name: "入门", Price: 10, Quota: 5000000, BonusQuota: 0, SortOrder: 1, IsAvailable: true, Description: "适合个人开发者体验", CreatedAt: now, UpdatedAt: now},
		{Name: "标准", Price: 30, Quota: 15000000, BonusQuota: 1000000, SortOrder: 2, IsAvailable: true, Description: "适合小型项目使用", CreatedAt: now, UpdatedAt: now},
		{Name: "专业", Price: 100, Quota: 50000000, BonusQuota: 5000000, SortOrder: 3, IsAvailable: true, Description: "适合中型项目和团队", CreatedAt: now, UpdatedAt: now},
		{Name: "企业", Price: 300, Quota: 150000000, BonusQuota: 30000000, SortOrder: 4, IsAvailable: true, Description: "适合大型项目和企业", CreatedAt: now, UpdatedAt: now},
	}
	for _, plan := range plans {
		DB.Create(&plan)
	}
}

// GetOptionValue 从 option 表读取配置
func GetOptionValue(key string) string {
	var option Option
	if err := DB.Where("`key` = ?", key).First(&option).Error; err != nil {
		return ""
	}
	return option.Value
}

// SaveOption 保存配置到 option 表
func SaveOption(key, value string) error {
	var option Option
	result := DB.Where("`key` = ?", key).First(&option)
	if result.Error != nil {
		return DB.Create(&Option{Key: key, Value: value}).Error
	}
	return DB.Model(&option).Update("value", value).Error
}

// ===== UserNotification =====

// CreateUserNotification 写一条个人通知。失败不阻断调用方业务，仅打 log。
func CreateUserNotification(userId int, title, content, nType string) {
	n := UserNotification{
		UserId:  userId,
		Title:   title,
		Content: content,
		Type:    nType,
	}
	if err := DB.Create(&n).Error; err != nil {
		logger.SysError(fmt.Sprintf("create user notification failed: user=%d type=%s err=%v", userId, nType, err))
	}
}
