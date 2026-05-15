# 财务统计功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 admin 一眼看清营收、上游成本(手动记账)、净利润；3 卡片 + 30 天趋势 + 上游记账表。

**Architecture:** 纯新增、零生产破坏。后端新建 `cost_ledger` 表 + 5 个 admin endpoint；前端新增 `/finance` 路由 + Finance.tsx 页面。复用 Day 1-7 已交付的 6 个 UI 组件。1:1 USD 假设 → 无汇率折算。

**Tech Stack:** Go 1.21 / Gin / GORM (后端) + React 19 / TypeScript / Vite / recharts (前端)。

**Spec:** `docs/superpowers/specs/2026-05-16-finance-stats-design.md`

---

## 全局约定

- **生产零破坏**：每个 commit 独立 deploy 也独立 revert。
- **行为不变**：不动任何现有 endpoint / 表 / 页面。
- **commit message 格式**：`feat(finance): ...` / `feat(finance-ui): ...` / `deploy(finance): ...`，结尾加 `Rollback: git revert <this-sha>`。
- **part-of branch**: 直接打到 main。
- **回滚命令**：单 commit 出问题 → `git revert <commit-sha> --no-edit && git push origin main` + 重新部署受影响的层（前端 admin rebuild 或后端容器 restart）。

---

## 目录 / 文件结构总览（完成后）

```
backend/
├── model/
│   └── lingjing_extend.go               [+]   追加 CostLedger struct + AutoMigrate
├── controller/
│   └── lingjing_finance.go              [N]   新建：5 个 handler
└── router/
    └── lingjing-router.go               [+]   admin 组里加 5 个路由

admin/src/
├── api/
│   └── index.ts                         [+]   追加 financeApi
├── components/
│   ├── AdminLayout.tsx                  [+]   侧栏 navSections 加 1 项
│   └── FinanceRecordModal.tsx           [N]   新建：记账 新增/编辑 modal
├── App.tsx                              [+]   加 /finance 路由
└── pages/
    └── Finance.tsx                      [N]   新建：财务统计页面
```

`[N]` = 新建，`[+]` = 修改既有文件（纯追加）。

---

# Phase F1 — 后端（commits 1-4）

**前置**: `~/lingjing-ai/` 在 main 分支，干净的工作树。

**验收**:
- `go build ./...` clean
- 5 个 endpoint 用 curl 通：
  - GET `/api/admin/lingjing/finance/summary?range=month`
  - GET `/api/admin/lingjing/finance/trend?days=30`
  - GET/POST/PUT/DELETE `/api/admin/lingjing/cost-ledger`
- DB 新表 `cost_ledger` 已建，含 2 个索引

---

### Task F1.1: 新增 CostLedger 模型 + AutoMigrate

**Files:**
- Modify: `backend/model/lingjing_extend.go`（追加 struct 定义 + InitLingjingTables AutoMigrate 列表加一项）

- [ ] **Step 1: 找到现有 InitLingjingTables 位置**

Run: `grep -n "InitLingjingTables\|AutoMigrate" /Users/lizhishaoniange/lingjing-ai/backend/model/lingjing_extend.go`

记下 AutoMigrate 调用的位置（应该在 line 128 附近）。

- [ ] **Step 2: 在 `lingjing_extend.go` 文件末尾（在 ModelPrice 等所有 struct 之后、`InitLingjingTables` 函数之前）追加 CostLedger struct**

具体：找到 `ModelPrice` struct 的闭合 `}`（line 124 附近），在它**之后**插入：

```go

// CostLedger 上游成本记账
// admin 手动录入"我给上游打了多少钱"、"上游退给我多少钱"。
// 不参与任何用户调用扣费链路，仅财务统计读。
// 1 USD = 1 USD（不做币种转换；用户充值在平台是 1:1 USD 定价）
type CostLedger struct {
	Id        int     `json:"id" gorm:"primaryKey;autoIncrement"`
	OccurDate string  `json:"occur_date" gorm:"type:date;index;not null"` // YYYY-MM-DD
	Upstream  string  `json:"upstream" gorm:"size:64;index;not null"`     // 自由文本：OpenAI / Anthropic / ApiMart...
	Type      string  `json:"type" gorm:"size:16;not null;default:expense"` // expense / refund
	AmountUSD float64 `json:"amount_usd" gorm:"type:decimal(10,2);not null"`
	Remark    string  `json:"remark" gorm:"size:255"`
	CreatedAt int64   `json:"created_at" gorm:"autoCreateTime"`
	CreatedBy int     `json:"created_by" gorm:"not null"` // admin user id
}
```

- [ ] **Step 3: 在 `InitLingjingTables` 的 AutoMigrate 调用里加一行**

定位到（`backend/model/lingjing_extend.go:128` 左右）:
```go
err := DB.AutoMigrate(
    &Order{},
    &Commission{},
    &Plan{},
    &Notice{},
    &ModelPrice{},
    &WithdrawRequest{},
    &UserNotification{},
)
```

把它改成：
```go
err := DB.AutoMigrate(
    &Order{},
    &Commission{},
    &Plan{},
    &Notice{},
    &ModelPrice{},
    &WithdrawRequest{},
    &UserNotification{},
    &CostLedger{},
)
```

只在已有列表末尾加 `&CostLedger{},`，其他行不动。

