# 代理(Agent) 角色 设计文档

**Date:** 2026-05-20
**Goal:** 让管理员把某用户标记为"代理"，代理可以登入 admin 后台，**只读**地看自己团队（直接下线）的数据 + 自己的佣金；admin 可以为代理设专属佣金率。
**Hard constraint:** 零生产破坏 — 全部纯新增（新角色档 / 新中间件 / 新 endpoint / 新页面）。已有 endpoint / 表 / 逻辑零修改。
**Spec 前置:** 已在 brainstorming 中决策完毕：

| Q | 答 |
|---|---|
| Q1 层级深度 | **单层**（代理只见 `inviter_id = self.id` 的直接下线） |
| Q2 开通方式 | **手动**（超管在用户管理页把 role 1→5） |
| Q3 可见数据 | 团队成员使用数据 + 团队营收 + 我应得佣金 |
| 佣金率字段 | **复用** 已有 `users.affiliate_rate`，**不新增字段** |

---

## 1. 角色定义

`backend/model/user.go:21-23` 三档加一档：

```go
const (
    RoleGuestUser  = 0  // (未使用，预留)
    RoleCommonUser = 1
    RoleAgentUser  = 5  // ← 新增
    RoleAdminUser  = 10
    RoleRootUser   = 100
)
```

**为什么挑 5：**
- 严格大于 1，严格小于 10，所有现有 `role >= 10` 的 admin 守卫**仍然有效**（代理见不到全局功能）
- 留 2/3/4/6/7/8/9 共 7 个空位给未来（如"高级代理 = 6"、"团队 leader = 8"）

## 2. 前端守卫 — 两档阈值

`admin/src/api/index.ts`:
```ts
// 准入：能不能进 admin 网站 (Login / AdminLayout)
export const ADMIN_MIN_ROLE = 5    // 改：从 10 → 5（放开代理登入）

// 页面级：admin 专属页（用户/渠道/系统设置等）的可见门槛
export const ADMIN_PAGE_MIN_ROLE = 10  // 新增：代理 (5) 不够，admin (10+) 可见
```

新建 `admin/src/components/RoleGuard.tsx`：

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authApi } from '../api'

interface Props { min: number; children: ReactNode; fallback?: string }

