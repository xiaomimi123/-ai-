# Admin UI 一致性优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让灵镜 admin 17 页全部使用统一的设计令牌 + 6 个共用组件，移除散落的 inline 样式 / 硬编码颜色 / `window.confirm()`。

**Architecture:** Strangler 模式 — Day 1 添加新 tokens / 组件（**纯叠加，不动现有页面**），Day 2-7 按页迁移（**每页一个 commit**，独立 deploy + revert）。

**Tech Stack:** React 19 + TypeScript + Vite + 自研 CSS vars + utility classes (.btn .card .modal-overlay 等)，无 antd/semi/Tailwind。lucide-react 图标，react-hot-toast 通知。

**Spec:** `docs/superpowers/specs/2026-05-15-admin-ui-refresh-design.md`

---

## 全局约定

- **生产零破坏**：每个 commit 独立可 deploy 也可 revert。绝不把多页打包一个 commit。
- **行为不变**：所有 API 调用、props、数据流跟旧版完全一致，**只换 UI 表现层**。
- **commit message 格式**：`feat(admin-ui): <page or component> - <change>` 或 `style(admin-ui): <description>`。**结尾加** `Rollback: git revert <will-fill-after-commit>`（先空着，commit 完看 sha 再 amend 也行，能省则省）。
- **part-of branch**：直接打到 main。每页一个 commit。
- **每页迁移完即可部署**：
  ```bash
  # 在服务器跑
  cd /root/lingjing-ai && git pull origin main
  docker run --rm -v /root/lingjing-ai/admin:/app -w /app node:20-alpine \
    sh -c "npm install --silent 2>/dev/null && npm run build"
  rm -rf /var/www/api-platform/admin/*
  cp -r /root/lingjing-ai/admin/dist/* /var/www/api-platform/admin/
  ```
- **回滚命令**（任何单 commit 出问题）：
  ```bash
  ssh root@8.218.203.189
  cd /root/lingjing-ai
  git revert <commit-sha> --no-edit
  git push origin main
  # 重新走上面 admin rebuild 流程
  ```

---

## 目录 / 文件结构总览（Day 1 完成后建立）

```
admin/
├── src/
│   ├── index.css                    [+]  追加 tokens + classes
│   ├── components/
│   │   ├── StatCard.tsx             [N]  新增
│   │   ├── SearchInput.tsx          [N]  新增
│   │   ├── FilterTabs.tsx           [N]  新增
│   │   ├── ConfirmDialog.tsx        [N]  新增
│   │   ├── EmptyCard.tsx            [N]  新增
│   │   ├── PageHeader.tsx           [N]  新增
│   │   ├── Drawer.tsx               [N]  Day 3 顺手交付
│   │   └── FilterSidebar.tsx        [N]  Day 4 顺手交付
│   └── pages/
│       ├── Overview.tsx             [+]  Day 2 迁移
│       ├── Channels.tsx             [+]  Day 3 迁移
│       ├── ModelPrices.tsx          [+]  Day 4 迁移
│       ├── Users.tsx                [+]  Day 4 迁移
│       ├── Logs.tsx                 [+]  Day 5
│       ├── Orders.tsx               [+]  Day 5
│       ├── Tasks/index.tsx          [+]  Day 5
│       ├── Withdrawals.tsx          [+]  Day 6
│       ├── ModelManage.tsx          [+]  Day 6
│       ├── ModelRatios.tsx          [+]  Day 6
│       ├── Redemptions.tsx          [+]  Day 7
│       ├── Plans.tsx                [+]  Day 7
│       ├── Settings.tsx             [+]  Day 7
│       ├── PaymentSettings.tsx      [+]  Day 7
│       ├── Notices.tsx              [+]  Day 7
│       ├── Referrals.tsx            [+]  Day 7
│       └── Login.tsx                [+]  Day 7
```

`[N]` = 新建文件，`[+]` = 修改既有文件。

---

# Day 1 — 基础设施（commits 1-7，零页面影响）

**前置**: `~/lingjing-ai/` 工作树干净，main 在 `227ed74` 或更新。

**验收**: 
- `npm run build` clean
- **浏览器打开 admin 任何页面，看起来跟之前完全一样**（因为新 class 没人引用）
- 7 个 commit 全部 push 到 origin/main

**回滚**: `git revert <commit-sha>` 任一即可，每个 commit 独立。

---

### Task 1.1: 追加 CSS 设计令牌 + utility classes

**Files:**
- Modify: `admin/src/index.css`（末尾追加，不删任何东西）

- [ ] **Step 1: 查看现有 :root 块结构**

Run: `grep -n ":root\|--accent\|--primary\|--surface\|--border\|--text" admin/src/index.css | head -20`

确认现有变量命名风格，决定新变量放哪里。

- [ ] **Step 2: 在 `:root { ... }` 块末尾追加新 CSS 变量**

打开 `admin/src/index.css`，找到现有 `:root` 块的最后一个变量定义，在它后面（仍在 `}` 内）追加：

```css
  /* ===== Admin UI Refresh 2026-05-15: 新增令牌 ===== */
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
```

- [ ] **Step 3: 在 index.css 文件末尾追加 utility class**

