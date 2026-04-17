package model

import (
	"fmt"
	"time"

	"github.com/songquanpeng/one-api/common/logger"
	"gorm.io/gorm"
)

// CancelStalePendingOrders 取消超时未支付的 pending 订单
// 只改 status=0（pending）→ status=2（已取消），不影响已支付/已取消的订单
// 返回取消的行数和错误
func CancelStalePendingOrders(olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan).Unix()
	res := DB.Model(&Order{}).
		Where("status = 0 AND created_at < ?", cutoff).
		Updates(map[string]interface{}{
			"status": 2,
			"remark": gorm.Expr("CONCAT(IFNULL(remark, ''), ?)",
				fmt.Sprintf(" | [自动取消 %s] 超时未支付", time.Now().Format("01-02 15:04"))),
		})
	return res.RowsAffected, res.Error
}

// CleanupPendingOrdersLoop 后台循环：每 tickEvery 检查一次，取消超过 olderThan 的 pending 订单
// 设计：
//   - olderThan 建议 30min，虎皮椒官方扫码订单有效期一般 ≤ 30min
//   - tickEvery 建议 5min，兼顾实时性和 DB 压力
//   - 万一虎皮椒晚于 30min 才 notify，HupijiaoNotify 里有"救回 status=2"逻辑兜底
func CleanupPendingOrdersLoop(olderThan, tickEvery time.Duration) {
	logger.SysLog(fmt.Sprintf("order cleanup loop started: cancel pending > %v, tick every %v", olderThan, tickEvery))
	// 启动先跑一次，避免重启后要等第一次 tick
	runOnce := func() {
		n, err := CancelStalePendingOrders(olderThan)
		if err != nil {
			logger.SysError("cleanup stale pending orders failed: " + err.Error())
		} else if n > 0 {
			logger.SysLog(fmt.Sprintf("cleanup stale pending orders: %d cancelled", n))
		}
	}
	runOnce()
	ticker := time.NewTicker(tickEvery)
	defer ticker.Stop()
	for range ticker.C {
		runOnce()
	}
}
