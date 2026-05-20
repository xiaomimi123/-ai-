# 代理(Agent) 角色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加 `RoleAgentUser = 5` 一档，代理可登入 admin 后台只读看自己团队（直接下线）数据 + 自己佣金；admin 通过现有 `users.affiliate_rate` 设代理专属佣金率。

**Architecture:** 纯新增。Backend: 1 个常量 + 1 个中间件 + 1 个 helper + 1 个 controller 文件 (5 handlers) + 5 个新路由。Frontend: 5 个新页面 + 1 个 RoleGuard HOC + AdminLayout 菜单裁剪 + Users.tsx ROLES 加 1 项。零 schema 变更，零现有代码修改。

**Tech Stack:** Go 1.21 / Gin / GORM + React 19 / TypeScript / Vite。复用 Day 1-7 组件 + Day 4.3 已有的 affiliate_rate 字段 + DistributeCommission 已有的专属比例逻辑。

**Spec:** `docs/superpowers/specs/2026-05-20-agent-role-design.md`

---

## 全局约定

- **生产零破坏**：每个 commit 独立 revert / 独立 deploy
- **行为不变**：所有现有 endpoint / table / page 零修改；老 admin (role≥10) 体验不变
- **数据隔离**：所有 agent endpoint 必须通过 `scopeUserIDs()` helper 获取作用域，**漏调 = 安全 bug**
- **commit message**：`feat(agent): ...` 或 `feat(agent-ui): ...`，结尾加 `Rollback: git revert <this-sha>`
- **回滚**：单 commit 出问题 `git revert + push + 重建对应层`

---

## 目录 / 文件结构总览（完成后）

```
backend/
├── model/
│   └── user.go                          [+] 加 RoleAgentUser = 5 常量
├── middleware/
│   └── auth.go                          [+] 加 AgentAuth() 函数
├── controller/
│   └── lingjing_agent.go                [N] 5 个 handler + scopeUserIDs helper
└── router/
    └── lingjing-router.go               [+] 加 /api/admin/lingjing/agent/* 组

admin/src/
├── api/
│   └── index.ts                         [+] agentApi + ADMIN_PAGE_MIN_ROLE
├── components/
│   ├── RoleGuard.tsx                    [N] 路由级 role 守卫 HOC
│   └── AdminLayout.tsx                  [+] role-based 菜单裁剪 + agent 项
├── App.tsx                              [+] admin-only 路由套 RoleGuard + agent 5 个路由
├── pages/
│   ├── Login.tsx                        [+] 登录后按 role 跳 /overview 或 /agent/overview
│   ├── Users.tsx                        [+] ROLES 加"代理" + getRoleLabel 分支
│   └── agent/
│       ├── AgentOverview.tsx            [N] 4 卡片
│       ├── AgentTeamMembers.tsx         [N] 团队成员只读列表
│       ├── AgentTeamOrders.tsx          [N] 团队订单列表
│       ├── AgentTeamLogs.tsx            [N] 团队日志列表
│       └── AgentCommissions.tsx         [N] 我的佣金列表
```

`[N]` = 新建，`[+]` = 修改既有文件（纯追加）。

---

# Phase A — 后端（commits 1-2）

**前置**: `~/lingjing-ai/` 在 main 分支，HEAD 至少 `f9f1626`（spec commit）。

**验收**:
- `go build ./...` clean
- 5 个 endpoint 用代理账号 curl 通；admin 账号 curl 同 endpoint 看到全数据
- 普通用户 (role=1) curl 任一 endpoint 返回 403

---

### Task A1: 角色常量 + AgentAuth 中间件

**Files:**
- Modify: `backend/model/user.go`（加 RoleAgentUser）
- Modify: `backend/middleware/auth.go`（加 AgentAuth）

- [ ] **Step 1: 加 RoleAgentUser 常量**

打开 `backend/model/user.go`，找到 `const (` 块（line 21 附近，含 RoleCommonUser/RoleAdminUser/RoleRootUser）。

把：
```go
RoleCommonUser = 1
RoleAdminUser  = 10
RoleRootUser   = 100
```

改成：
```go
RoleCommonUser = 1
RoleAgentUser  = 5   // 代理：可登入 admin 后台，只读看自己团队 + 佣金
RoleAdminUser  = 10
RoleRootUser   = 100
```

只在中间加一行，不改其他。

- [ ] **Step 2: 加 AgentAuth 中间件**

打开 `backend/middleware/auth.go`，找到 `func AdminAuth()`（line 79 附近）。在 `AdminAuth` 之后、`RootAuth` 之前插入：

```go
// AgentAuth role >= 5 即可（代理 + admin + root）。
// 注意：此中间件仅放行进入路由，不做数据隔离；scope filter 由 handler 调
// scopeUserIDs() helper 决定。
func AgentAuth() func(c *gin.Context) {
	return func(c *gin.Context) {
		authHelper(c, model.RoleAgentUser)
	}
}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend
go build ./...
```

期望：clean。

- [ ] **Step 4: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add backend/model/user.go backend/middleware/auth.go
git commit -m "feat(agent): add RoleAgentUser=5 + AgentAuth middleware

- RoleAgentUser=5 sits between RoleCommonUser=1 and RoleAdminUser=10
- Existing role >= 10 admin guards remain in force (agents excluded)
- AgentAuth() middleware: authHelper(c, RoleAgentUser) — lets role >= 5 pass
- No data scope filter here; scoping happens in handler via scopeUserIDs

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task A2: lingjing_agent.go — 5 个 handler + 路由

**Files:**
- Create: `backend/controller/lingjing_agent.go`
- Modify: `backend/router/lingjing-router.go`（加 agent 路由组）

- [ ] **Step 1: 新建 controller 文件**

Create `backend/controller/lingjing_agent.go`:

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

// scopeUserIDs 返回调用者能看到的 user.id 列表。
//   - admin/root (role >= 10) → (nil, false) 不加 filter
//   - agent (role == 5)       → (ids, true) 仅 inviter_id = self.id 的下线
//
// 所有 agent-visible handler 必须在 SQL 之前调一次此 helper。
// 漏调 = 代理看到别家数据 = 严重安全 bug。
func scopeUserIDs(c *gin.Context) ([]int, bool) {
	if c.GetInt("role") >= model.RoleAdminUser {
		return nil, false
	}
	selfId := c.GetInt("id")
	var ids []int
	model.DB.Model(&model.User{}).
		Where("inviter_id = ?", selfId).
		Pluck("id", &ids)
	if ids == nil {
		ids = []int{} // 空 slice 而不是 nil，便于 caller 直接传给 GORM IN()
	}
	return ids, true
}

// ============ Overview ============