```css

/* ===== Admin UI Refresh 2026-05-15: 新增 utility classes ===== */

.badge-yellow  { background: var(--warning-bg); color: var(--warning-text); }
.badge-purple  { background: #F3E8FF;           color: #7E22CE; }
.badge-orange  { background: #FED7AA;           color: #C2410C; }
.badge-info    { background: var(--info-bg);    color: var(--info-text); }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
@media (max-width: 768px) {
  .stat-grid { grid-template-columns: 1fr; }
}

.filter-button {
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.filter-button:hover { background: var(--hover-bg); }
.filter-button.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.alert {
  padding: 12px 16px;
  border-radius: var(--radius-sm, 6px);
  border-left: 3px solid;
  margin-bottom: 16px;
  font-size: 13px;
}
.alert-success { border-color: var(--accent); background: var(--accent-light); color: var(--accent); }
.alert-warning { border-color: var(--warning); background: var(--warning-bg); color: var(--warning-text); }
.alert-info    { border-color: var(--info);    background: var(--info-bg);    color: var(--info-text); }
.alert-danger  { border-color: var(--danger);  background: var(--danger-bg);  color: var(--danger-text); }

.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
}
.empty-card svg { margin-bottom: 12px; opacity: 0.4; }

.form-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

.modal-sm  { max-width: 480px; }
.modal-md  { max-width: 640px; }
.modal-lg  { max-width: 820px; }
.modal-xl  { max-width: 1080px; }
.modal-content { max-height: 85vh; overflow-y: auto; }
```

- [ ] **Step 4: 验证 build clean**

Run: `cd admin && npm run build`

期望：tsc + vite build 都通过，无 error。bundle size 约增 1-2 KB（新 class）。

- [ ] **Step 5: 浏览器视觉检查**

打开 admin 任意页面（如 `/users`），**应该跟之前完全一样**（因为没有页面引用新 class）。

- [ ] **Step 6: Commit**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/index.css
git commit -m "style(admin-ui): add design tokens + utility classes (zero page impact)

新增 CSS 变量: --warning / --info / --accent-light / --danger-bg /
--hover-bg 等。新增 utility class: badge-yellow/purple/orange/info,
stat-grid, filter-button, alert-*, empty-card, form-hint, modal-sm/md/lg/xl.

纯追加，不动现有任何 class/变量。已有页面继续工作不变。

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 1.2: 新建 `<StatCard>` 组件

**Files:**
- Create: `admin/src/components/StatCard.tsx`

- [ ] **Step 1: 检查 components/ 目录是否存在 + 现有组件风格**

Run: `ls admin/src/components/ 2>/dev/null && head -30 admin/src/components/Pagination.tsx 2>/dev/null || head -30 admin/src/components/AdminLayout.tsx`

参考现有组件的：导入方式、prop interface 写法、export 方式。

- [ ] **Step 2: 写组件 file**

Create `admin/src/components/StatCard.tsx`:

```tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatCardColor = 'success' | 'warning' | 'danger' | 'info' | 'accent';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  color?: StatCardColor;
  hint?: string;
}

const COLOR_MAP: Record<StatCardColor, { fg: string; bg: string }> = {
  accent:  { fg: 'var(--accent)', bg: 'var(--accent-light)' },
  success: { fg: 'var(--accent)', bg: 'var(--accent-light)' },
  warning: { fg: 'var(--warning)', bg: 'var(--warning-bg)' },
  danger:  { fg: 'var(--danger)', bg: 'var(--danger-bg)' },
  info:    { fg: 'var(--info)', bg: 'var(--info-bg)' },
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color = 'accent', hint }) => {
  const c = COLOR_MAP[color];
  return (
    <div className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: c.fg, lineHeight: 1.1 }}>{value}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{hint}</div>}
      </div>
      {Icon && (
        <div style={{
          background: c.bg,
          padding: 8,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={18} color={c.fg} />
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: 验证 build**

Run: `cd admin && npm run build`

期望：clean，新组件还没被引用所以 tree-shaking 优化掉，bundle 不变。

- [ ] **Step 4: Commit**

```bash
git add admin/src/components/StatCard.tsx
git commit -m "feat(admin-ui): add StatCard component (unused, ready for adoption)

KPI stat card with label/value/icon/color/hint. Uses new CSS vars from
commit Task-1.1 (--accent-light, etc.). Tree-shaken until first import.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 1.3: 新建 `<SearchInput>` 组件

**Files:**
- Create: `admin/src/components/SearchInput.tsx`

- [ ] **Step 1: 写组件**

Create `admin/src/components/SearchInput.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  debounce?: number;       // ms; if set, auto-fires onSubmit after debounce
  clearable?: boolean;     // default true
  width?: number | string; // default 280
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = '搜索...',
  debounce,
  clearable = true,
  width = 280,
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focused, setFocused] = useState(false);

  // Debounced submit
  useEffect(() => {
    if (!debounce || !onSubmit) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSubmit(), debounce);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounce, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      if (timerRef.current) clearTimeout(timerRef.current);
      onSubmit();
    }
  };

  const handleClear = () => {
    onChange('');
    if (onSubmit) onSubmit();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', width }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 32px 8px 32px',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 13,
          background: 'var(--surface)',
          color: 'var(--text)',
          outline: 'none',
          borderColor: focused ? 'var(--accent)' : 'var(--border)',
          transition: 'border-color 0.15s',
        }}
      />
      {clearable && value && (
        <button
          onClick={handleClear}
          aria-label="清除"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: 2,
            display: 'flex',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
```

- [ ] **Step 2: 验证 build**

Run: `cd admin && npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/SearchInput.tsx
git commit -m "feat(admin-ui): add SearchInput component (debounce + Enter + X clear)

Unified search box: optional debounce auto-submit, Enter immediate submit,
clearable X. Tree-shaken until first import.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 1.4: 新建 `<FilterTabs>` 组件

**Files:**
- Create: `admin/src/components/FilterTabs.tsx`

- [ ] **Step 1: 写组件**

Create `admin/src/components/FilterTabs.tsx`:

```tsx
import React from 'react';

interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

interface FilterTabsProps {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
}

