package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"gorm.io/gorm"
)

type TopUp struct {
	Id            int     `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId        int     `json:"user_id" gorm:"index"`
	Amount        int64   `json:"amount"`        // 充值额度（以QuotaPerUnit为单位的美元数）
	Money         float64 `json:"money"`          // 实际支付金额
	TradeNo       string  `json:"trade_no" gorm:"uniqueIndex;size:255"`
	PaymentMethod string  `json:"payment_method" gorm:"size:50"`
	CreateTime    int64   `json:"create_time"`
	CompleteTime  int64   `json:"complete_time"`
	Status        string  `json:"status" gorm:"size:20;default:'pending'"` // pending/success/failed/expired
}

const (
	TopUpStatusPending = "pending"
	TopUpStatusSuccess = "success"
	TopUpStatusFailed  = "failed"
)

func (topUp *TopUp) Insert() error {
	return DB.Create(topUp).Error
}

func (topUp *TopUp) Update() error {
	return DB.Save(topUp).Error
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp TopUp
	err := DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return &topUp
}

func GetUserTopUps(userId int, page, pageSize int) ([]TopUp, int64, error) {
	var topups []TopUp
	var total int64
	DB.Model(&TopUp{}).Where("user_id = ?", userId).Count(&total)
	err := DB.Where("user_id = ?", userId).
		Order("id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&topups).Error
	return topups, total, err
}

func GetAllTopUps(page, pageSize int) ([]TopUp, int64, error) {
	var topups []TopUp
	var total int64
	DB.Model(&TopUp{}).Count(&total)
	err := DB.Order("id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&topups).Error
	return topups, total, err
}

// EpayRecharge 易支付回调后充值
func EpayRecharge(tradeNo string, quotaToAdd int) error {
	topUp := GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		return errors.New("订单不存在")
	}
	if topUp.Status != TopUpStatusPending {
		return nil // 幂等：已处理过直接返回
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		// 更新订单状态
		topUp.Status = TopUpStatusSuccess
		topUp.CompleteTime = time.Now().Unix()
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}
		// 增加用户额度
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).
			Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		logger.SysError(fmt.Sprintf("epay recharge failed: %v", err))
		return errors.New("充值失败")
	}

	logger.SysLog(fmt.Sprintf("user %d recharged %d quota via epay, paid %.2f", topUp.UserId, quotaToAdd, topUp.Money))
	return nil
}

// ManualCompleteTopUp 管理员手动补单
func ManualCompleteTopUp(tradeNo string) error {
	if tradeNo == "" {
		return errors.New("未提供订单号")
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := tx.Where("trade_no = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("订单不存在")
		}
		if topUp.Status == TopUpStatusSuccess {
			return nil // 幂等
		}
		if topUp.Status != TopUpStatusPending {
			return errors.New("订单状态不允许补单")
		}

		// 计算额度
		dAmount := decimal.NewFromInt(topUp.Amount)
		dQuotaPerUnit := decimal.NewFromFloat(config.QuotaPerUnit)
		quotaToAdd := int(dAmount.Mul(dQuotaPerUnit).IntPart())
		if quotaToAdd <= 0 {
			return errors.New("无效充值额度")
		}

		topUp.Status = TopUpStatusSuccess
		topUp.CompleteTime = time.Now().Unix()
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).
			Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}

		logger.SysLog(fmt.Sprintf("admin manual topup: user %d, quota %d", topUp.UserId, quotaToAdd))
		return nil
	})
}
