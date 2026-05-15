# 灵镜 AI Admin UI 一致性优化设计

| 项 | 值 |
|---|---|
| 日期 | 2026-05-15 |
| 状态 | Draft — 待 user 审阅 |
| 作者 | 协作（人 + Claude） |
| 关联记忆 | [[feedback_ui_forest_style]] · [[feedback_react_number_input_string_state]] |
| 关联 commit | 当前 main HEAD `e8bc4bb` |

---

## 0. 背景 / 目标

灵镜 admin 后台（`admin/src/pages/` 17 页）经过半年迭代，出现了显著的视觉/交互不一致：

- 4-5 种按钮样式（class vs inline 混用）
- 5 种 modal 宽度（480 / 520 / 560 / 620 / 无）
- 4 种搜索 UX（实时 / 按钮 / 回车 / Tab）
- 硬编码颜色 8+ 处逃逸 CSS vars
- 4 个跨页 pattern 缺乏共用组件（stat-card / filter / empty-state / confirm-dialog）
- 11 列表格在笔记本上需要横向滚动（Channels / ModelPrices / Users）

**目标**：建立设计令牌 + 组件库，**零生产破坏地**让 17 页全部对齐统一规范。

**非目标**：

- 不重新选型（继续用自研 CSS vars，不切 antd/Tailwind/shadcn）
- 不引入暗色模式、不做表格虚拟滚动、不加键盘快捷键
- 不破坏现有任何业务行为（API 调用 / 数据流 / 用户权限完全不变）
- 不动 frontend（用户前台）/ backend — 仅 admin 前端

---

## 1. 决策点汇总（已与 user 确认）

| # | 决策项 | 结论 |
|---|---|---|
| 1 | 优化范围 | 17 页全部适配，路线 **B**（设计令牌 + 组件库 + 逐页迁移）|
| 2 | 风格基调 | 沿用现有森林浅主题，禁蓝紫，无 AI emoji（[[feedback_ui_forest_style]]）|
| 3 | 信息密度 | 减少痛点页面列数（11 → 6-7），移到详情抽屉 / 侧栏 |
| 4 | 兼容策略 | Strangler 模式：纯叠加，老 class 留着，新组件按需引用 |
| 5 | 生产安全 | 每页一个 commit，独立部署 + 独立 revert，**绝不批量重构** |
| 6 | 工期 | 约 7 工作日，任何 Day 末可暂停 |
| 7 | 验收方式 | 用户在生产浏览器手测 happy path，每页 5 分钟 checklist |

---