export const FilterTabs: React.FC<FilterTabsProps> = ({ value, onChange, options }) => {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            className={`filter-button ${active ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
            {opt.count != null && (
              <span style={{
                display: 'inline-block',
                marginLeft: 6,
                padding: '1px 6px',
                background: active ? 'rgba(255,255,255,0.3)' : 'var(--surface-2)',
                color: active ? 'white' : 'var(--text-secondary)',
                borderRadius: 10,
                fontSize: 11,
              }}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: 验证 build**

Run: `cd admin && npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/FilterTabs.tsx
git commit -m "feat(admin-ui): add FilterTabs component (pill buttons + count badges)

Uses .filter-button class from Task-1.1. Active state shows in --accent.
Optional count badge per option. Tree-shaken until first import.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 1.5: 新建 `<ConfirmDialog>` 组件

**Files:**
- Create: `admin/src/components/ConfirmDialog.tsx`

- [ ] **Step 1: 写组件**

Create `admin/src/components/ConfirmDialog.tsx`:

```tsx
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const isDanger = confirmVariant === 'danger';

  return (
    <div
      className="modal-overlay"
      onClick={() => !loading && onCancel()}
      style={{ zIndex: 'var(--z-modal-backdrop)' as any }}
    >
      <div
        className="modal modal-sm"
        onClick={e => e.stopPropagation()}
        style={{ zIndex: 'var(--z-modal)' as any }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{
            background: isDanger ? 'var(--danger-bg)' : 'var(--accent-light)',
            padding: 8,
            borderRadius: 6,
            display: 'flex',
          }}>
            <AlertTriangle size={20} color={isDanger ? 'var(--danger)' : 'var(--accent)'} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="modal-title" style={{ margin: 0, fontSize: 16, color: isDanger ? 'var(--danger-text)' : 'var(--text)' }}>
              {title}
            </h3>
            {description && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                {description}
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            className="btn btn-outline"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            className={isDanger ? 'btn' : 'btn btn-primary'}
            style={isDanger ? { background: 'var(--danger)', color: 'white', border: 'none' } : undefined}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 验证 build**

Run: `cd admin && npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/ConfirmDialog.tsx
git commit -m "feat(admin-ui): add ConfirmDialog component (replaces window.confirm)

React-native confirmation modal with icon, title, description, danger
or primary variant. Self-managed loading state. Click outside or
Cancel closes. Tree-shaken until first import.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 1.6: 新建 `<EmptyCard>` 组件

**Files:**
- Create: `admin/src/components/EmptyCard.tsx`

- [ ] **Step 1: 写组件**

Create `admin/src/components/EmptyCard.tsx`:

```tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface EmptyCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyCard: React.FC<EmptyCardProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
}) => {
  return (
    <div className="empty-card">
      <Icon size={32} color="var(--text-secondary)" />
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, marginTop: 12 }}>{title}</div>
      {description && (
        <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
};
```

- [ ] **Step 2: 验证 build**

Run: `cd admin && npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/EmptyCard.tsx
git commit -m "feat(admin-ui): add EmptyCard component (icon + title + optional action)

Unified empty state with lucide icon, title, optional description and
action button. Uses .empty-card class from Task-1.1. Default icon Inbox.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 1.7: 新建 `<PageHeader>` 组件

**Files:**
- Create: `admin/src/components/PageHeader.tsx`

- [ ] **Step 1: 检查现有 .page-header / .page-title / .page-desc class**

Run: `grep -n "page-header\|page-title\|page-desc" admin/src/index.css`

确认这些 class 名存在且语义匹配。

- [ ] **Step 2: 写组件**

Create `admin/src/components/PageHeader.tsx`:

```tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
}) => {
  return (
    <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {Icon && <Icon size={24} color="var(--accent)" />}
        <div style={{ minWidth: 0 }}>
          <h2 className="page-title" style={{ margin: 0 }}>{title}</h2>
          {description && <p className="page-desc" style={{ margin: '4px 0 0' }}>{description}</p>}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
};
```

- [ ] **Step 3: 验证 build**

Run: `cd admin && npm run build` → clean.

- [ ] **Step 4: Commit**

```bash
git add admin/src/components/PageHeader.tsx
git commit -m "feat(admin-ui): add PageHeader component (unified page top)

Title + description + optional icon + actions. Uses existing
.page-header / .page-title / .page-desc classes.

Rollback: git revert <this-sha>"
git push origin main
```

---

**Day 1 完成检查**:

- [ ] 7 个 commits push 到 origin/main
- [ ] `npm run build` clean
- [ ] 服务器部署一次（仅 admin rebuild），确认浏览器看到的 admin 跟今天早上完全一样
- [ ] 没有页面引用新组件 → tree-shaking 优化 → bundle 增加 < 2KB

如果以上全部 OK，Day 1 收尾 → 进 Day 2。

---

# Day 2 — Pilot: Overview 迁移（commit 8）

**目标**：把现有 Overview 改成用 Day 1 的新组件（`<StatCard>` + `<PageHeader>` + 可能用 `<FilterTabs>`），验证组件好用、踩坑早暴露。

**前置**: Day 1 全部完成，main 在 commit 1.7 之后。

**验收**:
- Overview 视觉跟旧版基本一致或更整齐
- 6 个 KPI 卡片 + 2 个图表 + 详情面板都正常
- 时间范围切换（7d/30d）正常
- 移动尺寸不溢出

---

### Task 2.1: Overview 迁移

**Files:**
- Modify: `admin/src/pages/Overview.tsx`

- [ ] **Step 1: 现状对比**

Run: `head -200 admin/src/pages/Overview.tsx`

记下：
- 当前 6 个 stat card 的 inline 写法（重复 6 次的 `<div className="card" style={{...}}>`）
- 当前页头的写法（page-header class）
- 当前 7d/30d 切换按钮的写法（filter-button-like）

- [ ] **Step 2: 改写：用 StatCard 替换 stat 块**

打开 `admin/src/pages/Overview.tsx`，把每个 stat 卡片改成：

```tsx
import { StatCard } from '@/components/StatCard';
// 或相对路径：
import { StatCard } from '../components/StatCard';

// 把：
<div className="card" style={{ padding: 14, ... 一堆 inline ... }}>
  <div>
    <div>总用户</div>
    <div style={{ color: 'green' }}>{totalUsers}</div>
  </div>
  <Users size={20} />
</div>

// 改成：
<StatCard label="总用户" value={totalUsers} icon={Users} color="success" />
```

6 个 stat 全部替换。

- [ ] **Step 3: 用 PageHeader 替换页头**

```tsx
import { PageHeader } from '../components/PageHeader';
import { BarChart2 } from 'lucide-react';

// 把现有 .page-header 块改成：
<PageHeader
  title="控制台"
  description="实时数据 · 系统概览"
  icon={BarChart2}
  actions={
    <FilterTabs
      value={range}
      onChange={setRange}
      options={[
        { label: '近 7 天', value: '7d' },
        { label: '近 30 天', value: '30d' },
      ]}
    />
  }
/>
```

- [ ] **Step 4: 用 FilterTabs 替换 7d/30d 切换（如已放进 PageHeader actions 则跳过本步）**

- [ ] **Step 5: 6 个 StatCard 用 stat-grid 包裹**

```tsx
<div className="stat-grid">
  <StatCard ... />
  <StatCard ... />
  <StatCard ... />
  <StatCard ... />
  <StatCard ... />
  <StatCard ... />
</div>
```

去掉原来手写的 `display: grid; gridTemplateColumns: ...` inline 样式。

- [ ] **Step 6: 验证 build**

Run: `cd admin && npm run build`

期望：clean，无 TS error。

- [ ] **Step 7: 视觉手测**

部署到服务器（或本地 dev）：

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin
npm run dev  # 或推 main 后服务器部署
```

浏览器打开 `/`（Overview）→ 对比旧版截图：
- 6 个 stat 卡片显示对齐
- 数值 / 图标 / 颜色正确
- 时间范围切换工作
- 移动尺寸（DevTools iPhone）不溢出

- [ ] **Step 8: Commit + push + deploy**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add admin/src/pages/Overview.tsx
git commit -m "refactor(admin-ui): Overview migrated to StatCard + PageHeader + FilterTabs

Replaces 6 inline stat blocks with StatCard component, page header with
PageHeader, and 7d/30d toggle with FilterTabs. Layout/behavior unchanged;
purely visual layer migration.

Rollback: git revert <this-sha>"
git push origin main
```

服务器部署：

```bash
ssh root@8.218.203.189
cd /root/lingjing-ai && git pull origin main
docker run --rm -v /root/lingjing-ai/admin:/app -w /app node:20-alpine \
  sh -c "npm install --silent 2>/dev/null && npm run build"
rm -rf /var/www/api-platform/admin/* && cp -r /root/lingjing-ai/admin/dist/* /var/www/api-platform/admin/
```

- [ ] **Step 9: 用户生产验收**

浏览器硬刷 admin 的 `/`，按 Day 2 验收 checklist 跑：
- 加载 / 数据 / 操作 / 筛选 / 移动 / 风格一致

若问题：`git revert <commit-sha-2.1>` 后重新部署。

---

# Day 3 — Channels（commits 9-10）

**目标**：把 Channels 这个 10 列表格 + 大 modal 改成：
- 头部用 PageHeader + StatCard
- 表格减到 6-7 列
- priority/weight/mapping/config 移到右侧抽屉

**前置**: Day 2 通过，组件好用。

---

### Task 3.1: 新建 `<Drawer>` 组件

**Files:**
- Create: `admin/src/components/Drawer.tsx`

- [ ] **Step 1: 写组件**

```tsx
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  title,
  onClose,
  width = 480,
  children,
}) => {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 1000,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s',
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '100vw',
          background: 'var(--surface)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
          zIndex: 1001,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--surface-2)',
        }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>{children}</div>
      </div>
    </>
  );
};
```

- [ ] **Step 2: 验证 build**

Run: `cd admin && npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/Drawer.tsx
git commit -m "feat(admin-ui): add Drawer component (right-side panel with backdrop + ESC)

Slides in from right, animates 200ms, ESC and backdrop click closes.
Used by Channels detail view in Task-3.2 next.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 3.2: Channels 迁移（10 列 → 7 列 + 详情抽屉）

**Files:**
- Modify: `admin/src/pages/Channels.tsx`

- [ ] **Step 1: 当前结构梳理**

Run: `grep -n "TYPES\|columns\|model_mapping\|config\|priority\|weight" admin/src/pages/Channels.tsx | head -30`

记下：
- 当前 10 列表格的列名
- modal 里复杂字段（model_mapping, config, system_prompt）

- [ ] **Step 2: 减表格列**

把现有 10 列表格列减到 7 列：
- `id | name+type-badge | status | priority | balance | last-update | actions`

把删掉的列（response_time, test_time, used）移到详情抽屉里。

- [ ] **Step 3: 添加详情抽屉 state**

```tsx
import { Drawer } from '../components/Drawer';
// ...
const [detailChannel, setDetailChannel] = useState<Channel | null>(null);

// 点击 row 或专门按钮：
<button onClick={() => setDetailChannel(channel)}>详情</button>

// 抽屉 JSX：
<Drawer
  open={!!detailChannel}
  title={`渠道详情 — ${detailChannel?.name ?? ''}`}
  onClose={() => setDetailChannel(null)}
  width={520}
>
  {detailChannel && (
    <>
      <div className="form-group">
        <label className="form-label">priority</label>
        <input ... />
      </div>
      <div className="form-group">
        <label className="form-label">weight</label>
        <input ... />
      </div>
      <div className="form-group">
        <label className="form-label">model_mapping (JSON)</label>
        <textarea ... rows={6} />
      </div>
      <div className="form-group">
        <label className="form-label">config (JSON)</label>
        <textarea ... rows={6} />
      </div>
      <div className="form-group">
        <label className="form-label">system_prompt</label>
        <textarea ... rows={4} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSaveDetail}>保存</button>
        <button className="btn btn-outline" onClick={() => setDetailChannel(null)}>取消</button>
      </div>
    </>
  )}
</Drawer>
```

`handleSaveDetail` 调现有 `channelApi.update(...)`。

- [ ] **Step 4: 简化 modal**

把 modal 里的字段精简到只剩"创建一个新渠道必须的最小集"：
- name, type, key, base_url, models, group, status

priority/weight/mapping/config/system_prompt 通过详情抽屉编辑（创建时给默认值即可）。

- [ ] **Step 5: 头部用 PageHeader + StatCard**

```tsx
<PageHeader title="渠道管理" description="..." icon={Network} actions={...} />

<div className="stat-grid">
  <StatCard label="总渠道" value={total} color="info" />
  <StatCard label="启用中" value={enabled} color="success" />
  <StatCard label="已禁用" value={disabled} color="danger" />
  <StatCard label="本次测试 PASS" value={testedOk} color="accent" />
</div>
```

- [ ] **Step 6: 删除按钮换 ConfirmDialog**

```tsx
import { ConfirmDialog } from '../components/ConfirmDialog';

// state:
const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);

// 删除按钮：
<button onClick={() => setDeleteTarget(channel)}>删除</button>

// 末尾：
<ConfirmDialog
  open={!!deleteTarget}
  title="确认删除渠道"
  description={<>渠道 <strong>{deleteTarget?.name}</strong> 将被删除。此操作不可撤销。</>}
  confirmLabel="删除"
  confirmVariant="danger"
  onConfirm={async () => {
    await channelApi.delete(deleteTarget!.id);
    toast.success('已删除');
    setDeleteTarget(null);
    load();
  }}
  onCancel={() => setDeleteTarget(null)}
/>
```

- [ ] **Step 7: 验证 build**

```bash
cd admin && npm run build
```

clean.

- [ ] **Step 8: 部署 + 手测**

部署后浏览器跑：
- 看到 7 列简洁表格
- 点详情 → 抽屉滑出，看到 priority/weight/mapping/config
- 编辑抽屉里字段 → 保存 → 列表刷新
- 删除按钮 → ConfirmDialog 弹出而不是 browser confirm
- 测试按钮（type=57 的 ApiMart）→ "测试图像" 正常
- 创建新渠道 → 简化 modal 用着舒服

- [ ] **Step 9: Commit + push + deploy**

```bash
git add admin/src/pages/Channels.tsx
git commit -m "refactor(admin-ui): Channels - 10 cols → 7 cols + detail Drawer

- Table reduced from 10 cols to 7 (moved priority/weight/mapping/config/
  system_prompt to side Drawer)
- Header uses PageHeader + StatCard
- Delete confirm uses ConfirmDialog (not window.confirm)
- Create modal kept minimal (creation only requires name/type/key/url/models)
- Same API calls, same data flow, only presentation layer changes

Rollback: git revert <this-sha>"
git push origin main
```

服务器部署同 Task 2.1 Step 8。

---

# Day 4 — ModelPrices + Users + FilterSidebar（commits 11-13）

---

### Task 4.1: 新建 `<FilterSidebar>` 组件

**Files:**
- Create: `admin/src/components/FilterSidebar.tsx`

- [ ] **Step 1: 写组件**

```tsx
import React from 'react';

interface FilterSidebarProps {
  width?: number;
  children: React.ReactNode;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({ width = 220, children }) => {
  return (
    <aside style={{
      width,
      minWidth: width,
      padding: 16,
      background: 'var(--surface-2)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      overflow: 'auto',
    }}>
      {children}
    </aside>
  );
};

interface FilterGroupProps {
  label: string;
  children: React.ReactNode;
}

export const FilterGroup: React.FC<FilterGroupProps> = ({ label, children }) => (
  <div>
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-secondary)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: 8,
    }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
  </div>
);
```

- [ ] **Step 2: 验证 build**

`cd admin && npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/FilterSidebar.tsx
git commit -m "feat(admin-ui): add FilterSidebar + FilterGroup (left-side filter panel)

For wide pages (Users) that have many filter dimensions. Used by Task-4.3.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 4.2: ModelPrices 迁移（11 列 → 6 列 + 搜索）

**Files:**
- Modify: `admin/src/pages/ModelPrices.tsx`

- [ ] **Step 1: 减表格列**

11 → 6 列：
- `logo+name+desc(2-line) | provider | price-inline | visible | actions`

- [ ] **Step 2: 顶部加 SearchInput**

```tsx
import { SearchInput } from '../components/SearchInput';

const [search, setSearch] = useState('');
const filtered = useMemo(() => {
  const q = search.toLowerCase().trim();
  if (!q) return models;
  return models.filter(m =>
    m.model_id.toLowerCase().includes(q) ||
    m.name?.toLowerCase().includes(q) ||
    m.provider?.toLowerCase().includes(q) ||
    m.tags?.toLowerCase().includes(q)
  );
}, [search, models]);

// in JSX:
<SearchInput value={search} onChange={setSearch} placeholder="搜索 model_id / 名称 / 标签..." debounce={300} />
```

- [ ] **Step 3: 头部用 PageHeader + StatCard**

```tsx
<PageHeader title="模型价格" description="按模型类型自动切换计费单位" icon={DollarSign} />

<div className="stat-grid">
  <StatCard label="可见模型" value={visibleCount} color="success" />
  <StatCard label="隐藏模型" value={hiddenCount} color="warning" />
  <StatCard label="图像模型" value={imageCount} color="accent" />
</div>
```

- [ ] **Step 4: 删除/隐藏按钮换 ConfirmDialog**

参考 Task 3.2 Step 6 同样的模式。

- [ ] **Step 5: 空状态用 EmptyCard**

```tsx
import { EmptyCard } from '../components/EmptyCard';
import { DollarSign } from 'lucide-react';

{filtered.length === 0 ? (
  <EmptyCard
    icon={DollarSign}
    title={search ? '没有匹配的模型' : '暂无模型价格配置'}
    description={search ? '试试别的关键字' : '点击右上角添加第一个模型'}
  />
) : (
  /* 表格 */
)}
```

- [ ] **Step 6: 验证 build + 部署**

```bash
cd admin && npm run build
```

clean.

- [ ] **Step 7: 视觉手测**

- 看到 6 列表格、搜索框响应、空状态友好
- 编辑某个图像模型 → 标签"价格 $/张"正确（之前已验证过）
- 删除 → ConfirmDialog 弹

- [ ] **Step 8: Commit + push + deploy**

```bash
git add admin/src/pages/ModelPrices.tsx
git commit -m "refactor(admin-ui): ModelPrices - 11 cols → 6 cols + search