- [ ] **Step 4: 编译验证**

Run:
```bash
cd /Users/lizhishaoniange/lingjing-ai/backend
go build ./...
```

期望：clean，无 error。

- [ ] **Step 5: 数据库结构验证（可选，启动一次本地后端看 migrate 日志）**

如果有本地 MySQL：启动后端，日志里应看到 `cost_ledger` 表创建记录。或直接在 MySQL 跑：
```sql
DESCRIBE cost_ledger;
SHOW INDEX FROM cost_ledger;
```
应有 `idx_occur_date`、`idx_upstream` 两个索引。

如果没有本地 MySQL，跳过本步——部署到服务器时会自动跑 AutoMigrate。

- [ ] **Step 6: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add backend/model/lingjing_extend.go
git commit -m "feat(finance): add CostLedger model + AutoMigrate

- New table 'cost_ledger': occur_date / upstream / type(expense|refund)
  / amount_usd / remark / created_at / created_by
- Two indexes: occur_date, upstream (for date-range and per-upstream queries)
- AutoMigrate adds the table on next backend startup; existing tables untouched

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task F1.2: 新建 5 个 admin handler（CostLedger CRUD + finance stats）

**Files:**
- Create: `backend/controller/lingjing_finance.go`

- [ ] **Step 1: 创建 handler 文件**

Create `backend/controller/lingjing_finance.go`：

```go
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
			err = gin.Error{Err: err, Type: gin.ErrorTypePublic, Meta: "from 格式错误"}.Err
			return
		}
		to, err = time.ParseInLocation("2006-01-02", tStr, time.Local)
		if err != nil {
			err = gin.Error{Err: err, Type: gin.ErrorTypePublic, Meta: "to 格式错误"}.Err
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
```

注意：
- GORM 默认表名是 struct 名的小写复数 → `CostLedger` → `cost_ledgers`（带 s）。SQL 里写 `cost_ledgers`。
- `c.GetInt("id")` 是项目其他 lingjing 控制器（lingjing_notice / lingjing_pay 等）取当前登录 user id 的标准方式，由 middleware.AdminAuth() 注入。
- `time.Local` 保持和后端其他统计一致。

- [ ] **Step 2: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend
go build ./...
```

如果有 import 缺失（`common/ctxkey`），按报错补 import 路径。预期是 clean。

- [ ] **Step 3: 加路由**

打开 `backend/router/lingjing-router.go`，找到 admin 组（应在 line ~85 附近，`admin := router.Group("/api/admin/lingjing")`）。

在 admin 组的最后一行 `admin.PUT("/token/:id/rate-limit", controller.SetTokenRateLimit)` 之后追加：

```go

		// 财务统计
		admin.GET("/finance/summary", controller.AdminGetFinanceSummary)
		admin.GET("/finance/trend", controller.AdminGetFinanceTrend)
		admin.GET("/cost-ledger", controller.AdminListCostLedger)
		admin.POST("/cost-ledger", controller.AdminCreateCostLedger)
		admin.PUT("/cost-ledger/:id", controller.AdminUpdateCostLedger)
		admin.DELETE("/cost-ledger/:id", controller.AdminDeleteCostLedger)
```

- [ ] **Step 4: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend
go build ./...
```

期望：clean。如果报 undefined：检查 handler 名拼写或 import。

- [ ] **Step 5: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add backend/controller/lingjing_finance.go backend/router/lingjing-router.go
git commit -m "feat(finance): admin handlers + routes for finance stats + cost ledger

- AdminGetFinanceSummary: 3-card summary with prev-period delta
- AdminGetFinanceTrend: 30-day daily revenue/cost/profit array
- AdminListCostLedger + Create + Update + Delete (CRUD)
- All routes under /api/admin/lingjing/ behind AdminAuth middleware
- 1:1 USD assumption: orders.amount used as USD directly

Pure additive: no existing routes/handlers touched.

Rollback: git revert <this-sha>"
git push origin main
```

---

# Phase F2 — 前端（commits 5-7）

**前置**: F1 部署成功，后端 5 个 endpoint 可访问（curl 验证过或先信任后端 + 边写边联调）。

**验收**:
- `npm run build` clean
- 浏览器打开 `/finance`：看到 3 卡片 + 趋势图 + 记账表
- 新增/编辑/删除记账：summary 同步刷新
- 时间范围切换：数据正确切换
- 其他 17 页未受影响（侧栏多了一项，但点击其他页面正常）

---

### Task F2.1: 加 financeApi + 侧栏菜单 + 路由 + Finance.tsx 骨架

**Files:**
- Modify: `admin/src/api/index.ts`（追加 financeApi）
- Modify: `admin/src/components/AdminLayout.tsx`（侧栏加 1 项）
- Modify: `admin/src/App.tsx`（加 /finance 路由）
- Create: `admin/src/pages/Finance.tsx`（骨架，先只有 PageHeader 占位）

- [ ] **Step 1: 在 `admin/src/api/index.ts` 末尾追加 financeApi**

```ts

