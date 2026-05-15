# 财务统计功能 设计文档

**Date:** 2026-05-16
**Goal:** 让 admin 一眼看清营收、上游成本、净利润；上游成本通过手动记账维护；用户充值/消费走真实流水。
**Scope:** Lean 版（先上线核心 3 卡片 + 30 天趋势图 + 上游记账，后续可加深度分析）。
**Hard constraint:** 零生产破坏 — 全部纯新增（新表、新 API、新页面、新路由），不动任何现有代码路径。

---

## 1. 关键假设

- **用户充值 1:1 USD**：用户付 ¥30 → 得 $30 quota。所以 `orders.amount` 数字 = USD 当量。
- **结论**：财务页所有运算用一个币种（USD），无需汇率折算。显示时按 [[feedback_currency_display]] 规则：营收带 ¥、成本/利润带 $。

## 2. 数据模型 — 新增 `cost_ledger` 表

```go
// CostLedger 上游成本记账
// admin 手动录入：我给上游打了多少钱、上游退给我多少钱。
// 不参与任何用户调用扣费链路，仅财务统计读。
type CostLedger struct {
    Id         int     `json:"id" gorm:"primaryKey;autoIncrement"`
    OccurDate  string  `json:"occur_date" gorm:"type:date;index;not null"` // YYYY-MM-DD
    Upstream   string  `json:"upstream" gorm:"size:64;index;not null"`     // 自由文本：OpenAI / Anthropic / ApiMart 等
    Type       string  `json:"type" gorm:"size:16;not null;default:expense"` // expense / refund
    AmountUSD  float64 `json:"amount_usd" gorm:"type:decimal(10,2);not null"` // 正数
    Remark     string  `json:"remark" gorm:"size:255"`
    CreatedAt  int64   `json:"created_at" gorm:"autoCreateTime"`
    CreatedBy  int     `json:"created_by" gorm:"not null"` // admin user id
}
```

**索引**：`idx_occur_date`、`idx_upstream`。

**Migration**：加入 `model.InitLingjingTables()` 的 AutoMigrate 列表（位置：`Order` 后面）。

**为什么 `OccurDate` 用 string 而非 DATE 类型？**
GORM `type:date` 在 MySQL 上是真 DATE 类型，但用 string 表示便于 JSON 直传（前端 `<input type="date">` 输出 `YYYY-MM-DD`）。后端写入时直接传 string，MySQL 自动校验格式。

## 3. 后端 API（admin only · 5 个 endpoint）

路由组：`/api/admin/lingjing/finance/*` 和 `/api/admin/lingjing/cost-ledger/*`

| Method | Path | 用途 |
|---|---|---|
| GET | `/finance/summary?range=day\|week\|month\|year\|custom&from=&to=` | 3 卡片数据 |
| GET | `/finance/trend?days=30` | 趋势图 30 个数据点 |
| GET | `/cost-ledger?page=N&page_size=15&upstream=&from=&to=` | 分页列表 |
| POST | `/cost-ledger` | 新增 |
| PUT | `/cost-ledger/:id` | 编辑 |
| DELETE | `/cost-ledger/:id` | 删除 |

### 3.1 `GET /finance/summary` 返回结构

```json
{
  "success": true,
  "data": {
    "range": "month",
    "from": "2026-05-01",
    "to": "2026-05-16",
    "revenue_usd": 3420.50,
    "order_count": 87,
    "avg_order_usd": 39.31,
    "cost_usd": 245.80,
    "cost_by_upstream": [
      { "upstream": "OpenAI", "amount": 180.00 },
      { "upstream": "Anthropic", "amount": 50.00 },
      { "upstream": "ApiMart", "amount": 15.80 }
    ],
    "profit_usd": 3174.70,
    "profit_margin": 92.82,
    "prev_period": {
      "revenue_usd": 3050.00,
      "cost_usd": 220.00,
      "profit_usd": 2830.00
    }
  }
}
```

`prev_period` 表示"上一同等长度期间"（用于环比箭头）：本月 → 上月相同天数；本周 → 上周；本日 → 昨日。

### 3.2 SQL 口径

```sql
-- 营收
SELECT
  SUM(amount) AS revenue_usd,
  COUNT(*)    AS order_count
FROM orders
WHERE status = 1 AND paid_at BETWEEN ? AND ?

-- 成本（按 upstream 分组）
SELECT
  upstream,
  SUM(CASE WHEN type='expense' THEN amount_usd ELSE -amount_usd END) AS amount
FROM cost_ledger
WHERE occur_date BETWEEN ? AND ?
GROUP BY upstream
ORDER BY amount DESC
```

### 3.3 `GET /finance/trend?days=30` 返回

```json
{
  "success": true,
  "data": [
    { "date": "2026-04-17", "revenue": 120.5, "cost": 8.3, "profit": 112.2 },
    ...
  ]
}
```

按 `occur_date` / `paid_at` 的日期聚合，左 join 形式补齐没有数据的日子（值 0）。