Table reduced to 6 essential columns. SearchInput at top with 300ms
debounce filters by id/name/provider/tags. Empty state uses EmptyCard.
Delete confirms via ConfirmDialog.

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 4.3: Users 迁移（11 列 → 6 列 + 左侧筛选 + 编辑 tabs）

**Files:**
- Modify: `admin/src/pages/Users.tsx`

- [ ] **Step 1: 加左侧 FilterSidebar**

```tsx
import { FilterSidebar, FilterGroup } from '../components/FilterSidebar';
import { SearchInput } from '../components/SearchInput';

// Layout:
<div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
  <FilterSidebar width={220}>
    <FilterGroup label="搜索">
      <SearchInput
        value={searchKeyword}
        onChange={setSearchKeyword}
        onSubmit={loadUsers}
        placeholder="用户名/邮箱/ID"
        width="100%"
      />
    </FilterGroup>
    
    <FilterGroup label="角色">
      <FilterTabs
        value={roleFilter}
        onChange={setRoleFilter}
        options={[
          { label: '全部', value: '' },
          { label: '管理员', value: 'admin' },
          { label: '普通用户', value: 'user' },
        ]}
      />
    </FilterGroup>
    
    <FilterGroup label="状态">
      <FilterTabs
        value={statusFilter}
        onChange={setStatusFilter}
        options={[
          { label: '全部', value: '' },
          { label: '启用', value: 'enabled' },
          { label: '禁用', value: 'disabled' },
        ]}
      />
    </FilterGroup>
    
    <FilterGroup label="分组">
      <FilterTabs
        value={groupFilter}
        onChange={setGroupFilter}
        options={[
          { label: '全部', value: '' },
          { label: 'default', value: 'default' },
          { label: 'vip', value: 'vip' },
          { label: 'admin', value: 'admin' },
        ]}
      />
    </FilterGroup>
  </FilterSidebar>

  <div style={{ flex: 1, minWidth: 0 }}>
    {/* 表格 */}
  </div>
</div>
```