// 财务统计
export const financeApi = {
  summary: (params: { range?: string; from?: string; to?: string }) =>
    http.get('/api/admin/lingjing/finance/summary', { params }),
  trend: (days: number = 30) =>
    http.get('/api/admin/lingjing/finance/trend', { params: { days } }),
  listLedger: (params?: { page?: number; page_size?: number; upstream?: string; from?: string; to?: string }) =>
    http.get('/api/admin/lingjing/cost-ledger', { params }),
  createLedger: (data: { occur_date: string; upstream: string; type: 'expense' | 'refund'; amount_usd: number; remark?: string }) =>
    http.post('/api/admin/lingjing/cost-ledger', data),
  updateLedger: (id: number, data: object) =>
    http.put(`/api/admin/lingjing/cost-ledger/${id}`, data),
  deleteLedger: (id: number) =>
    http.delete(`/api/admin/lingjing/cost-ledger/${id}`),
}
```

- [ ] **Step 2: 侧栏菜单加 "财务统计"**

打开 `admin/src/components/AdminLayout.tsx`。找到 `from 'lucide-react'` import 行（line 2），把图标列表里加 `DollarSign`：

如果当前是：
```tsx
import { LayoutDashboard, Users, Radio, Gift, ScrollText, LogOut, Settings, Shield, Menu, X, CreditCard, Share2, Bell, Sliders, Wallet, Cpu, ListTodo } from 'lucide-react'
```

改成：
```tsx
import { LayoutDashboard, Users, Radio, Gift, ScrollText, LogOut, Settings, Shield, Menu, X, CreditCard, Share2, Bell, Sliders, Wallet, Cpu, ListTodo, DollarSign } from 'lucide-react'
```

然后找到 "提现审核" 那一行（应在 navSections 的"商业运营" group 里，line 27 附近）：
```tsx
{ to: '/withdrawals', icon: Wallet, label: '提现审核' },
```

在它**之后**追加一行：
```tsx
{ to: '/finance', icon: DollarSign, label: '财务统计' },
```

- [ ] **Step 3: App.tsx 加路由**

打开 `admin/src/App.tsx`，找到 import 部分。在已有 page imports 之后追加：

```tsx
import FinancePage from './pages/Finance'
```

然后找到现有 `<Route path="withdrawals" element={<WithdrawalsPage />} />` 那一行，在它后面加：

```tsx
          <Route path="finance" element={<FinancePage />} />
```

- [ ] **Step 4: 新建 Finance.tsx 骨架**

Create `admin/src/pages/Finance.tsx`:

```tsx
import { DollarSign } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyCard } from '../components/EmptyCard'

export default function FinancePage() {
  return (
    <div>
      <PageHeader
        title="财务统计"
        description="营收 / 上游成本 / 净利润 一览"
        icon={DollarSign}
      />

      <EmptyCard
        icon={DollarSign}
        title="财务面板加载中..."
        description="F2.2 集成 summary + trend 数据，F2.3 集成记账"
      />
    </div>
  )
}
```

- [ ] **Step 5: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run build
```

期望：clean。检查侧栏菜单条目是否正常渲染（如果有错通常是 lucide icon name typo）。

- [ ] **Step 6: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/api/index.ts admin/src/components/AdminLayout.tsx admin/src/App.tsx admin/src/pages/Finance.tsx
git commit -m "feat(finance-ui): financeApi + sidebar entry + route + skeleton page

- /finance route → FinancePage
- Sidebar nav: '财务统计' added after '提现审核' in '商业运营' group
- financeApi (summary/trend/ledger CRUD) for axios calls
- Finance.tsx: skeleton with PageHeader + EmptyCard placeholder

Build clean. Other 17 pages unaffected.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task F2.2: 集成 summary + trend（3 卡片 + 趋势图）

**Files:**
- Modify: `admin/src/pages/Finance.tsx`（替换骨架内容）

- [ ] **Step 1: 替换 Finance.tsx 内容**

把 `admin/src/pages/Finance.tsx` 整个文件**覆盖**成：