func AgentGetOverview(c *gin.Context) {
	selfId := c.GetInt("id")
	teamIds, scoped := scopeUserIDs(c)

	// 本月起点
	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local).Unix()
	monthEnd := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.Local).Unix()

	// 团队人数
	var teamSize int64
	q := model.DB.Model(&model.User{})
	if scoped {
		q = q.Where("inviter_id = ?", selfId)
	}
	q.Count(&teamSize)

	// 团队营收（本月）
	var monthRevenue float64
	rq := model.DB.Model(&model.Order{}).
		Where("status = ? AND paid_at >= ? AND paid_at < ?", 1, monthStart, monthEnd)
	if scoped {
		if len(teamIds) == 0 {
			monthRevenue = 0
		} else {
			rq.Where("user_id IN ?", teamIds).Select("COALESCE(SUM(amount), 0)").Scan(&monthRevenue)
		}
	} else {
		rq.Select("COALESCE(SUM(amount), 0)").Scan(&monthRevenue)
	}

	// 我的佣金累计（pending + settled，含未结算）
	var myCommission float64
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status IN (?, ?)", selfId,
			model.CommissionStatusPending, model.CommissionStatusSettled).
		Select("COALESCE(SUM(amount), 0)").Scan(&myCommission)

	// 团队本月调用数
	var monthCalls int64
	cq := model.DB.Table("logs").Where("created_at >= ? AND created_at < ?", monthStart, monthEnd)
	if scoped {
		if len(teamIds) == 0 {
			monthCalls = 0
		} else {
			cq.Where("user_id IN ?", teamIds).Count(&monthCalls)
		}
	} else {
		cq.Count(&monthCalls)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"team_size":      teamSize,
			"month_revenue":  monthRevenue,
			"my_commission":  myCommission,
			"month_calls":    monthCalls,
		},
	})
}

// ============ Team Members ============

func AgentListTeamMembers(c *gin.Context) {
	teamIds, scoped := scopeUserIDs(c)
	if scoped && len(teamIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 15
	}
	keyword := strings.TrimSpace(c.Query("keyword"))

	q := model.DB.Model(&model.User{})
	if scoped {
		q = q.Where("id IN ?", teamIds)
	}
	if keyword != "" {
		q = q.Where("username LIKE ? OR email LIKE ? OR display_name LIKE ?",
			"%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	}

	var total int64
	q.Count(&total)

	var users []model.User
	q.Select("id, username, display_name, email, `group`, quota, used_quota, request_count, status, created_time").
		Order("id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&users)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": users, "total": total})
}

// ============ Team Orders ============

func AgentListTeamOrders(c *gin.Context) {
	teamIds, scoped := scopeUserIDs(c)
	if scoped && len(teamIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 15
	}
	status := strings.TrimSpace(c.Query("status"))

	q := model.DB.Model(&model.Order{})
	if scoped {
		q = q.Where("user_id IN ?", teamIds)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	q.Count(&total)

	type row struct {
		model.Order
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	var list []row
	q.Select("orders.*, u.username, u.email").
		Joins("LEFT JOIN users u ON u.id = orders.user_id").
		Order("orders.id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Scan(&list)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "total": total})
}

// ============ Team Logs ============

func AgentListTeamLogs(c *gin.Context) {
	teamIds, scoped := scopeUserIDs(c)
	if scoped && len(teamIds) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []any{}, "total": 0})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 15
	}
	username := strings.TrimSpace(c.Query("username"))
	modelName := strings.TrimSpace(c.Query("model_name"))

	q := model.DB.Table("logs")
	if scoped {
		q = q.Where("user_id IN ?", teamIds)
	}
	if username != "" {
		q = q.Where("username LIKE ?", "%"+username+"%")
	}
	if modelName != "" {
		q = q.Where("model_name LIKE ?", "%"+modelName+"%")
	}

	var total int64
	q.Count(&total)

	var list []map[string]any
	q.Order("id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&list)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "total": total})
}

// ============ My Commissions ============

func AgentListMyCommissions(c *gin.Context) {
	selfId := c.GetInt("id")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "15"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 15
	}
	status := strings.TrimSpace(c.Query("status"))

	q := model.DB.Model(&model.Commission{}).Where("user_id = ?", selfId)
	if status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	q.Count(&total)

	// 统计：累计 / 待结算 / 已结算
	var totalAmt, pendingAmt, settledAmt float64
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status IN (?, ?)", selfId,
			model.CommissionStatusPending, model.CommissionStatusSettled).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalAmt)
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = ?", selfId, model.CommissionStatusPending).
		Select("COALESCE(SUM(amount), 0)").Scan(&pendingAmt)
	model.DB.Model(&model.Commission{}).
		Where("user_id = ? AND status = ?", selfId, model.CommissionStatusSettled).
		Select("COALESCE(SUM(amount), 0)").Scan(&settledAmt)

	type row struct {
		model.Commission
		FromUsername string `json:"from_username"`
	}
	var list []row
	q.Select("commissions.*, u.username as from_username").
		Joins("LEFT JOIN users u ON u.id = commissions.from_user_id").
		Order("commissions.id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Scan(&list)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    list,
		"total":   total,
		"stats": gin.H{
			"total":   totalAmt,
			"pending": pendingAmt,
			"settled": settledAmt,
		},
	})
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend
go build ./...
```

期望：clean。如果报 unused import / missing import，按报错补 import 列表。

- [ ] **Step 3: 加路由**

打开 `backend/router/lingjing-router.go`，找到 admin 组的闭合 `}`（line ~140，在 `admin.DELETE("/cost-ledger/:id", ...)` 之后）。在它**之后**追加一个新组（注意要在文件层级，不在 admin 组里）：

```go

	// ===== 代理（agent role >= 5）=====
	// 数据隔离由 controller 内 scopeUserIDs() helper 完成，
	// admin/root 通过同一接口看全局，代理看自己 team
	agent := router.Group("/api/admin/lingjing/agent")
	agent.Use(middleware.AgentAuth())
	{
		agent.GET("/overview", controller.AgentGetOverview)
		agent.GET("/team-members", controller.AgentListTeamMembers)
		agent.GET("/team-orders", controller.AgentListTeamOrders)
		agent.GET("/team-logs", controller.AgentListTeamLogs)
		agent.GET("/my-commissions", controller.AgentListMyCommissions)
	}

```

具体插入位置：在 `// ===== 分组管理 =====` **之前**（这样保持"灵镜扩展"区域聚合）。

- [ ] **Step 4: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend
go build ./...
```

期望：clean。

- [ ] **Step 5: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add backend/controller/lingjing_agent.go backend/router/lingjing-router.go
git commit -m "feat(agent): 5 agent endpoints + scopeUserIDs helper

5 new endpoints under /api/admin/lingjing/agent/* behind AgentAuth (role >= 5):
- GET /overview      团队人数 / 团队营收 / 我的佣金 / 团队本月调用
- GET /team-members  仅 inviter_id = self.id 的用户列表
- GET /team-orders   下单人是 self 下线的订单
- GET /team-logs     调用人是 self 下线的日志
- GET /my-commissions 我作为邀请人收到的佣金 + 累计/待结/已结统计

scopeUserIDs() helper centralizes the team-id resolution:
admin/root return (nil, false) = no filter; agent returns the list of
direct downline IDs. All 4 list endpoints call it before SQL.

Empty-team handling: if agent has no downlines, all list endpoints
short-circuit return [] (not run JOIN), saves a query.

Rollback: git revert <this-sha>"
git push origin main
```

