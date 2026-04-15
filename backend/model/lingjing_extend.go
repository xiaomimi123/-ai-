package model

import (
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

// ModelPrice 模型定价表
type ModelPrice struct {
	Id          int     `json:"id" gorm:"primaryKey;autoIncrement"`
	ModelName   string  `json:"model_name" gorm:"uniqueIndex;size:100;not null"`
	InputPrice  float64 `json:"input_price" gorm:"type:decimal(10,4)"`
	OutputPrice float64 `json:"output_price" gorm:"type:decimal(10,4)"`
	IsVisible   int     `json:"is_visible" gorm:"default:1"`
	Description string  `json:"description" gorm:"size:500"`
	Provider    string  `json:"provider" gorm:"size:50"`
	Category    string  `json:"category" gorm:"size:20;default:'chat'"`
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
	)
	if err != nil {
		return err
	}
	// 扩展 Token 表添加速率限制字段（忽略已存在的错误）
	DB.Exec("ALTER TABLE tokens ADD COLUMN rpm BIGINT DEFAULT 0")
	DB.Exec("ALTER TABLE tokens ADD COLUMN tpm BIGINT DEFAULT 0")

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

func GetVisibleModelPrices() ([]ModelPrice, error) {
	var prices []ModelPrice
	err := DB.Where("is_visible = 1").Order("provider ASC, model_name ASC").Find(&prices).Error
	return prices, err
}

func UpsertModelPrice(price *ModelPrice) error {
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

func SeedDefaultModelPrices() {
	var count int64
	DB.Model(&ModelPrice{}).Count(&count)
	if count > 0 {
		return
	}
	logger.SysLog("Seeding default model prices...")
	prices := []ModelPrice{
		{ModelName: "claude-sonnet-4-20250514", InputPrice: 21, OutputPrice: 105, Provider: "Anthropic", Category: "chat", IsVisible: 1, Description: "Claude Sonnet 4，最强综合能力"},
		{ModelName: "claude-3-5-haiku-20241022", InputPrice: 2.8, OutputPrice: 14, Provider: "Anthropic", Category: "chat", IsVisible: 1, Description: "Claude 3.5 Haiku，快速轻量"},
		{ModelName: "gpt-4o", InputPrice: 35, OutputPrice: 105, Provider: "OpenAI", Category: "chat", IsVisible: 1, Description: "GPT-4o，强大多模态"},
		{ModelName: "gpt-4o-mini", InputPrice: 1.05, OutputPrice: 4.2, Provider: "OpenAI", Category: "chat", IsVisible: 1, Description: "GPT-4o Mini，高性价比"},
		{ModelName: "deepseek-chat", InputPrice: 1.33, OutputPrice: 5.33, Provider: "DeepSeek", Category: "chat", IsVisible: 1, Description: "DeepSeek V3"},
		{ModelName: "deepseek-reasoner", InputPrice: 4.2, OutputPrice: 16.8, Provider: "DeepSeek", Category: "chat", IsVisible: 1, Description: "DeepSeek R1，深度推理"},
		{ModelName: "gemini-1.5-pro", InputPrice: 8.75, OutputPrice: 35, Provider: "Google", Category: "chat", IsVisible: 1, Description: "Gemini 1.5 Pro"},
		{ModelName: "gemini-1.5-flash", InputPrice: 0.525, OutputPrice: 2.1, Provider: "Google", Category: "chat", IsVisible: 1, Description: "Gemini 1.5 Flash，极低成本"},
	}
	for _, price := range prices {
		DB.Create(&price)
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