```tsx
import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { FilterTabs } from '../components/FilterTabs'
import { financeApi } from '../api'
import toast from 'react-hot-toast'

type RangeKey = 'day' | 'week' | 'month' | 'year' | 'custom'

interface Summary {
  range: string
  from: string
  to: string
  revenue_usd: number
  order_count: number
  avg_order_usd: number
  cost_usd: number
  cost_by_upstream: { upstream: string; amount: number }[]
  profit_usd: number
  profit_margin: number
  prev_period: { revenue_usd: number; cost_usd: number; profit_usd: number }
}

interface TrendPoint {
  date: string
  revenue: number
  cost: number
  profit: number
}

const RANGE_OPTIONS: { label: string; value: RangeKey }[] = [
  { label: '本日', value: 'day' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
]

export default function FinancePage() {
  const [range, setRange] = useState<RangeKey>('month')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      financeApi.summary({ range }),
      financeApi.trend(30),
    ]).then(([sumRes, trendRes]) => {
      if (sumRes.data.success) setSummary(sumRes.data.data)
      if (trendRes.data.success) setTrend(trendRes.data.data || [])
    }).catch(() => toast.error('加载失败')).finally(() => setLoading(false))
  }, [range])

  const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`
  const fmtCny = (n: number) => `¥${(n || 0).toFixed(2)}` // 1:1 USD 假设：数字 = USD 值，按充值规则显 ¥

  // 环比箭头：上期为 0 时显示 "—"，否则显示百分比
  const deltaPct = (cur: number, prev: number): { text: string; up: boolean | null } => {
    if (!prev) return { text: '—', up: null }
    const diff = ((cur - prev) / prev) * 100
    return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, up: diff >= 0 }
  }

  const revDelta = summary ? deltaPct(summary.revenue_usd, summary.prev_period.revenue_usd) : { text: '—', up: null }
  const costDelta = summary ? deltaPct(summary.cost_usd, summary.prev_period.cost_usd) : { text: '—', up: null }
  const profitDelta = summary ? deltaPct(summary.profit_usd, summary.prev_period.profit_usd) : { text: '—', up: null }

  const costByUpstreamLine = (summary?.cost_by_upstream || [])
    .slice(0, 3)
    .map(c => `${c.upstream} $${c.amount.toFixed(0)}`)
    .join(' / ')

  return (
    <div>
      <PageHeader
        title="财务统计"
        description={summary ? `${summary.from} → ${summary.to}` : '加载中...'}
        icon={DollarSign}
        actions={
          <FilterTabs
            value={range}
            onChange={v => setRange(v as RangeKey)}
            options={RANGE_OPTIONS}
          />
        }
      />

      {/* 3 卡片 */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="营收 · 充值流水"
          value={summary ? fmtCny(summary.revenue_usd) : '—'}
          icon={TrendingUp}
          color="success"
          hint={summary ? `${revDelta.text} · ${summary.order_count} 单 · 客单 ${fmtCny(summary.avg_order_usd)}` : ''}
        />
        <StatCard
          label="上游成本"
          value={summary ? fmtUsd(summary.cost_usd) : '—'}
          icon={TrendingDown}
          color="warning"
          hint={summary ? (costByUpstreamLine || costDelta.text) : ''}
        />
        <StatCard
          label="净利润"
          value={summary ? fmtUsd(summary.profit_usd) : '—'}
          icon={Wallet}
          color={summary && summary.profit_usd < 0 ? 'danger' : 'accent'}
          hint={summary ? `毛利率 ${summary.profit_margin.toFixed(1)}% · ${profitDelta.text}` : ''}
        />
      </div>

      {/* 趋势图 */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
          30 天趋势 — 营收 · 成本 · 利润
        </div>
        {trend.length === 0 ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            {loading ? '加载中...' : '暂无数据'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2ECC71" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#2ECC71" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="costG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="profG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a2e1f" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#1a2e1f" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => `$${v.toFixed(0)}`}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => `$${Number(v).toFixed(2)}`}/>
              <Legend wrapperStyle={{ fontSize: 12 }}/>
              <Area type="monotone" dataKey="revenue" name="营收" stroke="#2ECC71" fill="url(#revG)" strokeWidth={2}/>
              <Area type="monotone" dataKey="cost" name="成本" stroke="#F59E0B" fill="url(#costG)" strokeWidth={2}/>
              <Area type="monotone" dataKey="profit" name="利润" stroke="#1a2e1f" fill="url(#profG)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 上游记账 — F2.3 接入 */}
      <div className="card" style={{ padding: 16, color: 'var(--text-secondary)', textAlign: 'center' }}>
        上游记账表 — F2.3 接入
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run build
```

期望：clean。recharts 已经在项目里（Overview 也用），不需要新装包。

- [ ] **Step 3: 本地或服务器手测**

如果有本地 dev：`npm run dev` 启动，浏览器打开 `/finance`：
- 3 张卡片有数（即便后端 summary 全 0 也应正常显示 `¥0.00` / `$0.00`）
- 时间范围切换 → 数据刷新
- 趋势图渲染，没有数据时显示 "暂无数据"

如果没本地 dev，可直接走部署链路（F3.1 + F3.2）后再回来验证。

- [ ] **Step 4: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/pages/Finance.tsx
git commit -m "feat(finance-ui): wire summary + trend (3 cards + 30-day chart)

- 3 StatCards: 营收(¥) / 成本(\$) / 利润(\$) with prev-period delta + margin
- recharts AreaChart, 3 lines (revenue/cost/profit), 30-day window
- FilterTabs for range: day/week/month/year (custom postponed)
- Display rules per feedback_currency_display: revenue ¥, cost/profit \$
- 1:1 USD assumption: amounts shown without conversion

Empty/loading states handled; chart shows '暂无数据' when no points.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task F2.3: 上游记账表 + 新增/编辑 Modal + ConfirmDialog

**Files:**
- Create: `admin/src/components/FinanceRecordModal.tsx`
- Modify: `admin/src/pages/Finance.tsx`（替换记账占位 + 加 state / Modal / ConfirmDialog）

- [ ] **Step 1: 新建 Modal 组件**

Create `admin/src/components/FinanceRecordModal.tsx`:

```tsx
import { useEffect, useState } from 'react'

export interface LedgerForm {
  occur_date: string
  upstream: string
  type: 'expense' | 'refund'
  amount_usd: string  // string state per feedback_react_number_input_string_state
  remark: string
}

const COMMON_UPSTREAMS = ['OpenAI', 'Anthropic', 'ApiMart', 'Jimeng', 'SiliconFlow', 'DeepSeek', 'Doubao', 'Cloudflare']

interface Props {
  open: boolean
  editing: { id: number; data: LedgerForm } | null  // null = create mode
  onClose: () => void
  onSubmit: (form: LedgerForm) => Promise<void>
}

export function FinanceRecordModal({ open, editing, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<LedgerForm>({
    occur_date: new Date().toISOString().slice(0, 10),
    upstream: '',
    type: 'expense',
    amount_usd: '',
    remark: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm(editing.data)
      } else {
        setForm({
          occur_date: new Date().toISOString().slice(0, 10),
          upstream: '',
          type: 'expense',
          amount_usd: '',
          remark: '',
        })
      }
    }
  }, [open, editing])

  if (!open) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSubmit(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{editing ? `编辑记账 #${editing.id}` : '新增记账'}</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">发生日期 *</label>
            <input
              type="date"
              value={form.occur_date}
              onChange={e => setForm(p => ({ ...p, occur_date: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">类型 *</label>
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value as 'expense' | 'refund' }))}
            >
              <option value="expense">支出 / 充值给上游</option>
              <option value="refund">退款 / 上游退给我</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">上游 *</label>
          <input
            list="finance-upstream-list"
            placeholder="OpenAI / Anthropic / ApiMart / ..."
            value={form.upstream}
            onChange={e => setForm(p => ({ ...p, upstream: e.target.value }))}
            autoFocus={!editing}
          />
          <datalist id="finance-upstream-list">
            {COMMON_UPSTREAMS.map(u => <option key={u} value={u}/>)}
          </datalist>
          <div className="form-hint">自由文本，常见上游已自动补全提示</div>
        </div>

        <div className="form-group">
          <label className="form-label">金额 ($) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="例：50.00"
            value={form.amount_usd}
            onChange={e => setForm(p => ({ ...p, amount_usd: e.target.value }))}
          />
          <div className="form-hint">USD 金额，正数（type=退款时也填正数，后端自动反号）</div>
        </div>

        <div className="form-group">
          <label className="form-label">备注</label>
          <textarea
            rows={2}
            placeholder="可选，例：5/15 月度充值"
            value={form.remark}
            onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : (editing ? '保存' : '新增')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 把记账表 + Modal + ConfirmDialog 接到 Finance.tsx**

打开 `admin/src/pages/Finance.tsx`，**完整替换**当前内容为：

```tsx
import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Wallet, Plus, Edit2, Trash2 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import toast from 'react-hot-toast'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { FilterTabs } from '../components/FilterTabs'
import { SearchInput } from '../components/SearchInput'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyCard } from '../components/EmptyCard'
import Pagination from '../components/Pagination'
import { FinanceRecordModal, LedgerForm } from '../components/FinanceRecordModal'
import { financeApi } from '../api'

type RangeKey = 'day' | 'week' | 'month' | 'year' | 'custom'

interface Summary {
  range: string
  from: string
  to: string
  revenue_usd: number
  order_count: number
  avg_order_usd: number
  cost_usd: number
  cost_by_upstream: { upstream: string; amount: number }[]
  profit_usd: number
  profit_margin: number
  prev_period: { revenue_usd: number; cost_usd: number; profit_usd: number }
}

interface TrendPoint {
  date: string
  revenue: number
  cost: number
  profit: number
}

interface LedgerRow {
  id: number
  occur_date: string
  upstream: string
  type: 'expense' | 'refund'
  amount_usd: number
  remark: string
  created_at: number
  created_by: number
}

const RANGE_OPTIONS: { label: string; value: RangeKey }[] = [
  { label: '本日', value: 'day' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
]

const PAGE_SIZE = 15

export default function FinancePage() {
  const [range, setRange] = useState<RangeKey>('month')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])

  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerUpstream, setLedgerUpstream] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<{ id: number; data: LedgerForm } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LedgerRow | null>(null)

  const loadSummary = () => {
    financeApi.summary({ range }).then(r => {
      if (r.data.success) setSummary(r.data.data)
    }).catch(() => toast.error('加载摘要失败'))
  }

  const loadTrend = () => {
    financeApi.trend(30).then(r => {
      if (r.data.success) setTrend(r.data.data || [])
    }).catch(() => {})
  }

  const loadLedger = () => {
    financeApi.listLedger({
      page: ledgerPage,
      page_size: PAGE_SIZE,
      upstream: ledgerUpstream || undefined,
    }).then(r => {
      if (r.data.success) {
        setLedger(r.data.data || [])
        setLedgerTotal(r.data.total || 0)
      }
    }).catch(() => toast.error('加载记账失败'))
  }

  useEffect(() => { loadSummary(); loadTrend() /* eslint-disable-next-line */ }, [range])
  useEffect(() => { loadLedger() /* eslint-disable-next-line */ }, [ledgerPage, ledgerUpstream])

  const openCreate = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (row: LedgerRow) => {
    setEditing({
      id: row.id,
      data: {
        occur_date: row.occur_date,
        upstream: row.upstream,
        type: row.type,
        amount_usd: String(row.amount_usd),
        remark: row.remark,
      },
    })
    setModalOpen(true)
  }

  const handleSubmit = async (form: LedgerForm) => {
    const amount = parseFloat(form.amount_usd) || 0
    if (amount <= 0) { toast.error('金额必须 > 0'); return }
    if (!form.upstream.trim()) { toast.error('请填写上游'); return }
    const payload = {
      occur_date: form.occur_date,
      upstream: form.upstream.trim(),
      type: form.type,
      amount_usd: amount,
      remark: form.remark,
    }
    try {
      const r = editing
        ? await financeApi.updateLedger(editing.id, payload)
        : await financeApi.createLedger(payload)
      if (r.data.success) {
        toast.success(editing ? '已保存' : '已新增')
        setModalOpen(false)
        loadLedger()
        loadSummary()
        loadTrend()
      } else {
        toast.error(r.data.message || '保存失败')
      }
    } catch { toast.error('网络错误') }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      const r = await financeApi.deleteLedger(deleteTarget.id)
      if (r.data.success) {
        toast.success('已删除')
        loadLedger()
        loadSummary()
        loadTrend()
      } else toast.error(r.data.message || '删除失败')
    } catch { toast.error('删除失败') } finally { setDeleteTarget(null) }
  }

  const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`
  const fmtCny = (n: number) => `¥${(n || 0).toFixed(2)}`
  const deltaPct = (cur: number, prev: number): { text: string; up: boolean | null } => {
    if (!prev) return { text: '—', up: null }
    const diff = ((cur - prev) / prev) * 100
    return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, up: diff >= 0 }
  }

  const revDelta = summary ? deltaPct(summary.revenue_usd, summary.prev_period.revenue_usd) : { text: '—', up: null }
  const costDelta = summary ? deltaPct(summary.cost_usd, summary.prev_period.cost_usd) : { text: '—', up: null }
  const profitDelta = summary ? deltaPct(summary.profit_usd, summary.prev_period.profit_usd) : { text: '—', up: null }

  const costByUpstreamLine = (summary?.cost_by_upstream || [])
    .slice(0, 3)
    .map(c => `${c.upstream} $${c.amount.toFixed(0)}`)
    .join(' / ')

  return (
    <div>
      <PageHeader
        title="财务统计"
        description={summary ? `${summary.from} → ${summary.to}` : '加载中...'}
        icon={DollarSign}
        actions={
          <FilterTabs
            value={range}
            onChange={v => setRange(v as RangeKey)}
            options={RANGE_OPTIONS}
          />
        }
      />

      {/* 3 卡片 */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="营收 · 充值流水"
          value={summary ? fmtCny(summary.revenue_usd) : '—'}
          icon={TrendingUp}
          color="success"
          hint={summary ? `${revDelta.text} · ${summary.order_count} 单 · 客单 ${fmtCny(summary.avg_order_usd)}` : ''}
        />
        <StatCard
          label="上游成本"
          value={summary ? fmtUsd(summary.cost_usd) : '—'}
          icon={TrendingDown}
          color="warning"
          hint={summary ? (costByUpstreamLine || costDelta.text) : ''}
        />
        <StatCard
          label="净利润"
          value={summary ? fmtUsd(summary.profit_usd) : '—'}
          icon={Wallet}
          color={summary && summary.profit_usd < 0 ? 'danger' : 'accent'}
          hint={summary ? `毛利率 ${summary.profit_margin.toFixed(1)}% · ${profitDelta.text}` : ''}
        />
      </div>

      {/* 趋势图 */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
          30 天趋势 — 营收 · 成本 · 利润
        </div>
        {trend.length === 0 ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2ECC71" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#2ECC71" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="costG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="profG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a2e1f" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#1a2e1f" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => `$${v.toFixed(0)}`}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => `$${Number(v).toFixed(2)}`}/>
              <Legend wrapperStyle={{ fontSize: 12 }}/>
              <Area type="monotone" dataKey="revenue" name="营收" stroke="#2ECC71" fill="url(#revG)" strokeWidth={2}/>
              <Area type="monotone" dataKey="cost" name="成本" stroke="#F59E0B" fill="url(#costG)" strokeWidth={2}/>
              <Area type="monotone" dataKey="profit" name="利润" stroke="#1a2e1f" fill="url(#profG)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 上游记账 */}
      <PageHeader
        title="上游记账"
        description={`共 ${ledgerTotal} 条`}
        actions={
          <>
            <SearchInput
              value={ledgerUpstream}
              onChange={v => { setLedgerUpstream(v); setLedgerPage(1) }}
              placeholder="按上游过滤"
              width={200}
              debounce={300}
            />
            <button className="btn btn-primary" onClick={openCreate}><Plus size={14}/>新增记账</button>
          </>
        }
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>上游</th>
              <th>类型</th>
              <th style={{ textAlign: 'right' }}>金额 ($)</th>
              <th>备注</th>
              <th style={{ width: 120 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 0 }}>
                <EmptyCard
                  icon={DollarSign}
                  title={ledgerUpstream ? '没有匹配的记账' : '暂无记账'}
                  description={ledgerUpstream ? '试试别的上游名' : '点击右上角「新增记账」记录第一笔上游成本'}
                />
              </td></tr>
            ) : ledger.map(row => (
              <tr key={row.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.occur_date}</td>
                <td><strong>{row.upstream}</strong></td>
                <td>
                  <span className={`badge ${row.type === 'expense' ? 'badge-orange' : 'badge-info'}`} style={{ fontSize: 11 }}>
                    {row.type === 'expense' ? '支出' : '退款'}
                  </span>
                </td>
                <td style={{
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: row.type === 'expense' ? 'var(--warning)' : 'var(--info)',
                }}>
                  {row.type === 'expense' ? '+' : '-'}${row.amount_usd.toFixed(2)}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.remark || '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon" title="编辑" onClick={() => openEdit(row)}>
                      <Edit2 size={14} color="var(--primary)"/>
                    </button>
                    <button className="btn btn-ghost btn-icon" title="删除" onClick={() => setDeleteTarget(row)}>
                      <Trash2 size={14} color="var(--danger)"/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={ledgerPage} pageSize={PAGE_SIZE} total={ledgerTotal} onChange={setLedgerPage} />

      <FinanceRecordModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除记账"
        description={<>
          {deleteTarget?.occur_date} 的「<strong>{deleteTarget?.upstream}</strong>」
          {deleteTarget?.type === 'expense' ? '支出' : '退款'} ${deleteTarget?.amount_usd.toFixed(2)} 将被删除。<br/>
          删除后 summary 会立刻刷新。
        </>}
        confirmLabel="删除"
        confirmVariant="danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run build
```

期望：clean。如果 LedgerForm import 出错：检查 FinanceRecordModal.tsx 是否 export 了 type。

- [ ] **Step 4: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/components/FinanceRecordModal.tsx admin/src/pages/Finance.tsx
git commit -m "feat(finance-ui): cost ledger table + create/edit Modal + ConfirmDialog

- FinanceRecordModal: date / type / upstream(datalist) / amount(USD) / remark
- Ledger table with 6 cols: 日期 / 上游 / 类型 / 金额 / 备注 / 操作
- SearchInput filters by upstream (300ms debounce)
- Pagination (15 per page)
- ConfirmDialog before delete (replaces native confirm)
- EmptyCard for empty/no-match
- After mutation: summary + trend + ledger all reload

Component imports forest-theme tokens. String state for amount input
(per feedback_react_number_input_string_state — '0.' would otherwise
get cleared).

Rollback: git revert <this-sha>"
git push origin main
```

---

# Phase F3 — 联调 + 部署（commits 8-10 / 步骤）

**前置**: F1 + F2 全部 commit 在 origin/main。

**验收**：生产 `/finance` 页面可访问，3 卡片 + 趋势图 + 记账 CRUD 全部 happy path 通。

---

### Task F3.1: 部署后端

服务器：`8.218.203.189`。后端 docker 容器需要重启加载新代码。

- [ ] **Step 1: SSH 进服务器拉代码**

```bash
ssh root@8.218.203.189
cd /root/lingjing-ai
git pull origin main
```

确认看到 F1.1 + F1.2 的 commit hash。

- [ ] **Step 2: 重建后端 docker 镜像**

按现有 push.sh 流程（如果项目用 docker-compose 管理）：

```bash
cd /root/lingjing-ai
docker compose build backend
docker compose up -d backend
```

或如果是单容器：参考项目 README / push.sh 的对应步骤。

- [ ] **Step 3: 观察启动日志确认 AutoMigrate**

```bash
docker compose logs backend --tail 80 | grep -iE 'cost_ledger|migrate|finance'
```

期望看到 GORM 创建 `cost_ledgers` 表的日志（或至少没有 error）。

- [ ] **Step 4: 后端 endpoint 烟雾测试**

需要先登录拿 cookie，然后用 cookie 访问 admin endpoint。简单做法：

```bash
# 1. 登录拿 cookie
curl -c /tmp/admin-cookies.txt -X POST https://api.aitoken.homes/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<你的管理员密码>"}'

# 2. summary
curl -b /tmp/admin-cookies.txt "https://api.aitoken.homes/api/admin/lingjing/finance/summary?range=month" | jq .

# 3. trend
curl -b /tmp/admin-cookies.txt "https://api.aitoken.homes/api/admin/lingjing/finance/trend?days=30" | jq .

# 4. 列表（应该空）
curl -b /tmp/admin-cookies.txt "https://api.aitoken.homes/api/admin/lingjing/cost-ledger" | jq .

# 5. 清理
rm /tmp/admin-cookies.txt
```

期望所有响应都是 `{"success":true, "data":...}`，4 不报错（空数组 + total=0）。

如果某条 endpoint 报 404：检查 router 改动是否生效（容器是否真的重启了）。

- [ ] **Step 5: 标记后端部署完成**

无需 commit，只是状态记录。如果出现 error 回滚：

```bash
ssh root@8.218.203.189
cd /root/lingjing-ai
git revert <F1.x-commit-sha> --no-edit
git push origin main
git pull origin main
docker compose build backend && docker compose up -d backend
```

---

### Task F3.2: 部署前端 admin 静态资源

- [ ] **Step 1: 在服务器构建 admin**

```bash
ssh root@8.218.203.189
cd /root/lingjing-ai
git pull origin main
docker run --rm -v /root/lingjing-ai/admin:/app -w /app node:20-alpine \
  sh -c "npm install --silent 2>/dev/null && npm run build"
```

期望：`admin/dist/` 重新生成，无 build error。

- [ ] **Step 2: 替换 nginx 静态文件**

```bash
rm -rf /var/www/api-platform/admin/*
cp -r /root/lingjing-ai/admin/dist/* /var/www/api-platform/admin/
```

- [ ] **Step 3: 验证（浏览器）**

打开 `https://admin.aitoken.homes/finance`（如果路径前缀不同就调整）。**硬刷一次**（Cmd+Shift+R）确保不读旧 bundle。

期望：
- 看到 "财务统计" 页面
- 3 卡片显数据（即使数据全 0 也应正常显示）
- 趋势图渲染（30 天柱，可能全为 0）
- 记账表显示 "暂无记账" 的 EmptyCard
- 侧栏菜单 "财务统计" 出现在 "提现审核" 后

如果 white screen / 报错：F12 看 console。常见问题：
- recharts 未在 admin 依赖里 → 应该已经在了（Overview 也用），确认 `package.json` 含 `recharts`
- LedgerForm import 路径错 → 检查相对路径

---

### Task F3.3: 端到端 smoke test + 关单

- [ ] **Step 1: 新增一笔记账验证 happy path**

在 `/finance` 页面：

1. 点 "新增记账"
2. 填：日期=今天，上游=OpenAI，类型=支出，金额=50.00，备注=月度充值
3. 点 "新增"
4. **期望**：toast 提示已新增 → 记账表出现新行 → "上游成本" 卡片从 $0 变成 $50.00

- [ ] **Step 2: 编辑刚才的记账**

1. 点该行的 Edit2 图标
2. 修改备注为 "测试编辑"
3. 点 "保存"
4. **期望**：toast 提示已保存 → 表格备注列更新

- [ ] **Step 3: 切换时间范围**

1. 把 FilterTabs 从 "本月" 切到 "本日"
2. **期望**：summary 数据切换（本日往往 $0）；趋势图不变（趋势图独立 30 天）

- [ ] **Step 4: 删除记账**

1. 点该行的 Trash2 图标
2. ConfirmDialog 弹出 → 点 "删除"
3. **期望**：toast 已删除 → 记账表回到 "暂无记账" → "上游成本" 卡片回到 $0

- [ ] **Step 5: 再加几条覆盖：**
   - 不同日期（往前 5 天 / 10 天）
   - 不同类型（refund）
   - 较大金额（$200+）
   
   **期望**：30 天趋势图柱子高低反映这些数据；上游成本 hint 显示前 3 大上游。

- [ ] **Step 6: 其他页面回归**

随机点击：Overview / Channels / Users / Logs / Orders / Tasks。**期望**：全部正常加载，未受财务功能影响。

- [ ] **Step 7: （如有 bug）修 + commit + 重新部署**

若发现 bug，按以下流程：
- 改源码
- `git commit -m "fix(finance): ..."` + push
- 服务器 git pull + 重新构建对应层
- 验证

每个 fix 是独立 commit，独立 revert。

- [ ] **Step 8: 收尾**

打开 `docs/superpowers/plans/2026-05-16-finance-stats.md`，把全部 `- [ ]` 改成 `- [x]` 标记完成（可选；只是文档状态）。

---

# 完成 — 整体校验

- [ ] 所有 commits 在 origin/main（约 8-10 个）
- [ ] `cd backend && go build ./...` clean
- [ ] `cd admin && npm run build` clean
- [ ] 生产 `/finance` 页面 happy path 通
- [ ] 其他 17 页未受影响
- [ ] DB `cost_ledgers` 表已创建，含 2 个索引（occur_date / upstream）

---

# 工期复核

| Phase | 任务数 | 工期 |
|---|---|---|
| F1 | 2 commits (model + handlers/routes) | 1 天 |
| F2 | 3 commits (skeleton / summary+trend / ledger) | 1 天 |
| F3 | 部署 + smoke test + bug fixes | 0.5 天 |
| **总计** | **5 commits + 部署步骤** | **~2.5 天** |

---

# 注意事项

1. **commit 颗粒度**：F1.1 / F1.2 / F2.1 / F2.2 / F2.3 各自独立 commit。F3 部署步骤不一定每个一个 commit（多数是操作而非代码变更）。
2. **每个 commit message** 都要有 `Rollback: git revert <this-sha>` 一行。
3. **生产数据库零迁移风险**：`AutoMigrate` 只新增表，不动现有表结构。即使 F1.1 revert 也只是 cost_ledgers 表变成"无人引用"，不影响其他业务。
4. **API 假设**：用户充值 1:1 USD（`orders.amount` 数字即 USD 当量）。如未来引入真汇率，需要：① cost_ledger 加 currency 字段；② summary handler 加汇率换算；③ Settings 页加汇率配置。本计划范围内**不实现**。
5. **YAGNI**：导出 Excel、按用户/模型 drill-down、利润预测、自动按调用计算成本 — 全部不在本计划范围。

---

# 自审清单（spec 覆盖）

Spec 章节 → 计划任务对应：

- §2 数据模型 (cost_ledger) → F1.1
- §3 后端 API (5 个 endpoint) → F1.2
- §3.2 SQL 口径 → F1.2 的 sumRevenue / sumCost helper
- §4 前端路由 + 侧栏 + 页面 → F2.1
- §4.2 页面结构 (3 卡片 + 趋势图) → F2.2
- §4.3 记账 Modal 字段 → F2.3 (FinanceRecordModal)
- §5 生产安全 → 所有任务都遵循"纯新增"
- §6 范围外 → 已在计划末尾"注意事项"复述
- §7 工期切分 → 5 + 部署步骤
- §8 测试要点 → F3.3 smoke test 覆盖 1/2/3/5/6/7/8；第 4 点（趋势空数据返回 0）由 F1.2 的 trend handler 实现
