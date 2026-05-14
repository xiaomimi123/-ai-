# 灵镜 AI 更新日志

按时间倒序记录每次重要迭代。**文件维护规则：每次主要功能 / 修复合并到 main 时追加新条目**，新条目放最上面。

---

## 2026-05-15 异步任务系统（Phase A-I）

> 分支: `feat/async-task-system` · 39 commits · +4948 / -7 lines · 55 files changed
> Feature flag: `ENABLE_TASK_SYSTEM=false` (默认关闭，**零影响现有用户**)
> 部署 SOP: `scripts/deploy-task-system.sh phase1` → `phase2` → `phase3`
> 回滚: `scripts/deploy-task-system.sh rollback`

### 新增功能

#### 异步任务框架（基础设施）

移植 New API 的 task 子系统，让灵镜支持上游异步协议（apimart、字节即梦等返回 `task_id` 需轮询的中转平台）。

- **后端 worker**：goroutine 周期轮询上游（默认每 5 秒一轮）+ 超时回收（默认 10 分钟）+ Redis 错误计数（连续失败 5 次自动 FAILURE + 退款）
- **OpenAI 风格 API**：`POST /v1/images/generations` 返 `{data:[{task_id, status:"submitted"}]}` + `GET /v1/tasks/{id}` 轮询（对第三方 SDK 友好，跟 apimart 文档一致）

#### 2 个上游适配器

| Adapter | channel.Type | 协议 | 用途 |
|---|---|---|---|
| **ApiMart** | 57 | OpenAI 兼容异步图像 | `gpt-image-2` 等 |
| **Jimeng** | 58 | Volcengine V4 HMAC-SHA256 签名 | 字节即梦异步图像 / 视频 |

#### Playground 异步生成 tab

playground 顶部新增"异步生成"tab（位于"聊天 / 文生图"之后）：

- 模型下拉 + prompt 输入 + 比例 / 分辨率 / 张数选择
- 提交后任务卡片显示进度条 + 5s 延迟首查 + 3s 轮询间隔
- 任务完成 → 显示图片 + "下载"按钮（强制 `<a download>`）
- 进行中 → "取消"按钮 → 转 FAILURE + 全额退款
- **任务历史仅 session 内存，刷新即丢，最多 20 条**（沿用 `[[project_playground]]` 决策）
- 森林风格 CSS vars，无蓝紫色，无 AI emoji

#### Admin 任务管理页

`/admin/tasks` 路由（左侧菜单"核心管理"下，"调用日志"之后）：

- 列表 + 分页 + 筛选（平台 / 状态 / 用户 ID / task_id 关键字）
- 详情弹窗显示完整 JSON
- **重试**按钮：`FAILURE` / `TIMEOUT` 任务可触发，状态转 SUBMITTED 让 worker 重新接管
- **手动退款**按钮：`SUCCESS` 任务可触发，要求填写 reason + 二次确认，会反向修正 `used_quota` 计数器

### 数据库变更（**向后兼容**）

gorm AutoMigrate 自动应用，纯增量，不破坏 schema：

- **新建表 `tasks`**（全新表，老代码完全不感知）
- **`logs` 表新增可空字段 `task_id varchar(191) default ''`**（现有同步消费写入不设此字段，gorm 默认 `''`）

回滚不需要回退 DB，留着无害。

### 计费集成（高安全等级）

- 复用项目原生 `PreConsumeTokenQuota` / `PostConsumeTokenQuota`，**user.quota 与 token.remain_quota 同步**（不会脱节）
- 预扣 / 退款日志类型 = **`LogTypeManage`**（不污染 `LogTypeConsume` 使用看板统计）
- 结算日志类型 = `LogTypeConsume`（与同步消费一致，仪表盘正确反映用量）
- **原子退款守卫**：`tasks.refund_log_id` 通过 `UPDATE WHERE refund_log_id = 0` 原子声明，防止 admin 双击退款扣两次
- **referral 不在 task 消费时触发**（沿用项目策略：referral 只在支付时触发）

### 新增环境变量（详见 `backend/.env.example`）

```bash
ENABLE_TASK_SYSTEM=false          # 总开关 ⭐
TASK_WORKER_INTERVAL=5s           # worker 拉取间隔
TASK_WORKER_BATCH_SIZE=50         # 单轮最多处理任务数
TASK_TIMEOUT_MINUTES=10           # 任务超时阈值
TASK_RETENTION_DAYS=30            # 完成任务保留天数
TASK_UPSTREAM_HTTP_TIMEOUT=30s    # 上游 HTTP 超时
TASK_MAX_FETCH_ERRORS=5           # 连续 N 次失败强制 FAILURE
```

### 运维工具

| 路径 | 用途 |
|---|---|
| `scripts/deploy-task-system.sh` | 分阶段部署 + 一键回滚（phase1 / phase2 / phase3 / rollback） |
| `scripts/monitor-task-system.sh` | crontab 每 5 分钟扫描告警（退款激增 + stuck 任务），需配 `TASK_ALERT_WEBHOOK` |
| `docs/superpowers/plans/2026-05-13-async-task-e2e-checklist.md` | 上线前 9 类 E2E 测试清单 |

### 设计 / 计划文档

| 路径 | 内容 |
|---|---|
| `docs/superpowers/specs/2026-05-13-async-task-system-design.md` | 系统设计（12 节，522 行） |
| `docs/superpowers/plans/2026-05-13-async-task-system.md` | 实施计划（32 任务 / 9 个 Phase / 4336 行） |

### 部署影响

| 阶段 | 现有用户感受 |
|---|---|
| Phase 1（部署代码，flag 仍 off） | **5-15 秒生产抖动**（同 push.sh 标准抖动） |
| flag off 持续运行 | **无任何感受** |
| Phase 2（打开 flag） | 又 5-15 秒抖动；新路由生效，但渠道 group=admin 时普通用户调不到 |
| Phase 3（渠道 group 改 default） | 新模型对所有用户开放 |

聊天 / 同步图像 / 现有渠道 / 现有 token / 现有用户 — **完全不动**。Flag OFF 时运行行为与 main 字节级等价。

### 已知限制 / 待优化（标记为 F2 / F3 工作）

- `OnSuccess` 目前按预扣值结算，未基于上游 `actual_cost` 做多退少补（F2 工作）
- 用户额度 Redis 缓存在 task 结算后未刷新（当 F2 引入实际成本差额时会成为问题，届时需调 `CacheUpdateUserQuota`）
- admin sidebar 的"异步任务"入口在 `ENABLE_TASK_SYSTEM=false` 时仍可见（点进去会 404），UX 优化可放 F3
- jimeng 模型映射列表是硬编码，未来如果支持更多 jimeng req_key 要扩

### 不影响现有功能（已验证）

- 聊天 (`/v1/chat/completions`) — 完全不动
- 同步图像 (`/v1/images/generations` for type=1/24 渠道) — 完全不动
- 现有所有渠道 / token / 用户 / 订单 / referral / 财务 — 完全不动
- `common/image.TestDecode` 是预存在 flake（main 上同样失败），与本次改动无关

---

<!-- 后续迭代请在这里继续追加，时间倒序：最新的放最上面 -->