---

# Phase B — 前端（commits 3-6）

**前置**: A1+A2 已 commit（不一定要部署，前端可以先开发后联调）。

**验收**:
- `npm run build` clean
- admin 用户登入：体验完全跟以前一样，看不到代理页面
- 把测试用户 role 1→5，重新登入：进 `/agent/overview` 看到 4 卡片 + 5 项菜单
- 测试用户手动输 `/users` → 跳 `/agent/overview`

---

### Task B1: 前端基础设施

**Files:**
- Modify: `admin/src/api/index.ts`（加 agentApi + ADMIN_PAGE_MIN_ROLE）
- Create: `admin/src/components/RoleGuard.tsx`
- Modify: `admin/src/pages/Login.tsx`（按 role 跳转）
- Modify: `admin/src/components/AdminLayout.tsx`（菜单裁剪 + agent 项 + ADMIN_MIN_ROLE 改 5）
- Modify: `admin/src/App.tsx`（admin-only 路由包 RoleGuard + agent 路由）

- [ ] **Step 1: api/index.ts 加 agentApi + 两档常量**

打开 `admin/src/api/index.ts`，把现有 `export const ADMIN_MIN_ROLE = 10` 整段替换为：

```ts
// 准入门槛：能进 admin 网站（Login 接受 + AdminLayout 不踢出）
// 当前 = 5 (RoleAgentUser)，让代理也能进
export const ADMIN_MIN_ROLE = 5

// 页面级门槛：admin 专属页（用户/渠道/系统设置/财务等）的可见门槛
// 代理 (5) 不够，admin (10) 才可见。RoleGuard HOC 用这个值
export const ADMIN_PAGE_MIN_ROLE = 10
```

然后在文件末尾追加：

```ts

// 代理端只读 API
export const agentApi = {
  overview: () => http.get('/api/admin/lingjing/agent/overview'),
  teamMembers: (params?: { page?: number; page_size?: number; keyword?: string }) =>
    http.get('/api/admin/lingjing/agent/team-members', { params }),
  teamOrders: (params?: { page?: number; page_size?: number; status?: string }) =>
    http.get('/api/admin/lingjing/agent/team-orders', { params }),
  teamLogs: (params?: { page?: number; page_size?: number; username?: string; model_name?: string }) =>
    http.get('/api/admin/lingjing/agent/team-logs', { params }),
  myCommissions: (params?: { page?: number; page_size?: number; status?: string }) =>
    http.get('/api/admin/lingjing/agent/my-commissions', { params }),
}
```

- [ ] **Step 2: 新建 RoleGuard**

Create `admin/src/components/RoleGuard.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authApi } from '../api'

interface Props {
  min: number
  children: ReactNode
  fallback?: string // 不够格时跳哪
}

// RoleGuard 路由级权限闸：role < min 时直接 Navigate 走，不渲染 children。
// 用法：<RoleGuard min={10}><UsersPage/></RoleGuard>
// 用于挡住"代理在地址栏手输 admin URL"绕过菜单裁剪的情况。
//
// 注意：这是前端守卫，仅是 UX 防护；后端 AdminAuth 中间件才是真正的权限边界。
export function RoleGuard({ min, children, fallback = '/agent/overview' }: Props) {
  const [role, setRole] = useState<number | null>(null)

  useEffect(() => {
    authApi.getSelf()
      .then(r => setRole(r.data?.data?.role ?? 0))
      .catch(() => setRole(0))
  }, [])

  if (role === null) return null // 验证中，啥都不渲染（AdminLayout 已显示 loading 文字）
  if (role < min) return <Navigate to={fallback} replace />
  return <>{children}</>
}
```

- [ ] **Step 3: Login.tsx 按 role 跳转**

打开 `admin/src/pages/Login.tsx`，找到 navigate('/overview') 那段（在 handleSubmit 里）。把：

```tsx
      navigate('/overview')
```

改成：

```tsx
      // 代理跳代理首页，admin/root 跳总览
      const home = role >= 10 ? '/overview' : '/agent/overview'
      navigate(home)
```

注意：`role` 变量在 selfRes 那段已经取到了，直接复用即可。

- [ ] **Step 4: AdminLayout.tsx — 菜单裁剪 + agent 项 + role state**

打开 `admin/src/components/AdminLayout.tsx`。这次改动较多：

**(a)** 引入需要的图标（Briefcase 给"团队"分组的 icon 风格用，TrendingUp 给佣金）：

把现有 lucide-react import 行：
```tsx
import { LayoutDashboard, Users, Radio, Gift, ScrollText, LogOut, Settings, Shield, Menu, X, CreditCard, Share2, Bell, Sliders, Wallet, Cpu, ListTodo, DollarSign } from 'lucide-react'
```

改成（加 Briefcase 和 TrendingUp）：
```tsx
import { LayoutDashboard, Users, Radio, Gift, ScrollText, LogOut, Settings, Shield, Menu, X, CreditCard, Share2, Bell, Sliders, Wallet, Cpu, ListTodo, DollarSign, Briefcase, TrendingUp } from 'lucide-react'
```

**(b)** navSections 数组：每项可选加 `agentVisible: true` flag（代理可见的项）+ 末尾整段新增一个 "代理后台" 分组。

把现有 `const navSections = [...]` 整段（line ~6 到 ~42）替换为：

```tsx
type NavItem = { to: string; icon: any; label: string; agentVisible?: boolean }
type NavSection = { label: string; items: NavItem[]; agentVisible?: boolean }

const navSections: NavSection[] = [
  {
    label: '系统总览',
    items: [
      { to: '/overview', icon: LayoutDashboard, label: '数据概览' },
      { to: '/channels', icon: Radio, label: '渠道管理' },
      { to: '/users', icon: Users, label: '用户管理' },
      { to: '/logs', icon: ScrollText, label: '调用日志' },
      { to: '/tasks', icon: ListTodo, label: '异步任务' },
    ],
  },
  {
    label: '商业运营',
    items: [
      { to: '/orders', icon: CreditCard, label: '订单管理' },
      { to: '/redemptions', icon: Gift, label: '兑换码' },
      { to: '/referrals', icon: Share2, label: '分销管理' },
      { to: '/withdrawals', icon: Wallet, label: '提现审核' },
      { to: '/finance', icon: DollarSign, label: '财务统计' },
      { to: '/plans', icon: CreditCard, label: '套餐管理' },
      { to: '/payment', icon: CreditCard, label: '支付配置' },
    ],
  },
  {
    label: '内容配置',
    items: [
      { to: '/model-prices', icon: Cpu, label: '模型广场' },
      { to: '/model-manage', icon: Sliders, label: '模型管理' },
      { to: '/notices', icon: Bell, label: '公告管理' },
      { to: '/settings', icon: Settings, label: '系统设置' },
    ],
  },
  {
    label: '我的代理',  // ← 新增分组（仅代理可见）
    agentVisible: true,
    items: [
      { to: '/agent/overview',       icon: Briefcase,  label: '团队概览',   agentVisible: true },
      { to: '/agent/team-members',   icon: Users,      label: '团队成员',   agentVisible: true },
      { to: '/agent/team-orders',    icon: CreditCard, label: '团队订单',   agentVisible: true },
      { to: '/agent/team-logs',      icon: ScrollText, label: '团队日志',   agentVisible: true },
      { to: '/agent/my-commissions', icon: TrendingUp, label: '我的佣金',   agentVisible: true },
    ],
  },
]
```