### 3.4 `POST /cost-ledger` 请求体

```json
{
  "occur_date": "2026-05-15",
  "upstream": "OpenAI",
  "type": "expense",
  "amount_usd": 50.00,
  "remark": "5/15 月度充值"
}
```

**校验**：
- `occur_date` 必填，格式 `YYYY-MM-DD`
- `upstream` 必填，长度 1-64
- `type` ∈ {expense, refund}
- `amount_usd` > 0
- `remark` ≤ 255

`created_by` 后端从 session 取 admin user id。

## 4. 前端

### 4.1 路由 + 侧栏

- 路由：`/finance` → 新建 `admin/src/pages/Finance.tsx`
- 侧栏：放在 "提现审核" 之后（都是钱相关）
- 权限：复用现有 admin 守卫（`role >= 10`）

### 4.2 页面结构（复用 Day 1-7 组件）

```
<PageHeader title="财务统计" icon={DollarSign} actions={<FilterTabs range />} />

<div className="stat-grid">  // 3 cards
  <StatCard label="营收" value="¥3,420" color="success" hint="↑12.4% · 87 订单" />
  <StatCard label="上游成本" value="$245.80" color="warning" hint="OpenAI $180 / Anthropic $50" />
  <StatCard label="净利润" value="$3,175" color="accent" hint="毛利率 92.8%" />
</div>

<TrendChart data={trend} />   // recharts AreaChart, 3 lines

<PageHeader title="上游记账" actions={<Button>+ 新增记账</Button>} />  // 二级 header
<SearchInput placeholder="上游名称" />
<FilterTabs upstream={...} />
<Table>...</Table>
<Pagination />

<RecordModal />  // 新增/编辑通用
<ConfirmDialog />  // 删除确认
```

### 4.3 记账新增/编辑 Modal 字段

| Field | UI | 校验 |
|---|---|---|
| 发生日期 | `<input type="date">` | 必填 |
| 上游 | 文本输入（datalist 提供常见: OpenAI / Anthropic / ApiMart / Jimeng / SiliconFlow） | 必填 |
| 类型 | radio: 支出 / 退款 | 必填，默认 expense |
| 金额 (USD) | number, step 0.01, min 0.01 | `> 0` |
| 备注 | textarea, 2 行 | 可选 |

注意：金额输入框用 **string state**（[[feedback_react_number_input_string_state]] — `parseFloat('0.') === 0` 会清空输入）。

## 5. 生产安全保证

| 项 | 保证 |
|---|---|
| 数据库 | `AutoMigrate` 仅新增表，不动现有表结构。已有数据零影响。 |
| 后端 | 新建 1 个 controller 文件、新增 5 个路由。完全独立，不修改任何现有 handler。 |
| 前端 | 新增 1 个页面 + 1 个 modal 组件。侧栏菜单加一项，其他路由零影响。 |
| 部署 | 后端：standard `go build` + docker restart。前端：admin rebuild。每步独立 deploy/rollback。 |
| 回滚 | 删表 / revert commit / 删菜单项 都是独立操作。生产数据无丢失风险。 |

## 6. 范围外（YAGNI）

- ❌ 多币种（暂只 USD）
- ❌ 上游枚举强约束（自由文本即可）
- ❌ 自动扣款（每次 API 调用算上游成本）—— 太复杂，先看记账够不够
- ❌ 按用户/模型/渠道的深度 drill-down —— 后续 V2 加
- ❌ 利润预测、目标设定
- ❌ Excel 导出 —— 后续 V2 加
- ❌ 多管理员协作（创建人/审核人区分）—— 现在只有一个 admin

## 7. 工期 + commit 切分

| Phase | 任务 | 时间 | commits |
|---|---|---|---|
| F1 | 后端 | 1 天 | (a) 表 + migration、(b) summary endpoint、(c) trend endpoint、(d) ledger CRUD 4 endpoints |
| F2 | 前端 | 1 天 | (a) Finance.tsx 骨架 + 路由 + 侧栏、(b) summary + trend 集成、(c) ledger 表 + Modal + ConfirmDialog |
| F3 | 联调 + 部署 | 0.5 天 | (a) 部署后端 + 前端、(b) admin 实测 happy path、(c) 修 bug |

**~10 个独立 commits，每个独立可 revert。**

## 8. 测试要点

1. **新增 ledger 记账** → 立刻在 summary 卡片看到成本增加
2. **删除/编辑 ledger** → summary 同步刷新
3. **时间范围切换**（本日/本周/本月/本年/自定义）→ 数据正确切换
4. **趋势图**：空数据日子显示为 0 而不是断点
5. **环比箭头**：本月数据空 / 上月也空 → 显示 "—" 而不是 NaN%
6. **空状态**：第一次进财务页（无 ledger）→ EmptyCard 提示新增第一条
7. **权限**：普通用户访问 `/finance` → 跳登录（复用现有守卫）
8. **数值边界**：amount_usd 输入 `0.` 不被清空；`-1` 被拒；`999999.99` 正常显示