- [ ] **Step 2: 减表格列 11 → 6**

`username+role | display+email | group-badge | quota | status | actions`

- 把 role 内嵌到 username 旁（红色 badge 警示 admin/superadmin）
- email 放到 display name 下面（小灰字）
- affiliate_rate 移到编辑 modal 的"配置" tab

- [ ] **Step 3: 编辑 modal 改 2 tabs**

```tsx
const [tab, setTab] = useState<'account' | 'config'>('account');

<div className="modal-overlay" ...>
  <div className="modal modal-md" ...>
    <div className="modal-title">编辑用户 {editing?.username}</div>
    
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
      <button
        className={`filter-button ${tab === 'account' ? 'active' : ''}`}
        onClick={() => setTab('account')}
        style={{ borderRadius: 0, borderBottom: 'none' }}
      >
        账号
      </button>
      <button
        className={`filter-button ${tab === 'config' ? 'active' : ''}`}
        onClick={() => setTab('config')}
        style={{ borderRadius: 0, borderBottom: 'none' }}
      >
        配置
      </button>
    </div>
    
    {tab === 'account' && (
      <>
        {/* username, display_name, email, password */}
      </>
    )}
    {tab === 'config' && (
      <>
        {/* quota, group, role, affiliate_rate, status */}
      </>
    )}
  </div>
</div>
```