**(c)** 改 useEffect 守卫 — 拿 role 并存到 state，渲染时用 role 过滤 navSections：

找到现有 `const [authChecked, setAuthChecked] = useState(false)`，**在它下面**加：

```tsx
  const [role, setRole] = useState<number>(0)
```

然后**替换**现有 useEffect 整段（`authApi.getSelf().then(...)` 那块）为：

```tsx
  useEffect(() => {
    authApi.getSelf().then(r => {
      const userRole = r.data?.data?.role ?? 0
      if (!r.data?.success || userRole < ADMIN_MIN_ROLE) {
        authApi.logout().catch(() => {})
        navigate('/login', { replace: true })
        return
      }
      setRole(userRole)
      setAuthChecked(true)
    }).catch(() => {
      navigate('/login', { replace: true })
    })
  }, [navigate])
```

**(d)** 渲染时按 role 过滤 navSections — 找到 `<nav style={...}>` 块开头，把：

```tsx
        <nav style={{ flex: 1, padding: '0 8px' }}>
          {navSections.map(section => (
```

改成（仅插入一行 visibleSections 计算 + 把 map 源换掉）：

```tsx
        <nav style={{ flex: 1, padding: '0 8px' }}>
          {(() => {
            const isAdmin = role >= 10
            const visibleSections = navSections
              .map(s => ({
                ...s,
                items: s.items.filter(i => isAdmin ? !s.agentVisible : (i.agentVisible === true)),
              }))
              .filter(s => s.items.length > 0)
            return visibleSections
          })().map(section => (
```

逻辑说明：
- admin (role≥10)：过滤掉 `agentVisible: true` 的分组（"我的代理"对 admin 隐藏；admin 看全局数据，不需要代理视图）
- agent (role=5)：只保留 `i.agentVisible === true` 的项（即"我的代理"分组里的 5 项）

**(e)** （可选 UI 微调）在 sidebar 顶部 "ADMIN CONSOLE" 文字下显示当前 role：

找到 `<div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', letterSpacing: '.05em' }}>ADMIN CONSOLE</div>`，改成：

```tsx
<div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', letterSpacing: '.05em' }}>
  {role >= 100 ? 'ROOT' : role >= 10 ? 'ADMIN CONSOLE' : role === 5 ? 'AGENT CONSOLE' : 'CONSOLE'}
</div>
```

- [ ] **Step 5: App.tsx — admin-only 路由包 RoleGuard + agent 5 个路由**

打开 `admin/src/App.tsx`。

**(a)** 加 import：

把现有：
```tsx
import FinancePage from './pages/Finance'
```

改成：
```tsx
import FinancePage from './pages/Finance'
import { RoleGuard } from './components/RoleGuard'
import { ADMIN_PAGE_MIN_ROLE } from './api'
import AgentOverviewPage from './pages/agent/AgentOverview'
import AgentTeamMembersPage from './pages/agent/AgentTeamMembers'
import AgentTeamOrdersPage from './pages/agent/AgentTeamOrders'
import AgentTeamLogsPage from './pages/agent/AgentTeamLogs'
import AgentCommissionsPage from './pages/agent/AgentCommissions'
```

（这一步引用了 B2/B3/B4 还没建的文件 — 暂时会报错。先注释掉前 4 个 agent import，把 RoleGuard 路由跑通；B2 起每个 task 完成后再启用对应 import。或者干脆等 B4 完成后再统一改 App.tsx。**推荐 B1 不引 agent imports，B2/B3/B4 各自负责追加自己那行 import + 路由**。下面 B1 的版本不引 agent。）

**B1 实际代码**（保守版，不引 agent imports）：

把现有：
```tsx
import FinancePage from './pages/Finance'
```

改成：
```tsx
import FinancePage from './pages/Finance'
import { RoleGuard } from './components/RoleGuard'
import { ADMIN_PAGE_MIN_ROLE } from './api'
```

**(b)** 包 admin-only 路由 — 把 Routes 段所有现有 `<Route path="xxx" element={<XxxPage />} />` 改成 `element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><XxxPage /></RoleGuard>}`。

具体替换（把以下整段 `<Route path="overview" ... />` 到 `<Route path="settings" ... />`）：

```tsx
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="redemptions" element={<RedemptionsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="referrals" element={<ReferralsPage />} />
          <Route path="withdrawals" element={<WithdrawalsPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="model-prices" element={<ModelPricesPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="model-manage" element={<ModelManagePage />} />
          <Route path="model-ratios" element={<ModelRatiosPage />} />
          <Route path="payment" element={<PaymentSettingsPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="settings" element={<SettingsPage />} />
```

替换为：

```tsx
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><OverviewPage /></RoleGuard>} />
          <Route path="users" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><UsersPage /></RoleGuard>} />
          <Route path="channels" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ChannelsPage /></RoleGuard>} />
          <Route path="redemptions" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><RedemptionsPage /></RoleGuard>} />
          <Route path="logs" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><LogsPage /></RoleGuard>} />
          <Route path="tasks" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><TasksPage /></RoleGuard>} />
          <Route path="orders" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><OrdersPage /></RoleGuard>} />
          <Route path="referrals" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ReferralsPage /></RoleGuard>} />
          <Route path="withdrawals" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><WithdrawalsPage /></RoleGuard>} />
          <Route path="finance" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><FinancePage /></RoleGuard>} />
          <Route path="model-prices" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ModelPricesPage /></RoleGuard>} />
          <Route path="notices" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><NoticesPage /></RoleGuard>} />
          <Route path="model-manage" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ModelManagePage /></RoleGuard>} />
          <Route path="model-ratios" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ModelRatiosPage /></RoleGuard>} />
          <Route path="payment" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><PaymentSettingsPage /></RoleGuard>} />
          <Route path="plans" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><PlansPage /></RoleGuard>} />
          <Route path="settings" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><SettingsPage /></RoleGuard>} />
```

注意 `index` 路由（`/`）暂时还是跳 `/overview`，B2 改 RoleHome 时再处理（看下面 B2 Step 0）。

**(c)** B1 暂时**不加** agent 路由 —— 没建对应页面，加了会报 import 错。B2/B3/B4 每个任务负责追加自己的 agent 路由。