## 2. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│ Day 1 ─ 基础设施（commits 1-7，零页面影响）                    │
│                                                                │
│   commit 1: admin/src/index.css 追加                            │
│     ├─ 新增 CSS 变量: --warning / --info / --accent-light       │
│     │                  --danger-bg / --hover-bg 等              │
│     └─ 新增 utility class: .badge-yellow / .badge-purple /      │
│                            .stat-grid / .filter-button /         │
│                            .alert-* / .empty-card / .form-hint / │
│                            .modal-sm/md/lg/xl                    │
│                                                                  │
│   commits 2-7: 6 个新组件文件                                    │
│     ├─ admin/src/components/StatCard.tsx                         │
│     ├─ admin/src/components/SearchInput.tsx                      │
│     ├─ admin/src/components/FilterTabs.tsx                       │
│     ├─ admin/src/components/ConfirmDialog.tsx                    │
│     ├─ admin/src/components/EmptyCard.tsx                        │
│     └─ admin/src/components/PageHeader.tsx                       │
│                                                                  │
│   Day 3 顺手交付: <Drawer> (Channels 详情抽屉)                    │
│   Day 4 顺手交付: <FilterSidebar> (Users 左侧筛选)                │
│                                                                  │
│ Day 2-7 ─ 逐页迁移（每页一个 commit）                            │
│                                                                  │
│   Day 2: Overview        ← 简单 + 已是模板，先验证组件好用       │
│   Day 3: Channels        ← 最痛苦最复杂                          │
│   Day 4: ModelPrices + Users                                     │
│   Day 5-7: 剩余 11 页                                             │
└──────────────────────────────────────────────────────────────┘
```

每个箭头是一个独立 git commit，可独立 deploy / revert。

---

## 3. 设计令牌（Section 1）

### 3.1 新增 CSS 变量

在 `admin/src/index.css` 现有 `:root { ... }` 末尾**追加**（不删除已有）：

```css
:root {
  /* ===== 现有变量保留 ===== */

  /* ===== 新增 ===== */
  --warning: #F59E0B;
  --warning-bg: #FEF3C7;
  --warning-text: #92400E;
  --info: #3B82F6;
  --info-bg: #DBEAFE;
  --info-text: #1E40AF;
  --accent-light: #DCFCE7;
  --danger-bg: #FEE2E2;
  --danger-text: #DC2626;
  --surface-2: #F8FAFC;
  --hover-bg: #F1F5F9;
  --z-modal-backdrop: 1000;
  --z-modal: 1001;
  --z-toast: 2000;
}
```

### 3.2 新增 utility class

```css
/* Badge 补全 */
.badge-yellow  { background: var(--warning-bg); color: var(--warning-text); }
.badge-purple  { background: #F3E8FF;           color: #7E22CE; }
.badge-orange  { background: #FED7AA;           color: #C2410C; }
.badge-info    { background: var(--info-bg);    color: var(--info-text); }

/* Stat grid */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 20px; }
@media (max-width: 768px) { .stat-grid { grid-template-columns: 1fr; } }

/* Filter pill button */
.filter-button { padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.15s; }
.filter-button:hover { background: var(--hover-bg); }
.filter-button.active { background: var(--accent); color: white; border-color: var(--accent); }

/* Alert banner */
.alert { padding: 12px 16px; border-radius: var(--radius-sm); border-left: 3px solid; margin-bottom: 16px; font-size: 13px; }
.alert-success { border-color: var(--accent); background: var(--accent-light); color: var(--accent); }
.alert-warning { border-color: var(--warning); background: var(--warning-bg); color: var(--warning-text); }
.alert-info    { border-color: var(--info);    background: var(--info-bg);    color: var(--info-text); }
.alert-danger  { border-color: var(--danger);  background: var(--danger-bg);  color: var(--danger-text); }

/* Empty card */
.empty-card { display: flex; flex-direction: column; align-items: center; padding: 48px 24px; color: var(--text-secondary); font-size: 13px; text-align: center; }
.empty-card svg { margin-bottom: 12px; opacity: 0.4; }

/* Form hint */
.form-hint { font-size: 11px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4; }

/* Modal sizes */
.modal-sm  { max-width: 480px; }
.modal-md  { max-width: 640px; }
.modal-lg  { max-width: 820px; }
.modal-xl  { max-width: 1080px; }
.modal-content { max-height: 85vh; overflow-y: auto; }
```

### 3.3 兼容性保证

- 所有新变量 + 新 class 均为**纯追加**，无任何删除/重命名
- 现有 `.btn` `.card` `.modal-overlay` `.badge-green` 等全部继续可用
- 新页面可任意引用新 class；老页面看起来与今日完全相同
- **commit 1 部署后效果**：用户看不到任何视觉变化（因为新 class 没人引用）

---

## 4. 组件库（Section 2）

6 个 Day-1 组件 + 2 个按需组件（Day 3/4），每个 < 100 行 TSX。

### 4.1 `<StatCard>` — 替换 8+ 处 ad-hoc stat 块

```tsx
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  color?: 'success' | 'warning' | 'danger' | 'info' | 'accent';
  hint?: string;
}
```

文件：`admin/src/components/StatCard.tsx`
样式：用 `.card` + 新 `.stat-grid` 父容器，icon 用 `var(--accent-light)` 等背景色块

### 4.2 `<SearchInput>` — 统一 4 种搜索 UX

```tsx
interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  debounce?: number;     // 默认 400ms 自动触发 onSubmit
  clearable?: boolean;   // 默认 true，显示 X 按钮
}
```

行为：debounce 自动触发、Enter 立即触发、X 清除并 onSubmit('')

### 4.3 `<FilterTabs>` — 替换 pill button 筛选

```tsx
interface FilterTabsProps {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string; count?: number }[];
}
```

用 `.filter-button` class，含可选 count badge

### 4.4 `<ConfirmDialog>` — 替换 4+ 处 `window.confirm()`

```tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}
```

用现有 `.modal-overlay` + 新 `.modal-sm`，danger 时按钮显红

### 4.5 `<EmptyCard>` — 统一 4 处空状态

```tsx
interface EmptyCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;     // optional button
}
```

用新 `.empty-card` class

### 4.6 `<PageHeader>` — 替换 8 种页头写法

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}
```

用现有 `.page-header` `.page-title` `.page-desc` class

---

## 5. 迁移路线（Section 3）

### 5.1 顺序

| Day | Page | 原因 |
|---|---|---|
| 1 | 基础设施 | Tokens + 5 组件，零页面影响 |
| 2 | **Overview** | 简单 + 已是好模板，验证组件好用 |
| 3 | **Channels** | 最痛苦最复杂，pilot 真实痛点 |
| 4 | **ModelPrices** + **Users** | 剩余两个 11 列表格 |
| 5 | Logs + Orders + Tasks | 表格 + filter |
| 6 | Withdrawals + ModelManage + ModelRatios | 表格 + modal |
| 7 | Redemptions + Plans + Settings + PaymentSettings + Notices + Referrals + Login | 简单页面 |

### 5.2 三个最痛页面的具体改造

#### Channels（10 列 → 7 列）

- 列：`id | name+type-badge | status-clear | priority | balance | actions(3 icons + 详情) `
- 把 priority / weight / mapping / config 移到**详情抽屉**（点 row 右侧展开）
- 8 个操作 icon → 3 个核心 + 1 个"更多"下拉
- 头部用 `<StatCard>` 替换

#### ModelPrices（11 列 → 6 列 + 搜索）