- [ ] **Step 4: quota 修改加 delta hint**

```tsx
const [originalQuota] = useState(editing?.quota || 0);
const currentQuota = form.quota || 0;
const delta = currentQuota - originalQuota;

<input type="number" value={currentQuota} onChange={...} />
{delta !== 0 && (
  <div className="form-hint" style={{ color: delta > 0 ? 'var(--accent)' : 'var(--danger)' }}>
    {delta > 0 ? `+${delta}` : delta} quota（约 ${(delta / 500000).toFixed(2)} USD）
  </div>
)}
```

- [ ] **Step 5: 删除/重置密码用 ConfirmDialog**

替换 `window.confirm()`。

- [ ] **Step 6: 验证 build + 手测**

```bash
cd admin && npm run build
```

clean。手测：左侧侧栏所有筛选工作、表格变窄、编辑 modal 切 tabs OK、quota 改值看到 delta、删除确认弹 ConfirmDialog。

- [ ] **Step 7: Commit + push + deploy**

```bash
git add admin/src/pages/Users.tsx
git commit -m "refactor(admin-ui): Users - 11 cols → 6 cols + left FilterSidebar

- Left FilterSidebar with search + role/status/group filters
- Table reduced to 6 cols, role inlined as colored badge in username cell
- Edit modal split into Account / Config tabs
- Quota field shows delta hint with USD conversion
- Delete & password reset use ConfirmDialog instead of window.confirm

Rollback: git revert <this-sha>"
git push origin main
```