- [ ] **Step 6: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run build
```

期望：clean。

- [ ] **Step 7: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/api/index.ts admin/src/components/RoleGuard.tsx admin/src/components/AdminLayout.tsx admin/src/App.tsx admin/src/pages/Login.tsx
git commit -m "feat(agent-ui): foundation - RoleGuard + sidebar split + login redirect

- api/index.ts: ADMIN_MIN_ROLE 10→5 (let agents in), ADMIN_PAGE_MIN_ROLE=10 (new),
  agentApi for 5 new endpoints
- RoleGuard.tsx: route-level guard, redirects role < min to /agent/overview
- AdminLayout: track session role, filter navSections by agentVisible flag;
  agent sees only '我的代理' section (5 items), admin sees all except agent section
- Login: after auth, redirect role>=10 → /overview, role<10 → /agent/overview
- App.tsx: wrap all 17 admin pages with RoleGuard min={ADMIN_PAGE_MIN_ROLE}
  (agent routes added in subsequent commits as pages are built)

Build clean. Existing admin (role>=10) flow unaffected.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task B2: AgentOverview.tsx — 4 卡片团队概览

**Files:**
- Create: `admin/src/pages/agent/AgentOverview.tsx`
- Modify: `admin/src/App.tsx`（追加 `/agent/overview` 路由 + import）

- [ ] **Step 1: 新建 page 文件**

Create `admin/src/pages/agent/AgentOverview.tsx`（注意要新建 `agent/` 子目录）：

```tsx
import { useEffect, useState } from 'react'
import { Briefcase, Users, DollarSign, TrendingUp, ListTodo } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { agentApi } from '../../api'

interface Overview {
  team_size: number
  month_revenue: number
  my_commission: number
  month_calls: number
}

export default function AgentOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)

  useEffect(() => {
    agentApi.overview().then(r => {
      if (r.data?.success) setData(r.data.data)
    }).catch(() => toast.error('加载失败'))
  }, [])

  const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`
  const fmtCny = (n: number) => `¥${(n || 0).toFixed(2)}` // 1:1 USD 假设

  return (
    <div>
      <PageHeader
        title="团队概览"
        description="您团队（您直接邀请的下线）的实时数据"
        icon={Briefcase}
      />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="团队人数"
          value={data?.team_size ?? '—'}
          icon={Users}
          color="info"
          hint="您直接邀请的下线"
        />
        <StatCard
          label="团队本月营收"
          value={data ? fmtCny(data.month_revenue) : '—'}
          icon={DollarSign}
          color="success"
          hint="团队成员本月充值总额"
        />
        <StatCard
          label="我的佣金累计"
          value={data ? fmtUsd(data.my_commission) : '—'}
          icon={TrendingUp}
          color="accent"
          hint="待结算 + 已结算"
        />
        <StatCard
          label="团队本月调用"
          value={data?.month_calls ?? '—'}
          icon={ListTodo}
          color="warning"
          hint="团队成员 API 调用次数"
        />
      </div>

      <div className="card" style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)', fontSize: 14 }}>说明</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>佣金按管理员为您设的"专属返利比例"自动计算，每次团队成员充值成功时入账</li>
          <li>佣金状态：待结算 → 已结算（可提现）</li>
          <li>需要提现请联系管理员或在「我的佣金」页申请</li>
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: App.tsx 追加 import + 路由**

打开 `admin/src/App.tsx`。

**(a)** 在 RoleGuard import 之后追加：
```tsx
import AgentOverviewPage from './pages/agent/AgentOverview'
```

**(b)** 在 `<Route path="settings" ... />` 之后（admin-only 那批的末尾）追加：
```tsx
          <Route path="agent/overview" element={<AgentOverviewPage />} />
```

（注意：agent 路由**不包** RoleGuard — 因为 AdminLayout 的 ADMIN_MIN_ROLE=5 守卫已经挡了普通用户；agent 页面所有 role >= 5 都可见。）

- [ ] **Step 3: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run build
```

期望：clean。

- [ ] **Step 4: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/pages/agent/AgentOverview.tsx admin/src/App.tsx
git commit -m "feat(agent-ui): AgentOverview page (4 KPI cards)

- 4 StatCards: 团队人数 / 本月营收 / 我的佣金 / 团队本月调用
- Reads /api/admin/lingjing/agent/overview
- 1:1 USD assumption for currency display (营收 ¥, 佣金 \$)
- Route /agent/overview registered in App.tsx (no RoleGuard needed —
  AdminLayout already gates role >= 5)

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task B3: 3 个团队列表页（成员 / 订单 / 日志）

**Files:**
- Create: `admin/src/pages/agent/AgentTeamMembers.tsx`
- Create: `admin/src/pages/agent/AgentTeamOrders.tsx`
- Create: `admin/src/pages/agent/AgentTeamLogs.tsx`
- Modify: `admin/src/App.tsx`（追加 3 个 import + 3 个路由）

- [ ] **Step 1: AgentTeamMembers.tsx**

Create `admin/src/pages/agent/AgentTeamMembers.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { SearchInput } from '../../components/SearchInput'
import { EmptyCard } from '../../components/EmptyCard'
import Pagination from '../../components/Pagination'
import { agentApi } from '../../api'

interface Member {
  id: number
  username: string
  display_name: string
  email: string
  group: string
  quota: number
  used_quota: number
  request_count: number
  status: number
  created_time: number
}

const PAGE_SIZE = 15

export default function AgentTeamMembersPage() {
  const [list, setList] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    agentApi.teamMembers({
      page,
      page_size: PAGE_SIZE,
      keyword: keyword || undefined,
    }).then(r => {
      if (r.data?.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => toast.error('加载失败'))
  }, [page, keyword])

  const toUsd = (q: number) => (q / 500000).toFixed(2)

  return (
    <div>
      <PageHeader
        title="团队成员"
        description={`共 ${total} 位成员（您直接邀请的下线）`}
        icon={Users}
        actions={
          <SearchInput
            value={keyword}
            onChange={v => { setKeyword(v); setPage(1) }}
            placeholder="搜索用户名/邮箱"
            width={240}
            debounce={300}
          />
        }
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>显示名 / 邮箱</th>
              <th>分组</th>
              <th style={{ textAlign: 'right' }}>剩余额度</th>
              <th style={{ textAlign: 'right' }}>累计消费</th>
              <th style={{ textAlign: 'right' }}>调用次数</th>
              <th>加入时间</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 0 }}>
                <EmptyCard
                  icon={Users}
                  title={keyword ? '未找到匹配成员' : '暂无团队成员'}
                  description={keyword ? '试试别的关键字' : '把您的邀请链接发给朋友，他们注册后会出现在这里'}
                />
              </td></tr>
            ) : list.map(u => (
              <tr key={u.id}>
                <td>
                  <strong>{u.username}</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: 2 }}>
                    #{u.id}
                  </div>
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  <div>{u.display_name || '—'}</div>
                  {u.email && <div style={{ fontSize: 11, marginTop: 2 }}>{u.email}</div>}
                </td>
                <td>
                  <span className="badge badge-gray" style={{ fontSize: 11 }}>{u.group || 'default'}</span>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: u.quota < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                  ${toUsd(u.quota)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                  ${toUsd(u.used_quota)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                  {(u.request_count || 0).toLocaleString()}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {u.created_time ? new Date(u.created_time * 1000).toLocaleDateString('zh-CN') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  )
}
```

