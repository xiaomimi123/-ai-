package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
)

// ============ Finance Summary & Trend ============

// AdminGetFinanceSummary
//
// 返回时间范围内：营收 / 成本 / 利润 + 上游分组 + 环比
// 营收口径：orders.amount where status=1 AND paid_at IN [from, to)
// 成本口径：cost_ledger sum(expense) - sum(refund) where occur_date IN [from, to)
// 假设：用户充值 1:1 USD，因此 orders.amount 直接当 USD
func AdminGetFinanceSummary(c *gin.Context) {
	from, to, prevFrom, prevTo, err := parseRange(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	rev, orderCount := sumRevenue(from, to)
	costTotal, costByUpstream := sumCost(from.Format("2006-01-02"), to.Format("2006-01-02"))
	profit := rev - costTotal

	// 环比
	prevRev, _ := sumRevenue(prevFrom, prevTo)
	prevCost, _ := sumCost(prevFrom.Format("2006-01-02"), prevTo.Format("2006-01-02"))
	prevProfit := prevRev - prevCost

	avgOrder := 0.0
	if orderCount > 0 {
		avgOrder = rev / float64(orderCount)
	}
	margin := 0.0
	if rev > 0 {
		margin = profit / rev * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"range":            c.DefaultQuery("range", "month"),
			"from":             from.Format("2006-01-02"),
			"to":               to.Format("2006-01-02"),
			"revenue_usd":      rev,
			"order_count":      orderCount,
			"avg_order_usd":    avgOrder,
			"cost_usd":         costTotal,
			"cost_by_upstream": costByUpstream,
			"profit_usd":       profit,
			"profit_margin":    margin,
			"prev_period": gin.H{
				"revenue_usd": prevRev,
				"cost_usd":    prevCost,
				"profit_usd":  prevProfit,
			},
		},
	})
}