- 列：`logo+name+desc(2-line) | provider | price-inline | visible | actions`
- 顶部加 `<SearchInput>` 按 name/provider/tags 过滤
- description 改两行而不是 ellipsis
- 价格 input/output 用 `<small>` 内嵌一格
- 图片模型显示 `$X.XXXX / 张`，chat 显 `$X.XX / M tokens`（已在前次 commit 9c47bd8 实现）

#### Users（11 列 → 6 列 + 左侧筛选）

- 列：`username+role | display+email | group-badge | quota | status | actions`
- 左侧 200px 筛选侧栏：role / group / status / 搜索
- 编辑 modal 分 2 tabs：「账号」(username/email/password) + 「配置」(quota/role/group/rate)
- quota 修改时显示 delta + `<ConfirmDialog>` 确认
- admin/superadmin role 用红色徽章警示

### 5.3 安全保证（每页迁移硬性要求）

| 检查 | 要求 |
|---|---|
| 单一 commit | 一个 commit = 一个页面，禁止打包 |
| 行为不变 | 所有 API 调用、数据流、用户权限和旧版一致 |
| Build 通过 | `npm run build` 0 error, 0 new warning |
| Smoke 手测 | 加载 / 搜索 / 编辑 / 保存 / 删除全部跑一次 |
| 回滚路径 | commit message 末尾写 `Rollback: git revert <sha>` |
| CSS 隔离 | 新 class 与老 inline style 同页面共存不冲突 |
| 部署单步 | 仅 admin rebuild（除非该页需 backend API 改）|

### 5.4 每页验收 checklist

部署后 5 分钟在生产浏览器跑：

- [ ] 加载正常，无白屏 / 控制台 error
- [ ] 数据展示与旧版对齐（用真实生产数据）
- [ ] 主要操作（新建 / 编辑 / 删除）跑一遍
- [ ] 筛选 / 搜索 / 翻页都能用
- [ ] 移动尺寸（DevTools iPhone）至少不溢出
- [ ] 风格一致（森林绿主题，无蓝紫，无 AI emoji）

### 5.5 失败回滚预案

```bash
# 单页出问题（最常见）
ssh root@8.218.203.189
cd /root/lingjing-ai
git log --oneline -5
git revert <bad-commit-sha> --no-edit
git push origin main
# 服务器走 admin rebuild → 30 秒内恢复

# 整套大失败（极端）
git reset --hard <pre-day1-sha>
git push origin main --force-with-lease
# 慎用：仅本人用 admin 时可以
```

由于每 commit 独立，**单页 revert 不影响其他 16 页**。

---

## 6. 工期 + 验收

| 阶段 | 工期 | 输出 |
|---|---|---|
| Day 1 | 1 工作日 | Tokens + 5 组件落 main |
| Day 2 | 0.5 工作日 | Overview 迁移完 + 验收通过 |
| Day 3 | 1 工作日 | Channels 迁移 + 抽屉拆解 |
| Day 4 | 1 工作日 | ModelPrices + Users（含侧栏）|
| Day 5-7 | 3.5 工作日 | 剩余 11 页 |
| **总计** | **7 工作日** | 17 页全部用新组件 + 设计令牌 |

**完成定义**：17 页都不再有 inline 硬编码颜色、stat 块、`window.confirm()`、自制 filter button。

**Phase 可暂停**：任何 Day 末都可以"够了先这样"，剩余页面留下次。

---

## 7. 风险 / 未决问题

| # | 风险 | 缓解 |
|---|---|---|
| 1 | Pilot Overview 通过不代表 Channels 也通过 | Day 3 Channels 留充足时间 + 用户充分手测，发现问题先 revert 再说 |
| 2 | 抽屉组件（Channels 详情）原项目没有 | Day 3 一并提供 `<Drawer>` 组件（简单 fixed positioning） |
| 3 | 左侧筛选侧栏（Users）也是新 pattern | Day 4 一并提供 `<FilterSidebar>` 组件 |
| 4 | 一致性收益难量化 | 完成定义量化为"硬编码色 = 0, inline stat 块 = 0, window.confirm = 0" |
| 5 | 中途换需求 | 单 Day 工作单元独立，重新规划成本低 |

---

## 8. 不在本次范围

- 暗色模式
- 表格虚拟滚动 / 列拖动排序
- 键盘快捷键（Cmd+K 等）
- Toast 自定义样式（继续用 react-hot-toast 默认）
- 拖拽 / 复杂动画
- i18n 国际化
- 用户前台（aitoken.homes）改造 — 本设计仅 admin
- 后端 / 数据库改造

---

## 9. 决策审计 trail

| 日期 | 决策 | 来源 |
|---|---|---|
| 2026-05-15 | 路线 B（17 页全适配，设计令牌 + 组件库） | user 选择 |
| 2026-05-15 | 严格生产安全：单 commit / 单页 / 单 revert | user 约束 |
| 2026-05-15 | Strangler 模式，纯叠加不删旧 | 推导自约束 |
| 2026-05-15 | Pilot 顺序 Overview → Channels | user 通过 |
| 2026-05-15 | 三大痛苦页面详细改造方向 | user 通过 |