export function RoleGuard({ min, children, fallback = '/agent/overview' }: Props) {
  const [role, setRole] = useState<number | null>(null)
  useEffect(() => {
    authApi.getSelf().then(r => setRole(r.data?.data?.role ?? 0)).catch(() => setRole(0))
  }, [])
  if (role === null) return null
  if (role < min) return <Navigate to={fallback} replace />
  return <>{children}</>
}
```

`App.tsx` 中**所有 admin-only 路由**包一层：

```tsx
<Route path="users" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><UsersPage /></RoleGuard>} />
<Route path="channels" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ChannelsPage /></RoleGuard>} />
// ... 其他所有 admin 页都包
<Route path="agent/overview" element={<AgentOverviewPage />} />  // 代理页面不包（5+ 即可）
```

这样代理在地址栏手动输 `/users` → 守卫触发 → 跳 `/agent/overview`。**防止靠 URL 绕过侧栏菜单裁剪**。

## 3. 后端中间件 — 新增 AgentAuth

`backend/middleware/auth.go` 末尾追加：

```go
// AgentAuth 准入门槛 role >= 5 (代理 + admin + root)。
// 注意：仅校验"能进入此路由"，不做数据隔离 —— scope filter 由 handler 自己根据
// session 里的 role / id 决定（admin 见全局，agent 见自己 team）。
func AgentAuth() func(c *gin.Context) {
    return func(c *gin.Context) {
        authHelper(c, model.RoleAgentUser)
    }
}
```

不替换 `AdminAuth`，两个并存。

## 4. 数据 scope filter — 风险点 #1

**核心原则**：每个新 endpoint 在 controller 内部根据 `c.GetInt("role")` 决定 SQL where：
- `role >= 10` → admin / root → 不加 scope filter（看全部）
- `role == 5` → agent → 加 `WHERE inviter_id = self.id`（仅团队）

抽出**单一 helper**避免漏改：

```go
// scopeUsers returns the list of user IDs the caller can see.
// Admin/root: nil (no filter). Agent: list of users where inviter_id = self.id.
func scopeUserIDs(c *gin.Context) ([]int, bool) {
    if c.GetInt("role") >= model.RoleAdminUser {
        return nil, false // no filter
    }
    selfId := c.GetInt("id")
    var ids []int
    model.DB.Model(&model.User{}).
        Where("inviter_id = ?", selfId).
        Pluck("id", &ids)
    return ids, true // filter applies
}
```

**所有 agent-visible endpoint 必须先调这个 helper**，未调用 = 数据泄漏 bug。

## 5. 后端新增 endpoint

新文件：`backend/controller/lingjing_agent.go`

路由：`/api/admin/lingjing/agent/*` (用 `AgentAuth()` 守卫)

| Method | Path | 含义 |
|---|---|---|
| GET | `/agent/overview` | 团队概览：用户数 / 团队营收 / 我的佣金 / 本月调用 |
| GET | `/agent/team-members?page=N&page_size=15&keyword=` | 团队成员列表（只读，仅 inviter_id = self） |
| GET | `/agent/team-orders?page=N&page_size=15&status=` | 团队订单（订单 user 的 inviter_id = self） |
| GET | `/agent/team-logs?page=N&page_size=15&username=&model_name=` | 团队调用日志 |
| GET | `/agent/my-commissions?page=N&page_size=15&status=` | 我的佣金（commissions where user_id = self） |

**返回结构与对应 admin 端口一致** —— 前端复用现有 TS 类型，只需换 API 地址。

### 5.1 SQL 口径（关键）

```sql
-- overview
SELECT COUNT(*) FROM users WHERE inviter_id = ? ;                    -- 团队人数
SELECT COALESCE(SUM(o.amount),0) FROM orders o
  JOIN users u ON o.user_id = u.id
  WHERE u.inviter_id = ? AND o.status = 1 AND o.paid_at BETWEEN ? AND ?;  -- 团队营收
SELECT COALESCE(SUM(amount),0) FROM commissions
  WHERE user_id = ? AND status IN (0,1);                             -- 我的佣金累计
SELECT COUNT(*) FROM logs l
  JOIN users u ON l.user_id = u.id
  WHERE u.inviter_id = ? AND l.created_at BETWEEN ? AND ?;           -- 团队本月调用

-- team-members
SELECT ... FROM users WHERE inviter_id = ? LIMIT 15 OFFSET ?;

-- team-orders (订单的下单人是我的下线)
SELECT o.* FROM orders o
  JOIN users u ON o.user_id = u.id
  WHERE u.inviter_id = ? LIMIT 15 OFFSET ?;

-- team-logs (调用人是我的下线)
SELECT l.* FROM logs l
  JOIN users u ON l.user_id = u.id
  WHERE u.inviter_id = ? LIMIT 15 OFFSET ?;

-- my-commissions
SELECT * FROM commissions WHERE user_id = ? LIMIT 15 OFFSET ?;
```

注意：所有 JOIN 都走 `users.inviter_id` index（user 表 line 53 已有 index），性能 OK。

## 6. 前端 — 代理 5 个页面

### 6.1 路由

```
/agent/overview        →  AgentOverview.tsx
/agent/team-members    →  AgentTeamMembers.tsx
/agent/team-orders     →  AgentTeamOrders.tsx
/agent/team-logs       →  AgentTeamLogs.tsx
/agent/my-commissions  →  AgentCommissions.tsx
```

复用 Day 1-7 组件（PageHeader / StatCard / FilterTabs / SearchInput / EmptyCard / Pagination / recharts）。

### 6.2 侧栏菜单 role-based 裁剪

`AdminLayout.tsx` — `useEffect` 拿到 `role` 后存到 state，渲染时用 role 决定 navSections：

```tsx
const isAgent = role === 5
const isAdmin = role >= 10

const visibleSections = navSections
  .map(s => ({ ...s, items: s.items.filter(item => {
    if (isAdmin) return item.adminOnly !== false      // admin 看全部
    if (isAgent) return item.agentVisible === true    // agent 只看带这个 flag 的
    return false
  }) }))
  .filter(s => s.items.length > 0)
```

`navSections` 数组每项加 `agentVisible?: boolean` 字段。

代理可见的菜单（仅 5 项 + 我的账户）：
```
团队
  - 团队概览          /agent/overview
  - 团队成员          /agent/team-members
  - 团队订单          /agent/team-orders
  - 团队调用日志       /agent/team-logs
账户
  - 我的佣金          /agent/my-commissions
```

代理**看不到**：渠道管理 / 用户管理 / 模型 / 系统设置 / 支付 / 公告 / 财务统计 / 兑换码 / 提现审核 等全部 admin 功能。

### 6.3 OverviewPage 路由分流

普通 `/overview`（admin 用的全局概览）和 `/agent/overview`（代理的团队概览）共存。代理登入跳 `/agent/overview` 而不是 `/overview`：

```tsx
// Login.tsx 登录成功后
const home = role === 5 ? '/agent/overview' : '/overview'
navigate(home)
```

`/` 根路由也同步：

```tsx
<Route index element={<RoleHome />} />

// RoleHome: 拿 role → Navigate to /agent/overview or /overview
```

## 7. Users 页面改造（admin 端）

`admin/src/pages/Users.tsx` 的 `ROLES` 数组加一项：

```tsx
const ROLES = [
  { value: 1,   label: '普通用户' },
  { value: 5,   label: '代理' },     // ← 新增
  { value: 10,  label: '管理员' },
  { value: 100, label: '超级管理员' },
]
```

`getRoleLabel` 也加分支：
```tsx
if (role === 5) return { label: '代理', cls: 'badge-blue' }  // 用 info 蓝色 badge
```

表格行的角色 badge 就自动显示。编辑 modal 的"专属返利比例"字段已存在，**直接服用**给代理设佣金率（admin 在 modal "配置" tab 里改）。

**辅助 UI**（可选，提升 admin 体验）：在 Users 页加一个 FilterTab "代理" 快速筛选 role=5 的用户。

## 8. 生产安全保证

| 项 | 保证 |
|---|---|
| 数据库 | **不加字段、不改表结构**。零 migration。 |
| 后端 | 1 个新文件 (`lingjing_agent.go`) + 5 个新路由 + 1 个新中间件 + `RoleAgentUser` 常量。已有 controller/middleware/router 不动。 |
| 前端 | 5 个新页面 + AdminLayout 加 role-based 裁剪 + Users.tsx ROLES 加 1 项 + Login.tsx 加跳转分流。其他 19 个页面零改动。 |
| 现有 admin | 老 admin 用户 role >= 10，所有现有功能不受影响（守卫继续 >= 10）。 |
| 代理升级路径 | 超管把 role 1→5 立即生效；再 5→10 提升为 admin 也工作。 |
| 数据隔离审计 | `scopeUserIDs` helper 是单一过滤点，code review 时只需检查"每个 agent endpoint 是否调用了它"。 |

## 9. 范围外（YAGNI）

- ❌ **多层代理**（A→B→C，A 看 C）—— 单层够用，多层要加 path / CTE
- ❌ **代理改用户**（代理只读，不能编辑用户/调额度）—— 留给 admin
- ❌ **代理发兑换码 / 给团队成员手动充值** —— 用户自己充
- ❌ **代理之间互相看对方团队** —— 严格隔离
- ❌ **代理的子代理招募流程**（前台"申请成为代理"按钮）—— 现在只有手动开通
- ❌ **代理推广素材 / 邀请链接生成器** —— 用现有的 referral code 系统
- ❌ **代理 KPI 排行榜** —— V2 可加
- ❌ **代理收入提现到支付宝** —— 跟 admin 提现审核走同一套，不需要单独
- ❌ **代理可以发布团队公告** —— 出问题概率高，不做

## 10. 工期 + commit 切分

3 天，约 7-8 个独立 commit:

| Phase | 任务 | commits | 时间 |
|---|---|---|---|
| A1 | RoleAgentUser 常量 + AgentAuth 中间件 + scopeUserIDs helper | 1 | 0.5d |
| A2 | lingjing_agent.go 5 个 handler + 5 个路由 | 1 | 0.5d |
| B1 | agentApi + 路由 + Login/AdminLayout role 分流 + 菜单裁剪 | 1 | 0.5d |
| B2 | AgentOverview.tsx (4 卡片 + 团队 KPI) | 1 | 0.25d |
| B3 | AgentTeamMembers.tsx / TeamOrders.tsx / TeamLogs.tsx (3 个列表页) | 2 | 0.5d |
| B4 | AgentCommissions.tsx | 1 | 0.25d |
| C | Users.tsx ROLES 加"代理" + getRoleLabel 分支 | 1 | 0.25d |
| D | 部署 + smoke test | 操作 | 0.25d |

## 11. 测试要点

1. **超管把用户 A (role=1) 改成代理 (role=5)，A 再登 admin** → 进入 `/agent/overview` 而不是 `/overview`
2. **代理只看到 5 项菜单**，渠道/用户/系统设置等全部不在侧栏
3. **代理在浏览器手动输 `/users` 或 `/channels`** → `<RoleGuard min={10}>` 触发 → `<Navigate>` 到 `/agent/overview`。不会进入 admin 页面（即便 backend 还会 403 兜底）。
4. **代理看到的团队成员数据** = `users WHERE inviter_id = agent.id`，零别家用户
5. **代理看到的团队订单** = orders 中 user 的 inviter = agent
6. **代理看到的佣金** = `commissions WHERE user_id = agent.id`
7. **代理改自己的 affiliate_rate** —— 不允许（只读身份，配置由 admin 改）
8. **管理员登入后** 一切正常，未受影响（role >= 10 路径不变）
9. **数据隔离审计**：用 curl 模拟代理 token 直接访问 `/api/admin/lingjing/agent/team-members?inviter_id=X` 是否能伪造（应该不行，handler 永远用 session 的 self.id，不读 query）

## 12. 灰度策略

可灰度（YAGNI 也可以一把上）：先只给 1 个内测代理（你自己手动 role=5 一个测试用户）跑一周，再批量开。