---

# Day 5 — Logs + Orders + Tasks（commits 14-16）

每个页面遵循同样的迁移模板：

```
1. import { PageHeader, StatCard, SearchInput, FilterTabs, ConfirmDialog, EmptyCard }
2. 头部 div 换成 <PageHeader title=... actions=... />
3. stat 块换成 <div className="stat-grid"><StatCard ... /></div>
4. 搜索框换成 <SearchInput debounce={300} ... />
5. pill button 筛选换成 <FilterTabs ... />
6. window.confirm() 换成 <ConfirmDialog ... />
7. 空状态换成 <EmptyCard ... />
8. inline 颜色硬编码 → 替换成 var(--xxx) (新增的 --warning / --danger-bg 等)
9. build + commit + deploy + 验收
```

---

### Task 5.1: Logs 迁移

**Files:** Modify `admin/src/pages/Logs.tsx`

- [ ] **Step 1: 应用 7 步模板**

按上面"5/6/7 模板"改 Logs.tsx：
- PageHeader（icon: ScrollText）
- 没有 stat 块（跳过）
- SearchInput 替换 username + model_name 输入框（保留 2 个独立）
- 没有 filter pills（跳过）
- 没有 confirm 动作（跳过）
- 空状态用 EmptyCard

- [ ] **Step 2: build + commit**

```bash
cd admin && npm run build
cd .. && git add admin/src/pages/Logs.tsx
git commit -m "refactor(admin-ui): Logs - use PageHeader/SearchInput/EmptyCard

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 5.2: Orders 迁移

**Files:** Modify `admin/src/pages/Orders.tsx`

- [ ] **Step 1: 应用 7 步模板**

- PageHeader（icon: ShoppingBag）
- StatCard 替换 4 个状态统计（pending / paid / refunded / failed）
- FilterTabs 替换 4 个 pill button 状态切换
- SearchInput 替换 username search
- 没有 confirm（跳过）
- 空状态用 EmptyCard

- [ ] **Step 2: build + commit**

```bash
cd admin && npm run build
git add admin/src/pages/Orders.tsx
git commit -m "refactor(admin-ui): Orders - PageHeader/StatCard/FilterTabs/SearchInput

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 5.3: Tasks 迁移

**Files:** Modify `admin/src/pages/Tasks/index.tsx`

- [ ] **Step 1: 应用 7 步模板**

- PageHeader（icon: ListTodo）
- StatCard 4 个：submitted / processing / success / failure
- FilterTabs 替换 status pill buttons
- SearchInput 替换 task_id 搜索
- ConfirmDialog 替换"退款"和"重试"的 `window.confirm`
- 空状态用 EmptyCard

- [ ] **Step 2: build + commit**

```bash
cd admin && npm run build
git add admin/src/pages/Tasks/index.tsx
git commit -m "refactor(admin-ui): Tasks - use new component lib + ConfirmDialog for refund

Rollback: git revert <this-sha>"
git push origin main
```

---

**Day 5 完成检查**: 3 个页面部署后浏览器手测各跑一次 happy path（加载/筛选/操作）。

---

# Day 6 — Withdrawals + ModelManage + ModelRatios（commits 17-19）

---

### Task 6.1: Withdrawals 迁移

**Files:** Modify `admin/src/pages/Withdrawals.tsx`

- [ ] **Step 1: 应用 7 步模板**

- PageHeader（icon: Banknote）
- StatCard 3 个：pending / approved / paid
- FilterTabs 替换 4 个状态 pill button
- ConfirmDialog 替换 approve/reject 的 confirm
- 把硬编码的 #fee2e2 #fef3c7 #dcfce7 全部换成 var(--danger-bg) var(--warning-bg) var(--accent-light)

- [ ] **Step 2: build + commit**

```bash
cd admin && npm run build
git add admin/src/pages/Withdrawals.tsx
git commit -m "refactor(admin-ui): Withdrawals - new components + remove hardcoded colors

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 6.2: ModelManage 迁移

**Files:** Modify `admin/src/pages/ModelManage.tsx`

- [ ] **Step 1: 应用 7 步模板**

- PageHeader
- StatCard 5 个（已有 5-stat 卡片）
- SearchInput 替换 search by name/provider
- ConfirmDialog 替换"删除/移除僵尸模型"的 confirm
- 空状态用 EmptyCard

注意：之前 commit `d5a3878` 改过这个文件加 isImageModel 检测，保留那个逻辑。

- [ ] **Step 2: build + commit**

```bash
cd admin && npm run build
git add admin/src/pages/ModelManage.tsx
git commit -m "refactor(admin-ui): ModelManage - PageHeader/StatCard/SearchInput

Rollback: git revert <this-sha>"
git push origin main
```

---

### Task 6.3: ModelRatios 迁移

**Files:** Modify `admin/src/pages/ModelRatios.tsx`

- [ ] **Step 1: 应用 7 步模板**

- PageHeader
- 没有 stat（跳过）
- SearchInput 替换搜索
- FilterTabs 替换 input/completion tabs
- 删除按钮用 ConfirmDialog
- 把 #f1f5f9 等硬编码替换 var(--hover-bg)

- [ ] **Step 2: build + commit**

```bash
cd admin && npm run build
git add admin/src/pages/ModelRatios.tsx
git commit -m "refactor(admin-ui): ModelRatios - new components + CSS var cleanup