// AdminGetFinanceTrend
//
// 返回过去 N 天每日的 revenue / cost / profit（默认 30 天）
// 空数据的日子返回 0 而不是缺失
func AdminGetFinanceTrend(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 || days > 365 {
		days = 30
	}

	end := time.Now()
	start := end.AddDate(0, 0, -days+1)

	// 收入按天聚合
	type dayRev struct {
		D   string  `json:"d"`
		Sum float64 `json:"sum"`
	}
	var revRows []dayRev
	model.DB.Raw(`
		SELECT DATE(FROM_UNIXTIME(paid_at)) AS d, COALESCE(SUM(amount), 0) AS sum
		FROM orders
		WHERE status = 1 AND paid_at >= ? AND paid_at < ?
		GROUP BY DATE(FROM_UNIXTIME(paid_at))
	`, start.Unix(), end.AddDate(0, 0, 1).Unix()).Scan(&revRows)

	// 成本按天聚合（expense 减 refund）
	type dayCost struct {
		D   string  `json:"d"`
		Sum float64 `json:"sum"`
	}
	var costRows []dayCost
	model.DB.Raw(`
		SELECT occur_date AS d,
		       COALESCE(SUM(CASE WHEN type='expense' THEN amount_usd ELSE -amount_usd END), 0) AS sum
		FROM cost_ledgers
		WHERE occur_date >= ? AND occur_date <= ?
		GROUP BY occur_date
	`, start.Format("2006-01-02"), end.Format("2006-01-02")).Scan(&costRows)

	revMap := map[string]float64{}
	for _, r := range revRows {
		revMap[r.D] = r.Sum
	}
	costMap := map[string]float64{}
	for _, r := range costRows {
		costMap[r.D] = r.Sum
	}

	out := make([]gin.H, 0, days)
	for i := 0; i < days; i++ {
		day := start.AddDate(0, 0, i).Format("2006-01-02")
		rev := revMap[day]
		cost := costMap[day]
		out = append(out, gin.H{
			"date":    day,
			"revenue": rev,
			"cost":    cost,
			"profit":  rev - cost,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": out})
}

// ============ Cost Ledger CRUD ============

type costLedgerReq struct {
	OccurDate string  `json:"occur_date"`
	Upstream  string  `json:"upstream"`
	Type      string  `json:"type"`
	AmountUSD float64 `json:"amount_usd"`
	Remark    string  `json:"remark"`
}

func validateLedger(r *costLedgerReq) string {
	if r.OccurDate == "" || len(r.OccurDate) != 10 {
		return "occur_date 必填，格式 YYYY-MM-DD"
	}
	if _, err := time.Parse("2006-01-02", r.OccurDate); err != nil {
		return "occur_date 格式错误，需 YYYY-MM-DD"
	}
	r.Upstream = strings.TrimSpace(r.Upstream)
	if r.Upstream == "" || len(r.Upstream) > 64 {
		return "upstream 必填，1-64 字符"
	}
	if r.Type != "expense" && r.Type != "refund" {
		return "type 只能是 expense 或 refund"
	}
	if r.AmountUSD <= 0 {
		return "amount_usd 必须 > 0"
	}
	if len(r.Remark) > 255 {
		return "remark 最长 255 字符"
	}
	return ""
}

// AdminListCostLedger 分页列表，支持按 upstream 和 from/to 过滤
func AdminListCostLedger(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 15
	}
	upstream := strings.TrimSpace(c.Query("upstream"))
	from := strings.TrimSpace(c.Query("from"))
	to := strings.TrimSpace(c.Query("to"))

	q := model.DB.Model(&model.CostLedger{})
	if upstream != "" {
		q = q.Where("upstream = ?", upstream)
	}
	if from != "" {
		q = q.Where("occur_date >= ?", from)
	}
	if to != "" {
		q = q.Where("occur_date <= ?", to)
	}

	var total int64
	q.Count(&total)

	var list []model.CostLedger
	q.Order("occur_date DESC, id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&list)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "total": total})
}

func AdminCreateCostLedger(c *gin.Context) {
	var req costLedgerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if msg := validateLedger(&req); msg != "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}

	entry := model.CostLedger{
		OccurDate: req.OccurDate,
		Upstream:  req.Upstream,
		Type:      req.Type,
		AmountUSD: req.AmountUSD,
		Remark:    req.Remark,
		CreatedBy: c.GetInt("id"),
	}
	if err := model.DB.Create(&entry).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": entry})
}

func AdminUpdateCostLedger(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var existing model.CostLedger
	if err := model.DB.First(&existing, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "记录不存在"})
		return
	}
	var req costLedgerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if msg := validateLedger(&req); msg != "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}
	existing.OccurDate = req.OccurDate
	existing.Upstream = req.Upstream
	existing.Type = req.Type
	existing.AmountUSD = req.AmountUSD
	existing.Remark = req.Remark
	if err := model.DB.Save(&existing).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": existing})
}

func AdminDeleteCostLedger(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := model.DB.Delete(&model.CostLedger{}, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ============ helpers ============

// parseRange 把 query string 解析成 [from, to) + 上一周期 [prevFrom, prevTo)
// range ∈ {day, week, month, year, custom}
// custom 时读取 from / to query 参数（YYYY-MM-DD）
func parseRange(c *gin.Context) (from, to, prevFrom, prevTo time.Time, err error) {
	r := c.DefaultQuery("range", "month")
	now := time.Now()

	switch r {
	case "day":
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
		to = from.AddDate(0, 0, 1)
		prevFrom = from.AddDate(0, 0, -1)
		prevTo = from
	case "week":
		// 周一 00:00:00 起
		offset := int(now.Weekday()) - 1
		if offset < 0 {
			offset = 6 // 周日 → -1
		}
		from = time.Date(now.Year(), now.Month(), now.Day()-offset, 0, 0, 0, 0, time.Local)
		to = from.AddDate(0, 0, 7)
		prevFrom = from.AddDate(0, 0, -7)
		prevTo = from
	case "year":
		from = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.Local)
		to = from.AddDate(1, 0, 0)
		prevFrom = from.AddDate(-1, 0, 0)
		prevTo = from
	case "custom":
		fStr := c.Query("from")
		tStr := c.Query("to")
		from, err = time.ParseInLocation("2006-01-02", fStr, time.Local)
		if err != nil {
			return
		}
		to, err = time.ParseInLocation("2006-01-02", tStr, time.Local)
		if err != nil {
			return
		}
		to = to.AddDate(0, 0, 1) // to 视为闭区间末日，转开区间
		span := to.Sub(from)
		prevTo = from
		prevFrom = from.Add(-span)
	case "month":
		fallthrough
	default:
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
		to = from.AddDate(0, 1, 0)
		prevFrom = from.AddDate(0, -1, 0)
		prevTo = from
	}
	return
}

// sumRevenue：orders 表 status=1 且 paid_at IN [from, to)
func sumRevenue(from, to time.Time) (revenue float64, count int64) {
	row := struct {
		Sum   float64
		Count int64
	}{}
	model.DB.Raw(`
		SELECT COALESCE(SUM(amount), 0) AS sum, COUNT(*) AS count
		FROM orders
		WHERE status = 1 AND paid_at >= ? AND paid_at < ?
	`, from.Unix(), to.Unix()).Scan(&row)
	return row.Sum, row.Count
}

// sumCost：cost_ledgers 表 expense 减 refund
func sumCost(fromDate, toDate string) (total float64, byUpstream []gin.H) {
	type r struct {
		Upstream string
		Amount   float64
	}
	var rows []r
	model.DB.Raw(`
		SELECT upstream,
		       COALESCE(SUM(CASE WHEN type='expense' THEN amount_usd ELSE -amount_usd END), 0) AS amount
		FROM cost_ledgers
		WHERE occur_date >= ? AND occur_date <= ?
		GROUP BY upstream
		ORDER BY amount DESC
	`, fromDate, toDate).Scan(&rows)

	byUpstream = make([]gin.H, 0, len(rows))
	for _, r := range rows {
		total += r.Amount
		byUpstream = append(byUpstream, gin.H{"upstream": r.Upstream, "amount": r.Amount})
	}
	return
}