- [ ] **Step 2: AgentTeamOrders.tsx**

Create `admin/src/pages/agent/AgentTeamOrders.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { FilterTabs } from '../../components/FilterTabs'
import { EmptyCard } from '../../components/EmptyCard'
import Pagination from '../../components/Pagination'
import { agentApi } from '../../api'

interface Order {
  id: number
  user_id: number
  username: string
  email: string
  order_no: string
  amount: number
  quota: number
  status: number
  payment_method: string
  created_at: number
  paid_at: number
}

const STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '待支付', value: '0' },
  { label: '已完成', value: '1' },
  { label: '已取消', value: '2' },
]

const STATUS_MAP: Record<number, { label: string; cls: string }> = {
  0: { label: '待支付', cls: 'badge-yellow' },
  1: { label: '已完成', cls: 'badge-green' },
  2: { label: '已取消', cls: 'badge-gray' },
}

const PAGE_SIZE = 15

export default function AgentTeamOrdersPage() {
  const [list, setList] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  useEffect(() => {
    agentApi.teamOrders({
      page,
      page_size: PAGE_SIZE,
      status: status || undefined,
    }).then(r => {
      if (r.data?.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => toast.error('加载失败'))
  }, [page, status])

  return (
    <div>
      <PageHeader
        title="团队订单"
        description={`共 ${total} 笔订单`}
        icon={CreditCard}
      />

      <div style={{ marginBottom: 16 }}>
        <FilterTabs
          value={status}
          onChange={v => { setStatus(v); setPage(1) }}
          options={STATUS_TABS}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>下单用户</th>
              <th>订单号</th>
              <th style={{ textAlign: 'right' }}>金额 (¥)</th>
              <th style={{ textAlign: 'right' }}>额度 ($)</th>
              <th>支付方式</th>
              <th>状态</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 0 }}>
                <EmptyCard
                  icon={CreditCard}
                  title={status ? '该状态下暂无订单' : '暂无订单'}
                  description={status ? '试试别的状态' : '团队成员充值后会出现在这里'}
                />
              </td></tr>
            ) : list.map(o => {
              const st = STATUS_MAP[o.status] || { label: '未知', cls: 'badge-gray' }
              return (
                <tr key={o.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{o.username || `#${o.user_id}`}</div>
                    {o.email && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.email}</div>}
                  </td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>{o.order_no}</code>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>¥{o.amount?.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${(o.quota / 500000).toFixed(2)}</td>
                  <td><span className="badge badge-gray">{o.payment_method || '-'}</span></td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {o.created_at ? new Date(o.created_at * 1000).toLocaleString('zh-CN') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  )
}
```

- [ ] **Step 3: AgentTeamLogs.tsx**

Create `admin/src/pages/agent/AgentTeamLogs.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { ScrollText, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { SearchInput } from '../../components/SearchInput'
import { EmptyCard } from '../../components/EmptyCard'
import Pagination from '../../components/Pagination'
import { agentApi } from '../../api'

interface LogRow {
  id: number
  created_at: number
  username: string
  token_name: string
  model_name: string
  prompt_tokens: number
  completion_tokens: number
  channel_id: number
  elapsed_time: number
  quota: number
}

const PAGE_SIZE = 15

export default function AgentTeamLogsPage() {
  const [list, setList] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState({ username: '', model_name: '' })

  const load = () => {
    agentApi.teamLogs({
      page,
      page_size: PAGE_SIZE,
      username: filter.username || undefined,
      model_name: filter.model_name || undefined,
    }).then(r => {
      if (r.data?.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => toast.error('加载失败'))
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [page])

  const handleSearch = () => { if (page !== 1) setPage(1); else load() }

  return (
    <div>
      <PageHeader
        title="团队调用日志"
        description={`共 ${total} 条记录`}
        icon={ScrollText}
        actions={
          <>
            <SearchInput
              value={filter.username}
              onChange={v => setFilter(p => ({ ...p, username: v }))}
              onSubmit={handleSearch}
              placeholder="用户名"
              width={160}
            />
            <SearchInput
              value={filter.model_name}
              onChange={v => setFilter(p => ({ ...p, model_name: v }))}
              onSubmit={handleSearch}
              placeholder="模型"
              width={180}
            />
            <button className="btn btn-outline" onClick={handleSearch}><RefreshCw size={14}/>查询</button>
          </>
        }
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>令牌</th>
              <th>模型</th>
              <th style={{ textAlign: 'right' }}>输入</th>
              <th style={{ textAlign: 'right' }}>输出</th>
              <th>渠道</th>
              <th style={{ textAlign: 'right' }}>耗时</th>
              <th style={{ textAlign: 'right' }}>费用</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 0 }}>
                <EmptyCard
                  icon={ScrollText}
                  title="暂无日志"
                  description={(filter.username || filter.model_name) ? '试试别的筛选条件' : ''}
                />
              </td></tr>
            ) : list.map(log => (
              <tr key={log.id}>
                <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {new Date(log.created_at * 1000).toLocaleString('zh-CN')}
                </td>
                <td><strong style={{ fontSize: 13 }}>{log.username}</strong></td>
                <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{log.token_name}</span></td>
                <td><code style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>{log.model_name}</code></td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{log.prompt_tokens?.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{log.completion_tokens?.toLocaleString()}</td>
                <td><span className="badge badge-blue">#{log.channel_id}</span></td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {log.elapsed_time ? `${log.elapsed_time}ms` : '-'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                  ${(log.quota / 500000).toFixed(5)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  )
}
```

- [ ] **Step 4: App.tsx 追加 3 个 import + 3 个路由**

打开 `admin/src/App.tsx`。

在 `import AgentOverviewPage` 之后追加：
```tsx
import AgentTeamMembersPage from './pages/agent/AgentTeamMembers'
import AgentTeamOrdersPage from './pages/agent/AgentTeamOrders'
import AgentTeamLogsPage from './pages/agent/AgentTeamLogs'
```

在 `<Route path="agent/overview" ... />` 之后追加：
```tsx
          <Route path="agent/team-members" element={<AgentTeamMembersPage />} />
          <Route path="agent/team-orders" element={<AgentTeamOrdersPage />} />
          <Route path="agent/team-logs" element={<AgentTeamLogsPage />} />
```

- [ ] **Step 5: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run build
```

期望：clean。

- [ ] **Step 6: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/pages/agent/AgentTeamMembers.tsx admin/src/pages/agent/AgentTeamOrders.tsx admin/src/pages/agent/AgentTeamLogs.tsx admin/src/App.tsx
git commit -m "feat(agent-ui): 3 team list pages — members / orders / logs

- AgentTeamMembers: read-only user list, 7 cols, SearchInput filter, pagination
- AgentTeamOrders: read-only order list, FilterTabs for status, 7 cols
- AgentTeamLogs: read-only log list, 2 SearchInputs (username + model_name)
- All use existing Day 1-7 components (PageHeader/SearchInput/FilterTabs/EmptyCard/Pagination)
- All read /api/admin/lingjing/agent/* endpoints which auto-scope by inviter_id

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task B4: AgentCommissions.tsx — 我的佣金

**Files:**
- Create: `admin/src/pages/agent/AgentCommissions.tsx`
- Modify: `admin/src/App.tsx`（追加 import + 路由）

- [ ] **Step 1: 新建 page 文件**

Create `admin/src/pages/agent/AgentCommissions.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { TrendingUp, DollarSign, Clock, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { FilterTabs } from '../../components/FilterTabs'
import { EmptyCard } from '../../components/EmptyCard'
import Pagination from '../../components/Pagination'
import { agentApi } from '../../api'

interface Commission {
  id: number
  from_user_id: number
  from_username: string
  order_id: number
  amount: number
  status: number
  settled_via: string
  created_at: string
}

interface Stats {
  total: number
  pending: number
  settled: number
}

// Commission.status: 0=pending, 1=settled, 99=disabled-snapshot
const STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '待结算', value: '0' },
  { label: '已结算', value: '1' },
]

const STATUS_MAP: Record<number, { label: string; cls: string }> = {
  0:  { label: '待结算', cls: 'badge-yellow' },
  1:  { label: '已结算', cls: 'badge-green' },
  99: { label: '快照',   cls: 'badge-gray' },
}

const PAGE_SIZE = 15

export default function AgentCommissionsPage() {
  const [list, setList] = useState<Commission[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  useEffect(() => {
    agentApi.myCommissions({
      page,
      page_size: PAGE_SIZE,
      status: status || undefined,
    }).then(r => {
      if (r.data?.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
        if (r.data.stats) setStats(r.data.stats)
      }
    }).catch(() => toast.error('加载失败'))
  }, [page, status])

  const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`

  return (
    <div>
      <PageHeader
        title="我的佣金"
        description="您作为邀请人收到的所有佣金记录"
        icon={TrendingUp}
      />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="累计佣金"
          value={stats ? fmtUsd(stats.total) : '—'}
          icon={DollarSign}
          color="accent"
          hint="待结算 + 已结算"
        />
        <StatCard
          label="待结算"
          value={stats ? fmtUsd(stats.pending) : '—'}
          icon={Clock}
          color="warning"
          hint="即将到账"
        />
        <StatCard
          label="已结算"
          value={stats ? fmtUsd(stats.settled) : '—'}
          icon={CheckCircle}
          color="success"
          hint="可提现"
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <FilterTabs
          value={status}
          onChange={v => { setStatus(v); setPage(1) }}
          options={STATUS_TABS}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>来源用户</th>
              <th>订单</th>
              <th style={{ textAlign: 'right' }}>金额 ($)</th>
              <th>状态</th>
              <th>结算方式</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 0 }}>
                <EmptyCard
                  icon={TrendingUp}
                  title={status ? '该状态下暂无佣金' : '暂无佣金记录'}
                  description={status ? '试试别的状态' : '团队成员充值时您会自动获得佣金'}
                />
              </td></tr>
            ) : list.map(c => {
              const st = STATUS_MAP[c.status] || { label: '未知', cls: 'badge-gray' }
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.from_username || `#${c.from_user_id}`}</strong>
                  </td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>#{c.order_id}</code>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)' }}>
                    ${c.amount.toFixed(2)}
                  </td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.settled_via || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleString('zh-CN') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <div className="card" style={{ padding: 16, marginTop: 16, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)', fontSize: 13 }}>结算说明</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li><strong>待结算</strong>：佣金已计算完成，等待管理员审核结算</li>
          <li><strong>已结算</strong>：已可提现；提现请联系管理员</li>
          <li><strong>结算方式</strong>：quota = 转账到账户余额；withdraw = 走支付宝打款</li>
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: App.tsx 追加 import + 路由**

打开 `admin/src/App.tsx`。

在 `import AgentTeamLogsPage` 之后追加：
```tsx
import AgentCommissionsPage from './pages/agent/AgentCommissions'
```

在 `<Route path="agent/team-logs" ... />` 之后追加：
```tsx
          <Route path="agent/my-commissions" element={<AgentCommissionsPage />} />
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run build
```

期望：clean。

- [ ] **Step 4: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/pages/agent/AgentCommissions.tsx admin/src/App.tsx
git commit -m "feat(agent-ui): AgentCommissions page

- 3 StatCards: 累计 / 待结算 / 已结算 (USD)
- FilterTabs for status (全部/待结算/已结算)
- Table: from_user / order_id / amount / status / settled_via / time
- Footer note explains settlement workflow

Reads /api/admin/lingjing/agent/my-commissions, which returns both
list and stats (3 sums) in one payload.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task C: Users.tsx ROLES 加 "代理" + getRoleLabel 分支

**Files:**
- Modify: `admin/src/pages/Users.tsx`

- [ ] **Step 1: ROLES 数组加一项**

打开 `admin/src/pages/Users.tsx`。找到 `const ROLES = [` 块（line 7-11 附近）。

把：
```tsx
const ROLES = [
  { value: 1, label: '普通用户' },
  { value: 10, label: '管理员' },
  { value: 100, label: '超级管理员' },
]
```

改成：
```tsx
const ROLES = [
  { value: 1,   label: '普通用户' },
  { value: 5,   label: '代理' },     // 可登入 admin 后台，只读看团队 + 佣金；按 affiliate_rate 算专属佣金
  { value: 10,  label: '管理员' },
  { value: 100, label: '超级管理员' },
]
```

- [ ] **Step 2: getRoleLabel 加 role=5 分支**

在同一文件找到 `getRoleLabel`（line ~216 附近）。

把：
```tsx
  const getRoleLabel = (role: number) => {
    if (role >= 100) return { label: '超管', cls: 'badge-purple' }
    if (role >= 10) return { label: '管理员', cls: 'badge-yellow' }
    return { label: '用户', cls: 'badge-gray' }
  }
```

改成：
```tsx
  const getRoleLabel = (role: number) => {
    if (role >= 100) return { label: '超管', cls: 'badge-purple' }
    if (role >= 10)  return { label: '管理员', cls: 'badge-yellow' }
    if (role >= 5)   return { label: '代理',  cls: 'badge-info' }  // 蓝色 info 区别于管理员的黄色
    return { label: '用户', cls: 'badge-gray' }
  }
```

- [ ] **Step 3: handleSave 的 confirmation message 加代理识别（可选优化）**

`handleSave` 里现有"角色提升 / 降级"的 confirm 已经基于 ROLES.find()，加了 role=5 项后会自动识别为"代理"。无需改动。

- [ ] **Step 4: 编译验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run build
```

期望：clean。

- [ ] **Step 5: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/pages/Users.tsx
git commit -m "feat(agent-ui): Users.tsx — add 代理 (role=5) to ROLES + badge

- ROLES dropdown gets '代理' option (value=5) between 普通用户 and 管理员
- getRoleLabel: role>=5 returns { label: '代理', cls: 'badge-info' }
  (blue badge distinct from manager's yellow)
- 编辑 modal 的'专属返利比例'字段已存在 (Day 4.3 已实现)，代理直接复用
- handleSave 的 confirm 自动识别 role=5 为'代理'（ROLES.find 已包含）

Admin workflow: open user, switch role 1→5 in 配置 tab, set affiliate_rate
percentage, save. handleSave 已有的'角色变更确认' dialog 会弹出提示。

Rollback: git revert <this-sha>"
git push origin main
```

---

# Phase D — 部署 + smoke test（0.25 天）

**前置**: A1~C 全部 commit 在 origin/main。

**验收**：超管把测试用户 role 1→5；测试用户重登能进 `/agent/overview`，看到 5 项菜单 + 4 卡片；admin 体验完全不变。

---

### Task D1: 部署

后端 + 前端**都改了**，走完整 deploy.sh 或手动两步：

- [ ] **后端 rebuild**:

```bash
ssh root@8.218.203.189
cd /root/lingjing-ai && git pull origin main
docker build -t lingjing-api:latest /root/lingjing-ai/backend/
cd /root/lingjing-ai/one-api && docker compose up -d --force-recreate one-api
```

- [ ] **后端启动确认**:

```bash
sleep 10
docker logs one-api --tail 30 2>&1 | grep -iE 'agent|error|listen' | head -10
docker inspect lingjing-api:latest --format '{{.Created}}'   # 应该是刚刚
curl -sf --max-time 5 http://localhost:3000/api/status > /dev/null && echo "✓ 后端在线"
```

- [ ] **前端 rebuild + deploy**:

```bash
docker run --rm -v /root/lingjing-ai/admin:/app -w /app node:20-alpine \
  sh -c "npm install --silent 2>/dev/null && npm run build"
rm -rf /var/www/api-platform/admin/*
cp -r /root/lingjing-ai/admin/dist/* /var/www/api-platform/admin/
```

---

### Task D2: Smoke test（按顺序跑）

- [ ] **D2.1 管理员体验未变**

用 admin 账号登入 `admin.aitoken.homes`：
- 看到全部 3 个分组 + "财务统计" + 等等（看不到"我的代理"分组）
- 随便点 5 个页面（Overview / Channels / Users / Logs / Finance）都正常
- 侧栏顶部显示 "ADMIN CONSOLE"

- [ ] **D2.2 把测试用户改成代理**

admin 登入下，进 `/users`，挑一个有下线的测试用户：
- 编辑 → "配置" tab
- 角色：普通用户 → 代理
- 专属返利比例：填 30（即 30%）
- 保存 → 应该弹"角色变更确认"对话框 → 确认

确认后用户在列表里 role badge 显示 "代理"（蓝色）。

- [ ] **D2.3 代理登入**

退出 admin，用刚刚那个测试用户登入 `admin.aitoken.homes`：
- **登录成功后自动跳 `/agent/overview`**
- 看到 4 张 StatCard（团队人数 / 本月营收 / 我的佣金 / 团队本月调用）
- 侧栏只有一个分组"我的代理"，下面 5 项：团队概览 / 团队成员 / 团队订单 / 团队日志 / 我的佣金
- 侧栏顶部显示 "AGENT CONSOLE"

- [ ] **D2.4 代理浏览团队数据**

依次点 5 项菜单：
- **团队成员**：看到自己邀请的下线列表（如果没有就是 EmptyCard "暂无团队成员"）
- **团队订单**：团队成员的订单
- **团队日志**：团队成员的 API 调用日志
- **我的佣金**：自己作为邀请人收到的佣金 + 3 张 stat 卡

期望：**全部数据只显示自己 team 的，看不到任何其他用户/订单/日志**。

- [ ] **D2.5 代理尝试访问 admin URL**

地址栏手动输 `admin.aitoken.homes/users` →
- 短暂"loading"后跳回 `/agent/overview`（RoleGuard 起作用）

地址栏输 `/channels` / `/orders` / `/finance` / `/settings` 等任何 admin 页 → 同样跳回。

- [ ] **D2.6 数据隔离审计（重要）**

代理账号已登入；打开浏览器 DevTools Network 面板，再输入：
- `agent/team-members` → 200，data 数组里所有 user 的 inviter_id 都等于代理 id（虽然 API 不返这个字段，但可对照 MySQL 验证）
- 手动改 URL 加无效参数 `?inviter_id=999` → 服务端忽略，仍然只返自己 team（handler 永远用 session id 不读 query）

```bash
# 服务器端验证
docker exec one-api-mysql mysql -uroot -pQS75P98SvYaYIy4zkBhmHA== oneapi \
  -e "SELECT id, username, role, inviter_id, affiliate_rate FROM users WHERE role=5;"
```

- [ ] **D2.7 团队成员充值 → 佣金触发**

可选验证：找一个代理的下线，模拟充值 ¥30（admin 在订单页手动补单）。完成后代理"我的佣金"页应该 +1 行（金额 = 30 × affiliate_rate）。

- [ ] **D2.8 收尾**

把测试用户改回普通用户（清掉测试 role），或保留为代理灰度内测。

---

# 完成 — 整体校验

- [ ] 8 个 commits（A1, A2, B1, B2, B3, B4, C, deploy steps）在 origin/main
- [ ] `go build ./...` clean
- [ ] `npm run build` clean
- [ ] 生产 admin 跑通 D2.1~D2.6
- [ ] 现有 17 admin 页面 + 财务页面全部未受影响

---

# 工期复核

| Phase | 任务数 | 工期 |
|---|---|---|
| A1 | 1 commit (role + middleware) | 0.25d |
| A2 | 1 commit (5 handlers + routes) | 0.5d |
| B1 | 1 commit (api + RoleGuard + Login + AdminLayout + App.tsx) | 0.75d |
| B2 | 1 commit (AgentOverview) | 0.25d |
| B3 | 1 commit (3 list pages) | 0.5d |
| B4 | 1 commit (AgentCommissions) | 0.25d |
| C  | 1 commit (Users.tsx ROLES) | 0.1d |
| D  | 部署 + smoke test | 0.25d |
| **总计** | **7 code commits** | **~3 天** |

---

# 注意事项

1. **commit 颗粒度**：每个 commit 独立 deploy / revert。**不要打包**。
2. **commit message** 末尾必带 `Rollback: git revert <this-sha>`。
3. **数据隔离审计**：每次添加 agent endpoint 时，**先调 `scopeUserIDs(c)`**，再写 SQL。Code review 要专门看这一点。
4. **后端先于前端部署不可行 vs 可行**：A1+A2 部署后，前端老代码继续工作（agent endpoint 没人调用）。**所以可以先部署后端，再部署前端**，降低部署风险。
5. **YAGNI**：本计划不实现 多层代理 / 代理之间互相隔离的更复杂权限 / 代理招募流程 / 代理 KPI 排行 / 自动提现等。等用 1 个月再说。
6. **数据库**：**零 schema 变更**。`affiliate_rate` 是 Day 4.3 已加的列。