Rollback: git revert <this-sha>"
git push origin main
```

---

# Day 7 — 剩余 7 个简单页面（commits 20-26）

每个页面较简单，每个用同样的 7 步模板适配。每 commit 一个页面。

---

### Task 7.1: Redemptions 迁移

`admin/src/pages/Redemptions.tsx`

- [ ] PageHeader + StatCard（3 个）+ ConfirmDialog（删除）+ EmptyCard
- [ ] build + commit + push

```bash
git commit -m "refactor(admin-ui): Redemptions - PageHeader/StatCard/ConfirmDialog/EmptyCard

Rollback: git revert <this-sha>"
```

---

### Task 7.2: Plans 迁移

`admin/src/pages/Plans.tsx`

- [ ] PageHeader + ConfirmDialog（删除/下架）
- [ ] build + commit + push

```bash
git commit -m "refactor(admin-ui): Plans - PageHeader + ConfirmDialog

Rollback: git revert <this-sha>"
```

---

### Task 7.3: Settings 迁移

`admin/src/pages/Settings.tsx`

- [ ] PageHeader + 把硬编码的 #2563eb 换成 var(--info)
- [ ] build + commit + push

```bash
git commit -m "refactor(admin-ui): Settings - PageHeader + replace hardcoded link blue

Rollback: git revert <this-sha>"
```

---

### Task 7.4: PaymentSettings 迁移

`admin/src/pages/PaymentSettings.tsx`

- [ ] PageHeader + 把硬编码的 #f0fdf4/#86efac/#166534 status banner 换成 .alert-success class
- [ ] build + commit + push

```bash
git commit -m "refactor(admin-ui): PaymentSettings - PageHeader + .alert-success banner

Rollback: git revert <this-sha>"
```

---

### Task 7.5: Notices 迁移

`admin/src/pages/Notices.tsx`

- [ ] PageHeader + EmptyCard（空状态用 Bell 图标）+ ConfirmDialog（删除）
- [ ] build + commit + push

```bash
git commit -m "refactor(admin-ui): Notices - PageHeader/EmptyCard/ConfirmDialog

Rollback: git revert <this-sha>"
```

---

### Task 7.6: Referrals 迁移

`admin/src/pages/Referrals.tsx`

- [ ] PageHeader + StatCard（4 个，含返佣金额/邀请人数等）
- [ ] build + commit + push

```bash
git commit -m "refactor(admin-ui): Referrals - PageHeader + StatCard

Rollback: git revert <this-sha>"
```

---

### Task 7.7: Login 迁移

`admin/src/pages/Login.tsx`

- [ ] 简单页面，主要把硬编码颜色（gradient 用的）换成 CSS vars。可能不需要 PageHeader（已经有自己的标题）
- [ ] build + commit + push

```bash
git commit -m "refactor(admin-ui): Login - replace hardcoded gradient colors with CSS vars

Rollback: git revert <this-sha>"
```

---

# 完成 — 整体校验

- [ ] **全部 17 个页面 commit 都在 origin/main**
- [ ] `npm run build` clean
- [ ] **grep 检查硬编码颜色清零**：
  ```bash
  cd /Users/lizhishaoniange/lingjing-ai/admin/src
  grep -rn '#[0-9a-fA-F]\{3,6\}' pages/ | grep -v 'index.css' | head -20
  # 期望：返回 0 行或仅少数合理例外（如 lucide icon color 等）
  ```
- [ ] **grep 检查 window.confirm 清零**：
  ```bash
  grep -rn 'window\.confirm\|^\s*confirm(' pages/ | head -5
  # 期望：0 行
  ```
- [ ] **grep 检查 inline stat 块清零**：
  ```bash
  grep -B1 -A3 'className="card"' pages/ | grep -A3 'stat\|KPI' | head -40
  # 期望：0 行 ad-hoc stat blocks（全部用 StatCard）
  ```
- [ ] 服务器部署后浏览器跑完整 17 页 smoke test

---

# 工期复核

| Day | 任务数 | 工期 |
|---|---|---|
| 1 | 7 (tokens + 6 components) | 1 天 |
| 2 | 1 (Overview) | 0.5 天 |
| 3 | 2 (Drawer + Channels) | 1 天 |
| 4 | 3 (FilterSidebar + ModelPrices + Users) | 1 天 |
| 5 | 3 (Logs + Orders + Tasks) | 0.5 天 |
| 6 | 3 (Withdrawals + ModelManage + ModelRatios) | 0.5 天 |
| 7 | 7 (Redemptions + Plans + Settings + PaymentSettings + Notices + Referrals + Login) | 1.5 天 |
| **总计** | **26 commits** | **6 天** |

---

# 注意事项

1. **commit 颗粒度**：每 Day 1 的组件 / 每个页面单独一个 commit。**绝不打包**。
2. **每个 commit message** 都要有 `Rollback: git revert <this-sha>` 一行（commit 后可手动 amend 补 sha，或在文档里记录）。
3. **每页迁移完，单独部署一次**（admin rebuild + nginx 替换）。验证 OK 才进下一页。
4. **保持现有 API 调用、props、数据流不变**。只换表现层。
5. **如某页面有特殊业务逻辑**（如 Settings 的密码修改 modal），仅替换通用部分（页头/按钮颜色），特殊部分照旧。
6. **如 Day 中遇到比预期更多的内联硬编码**（特别是 Channels），把"清理硬编码颜色"也算进当 commit，但不要扩展到其他页面。
7. **YAGNI**：暗色模式、虚拟滚动、键盘快捷键、列拖动 — 全部不在范围。
