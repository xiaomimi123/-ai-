# 异步任务系统设计 — 移植 New API task 子系统到灵镜 AI

| 项 | 值 |
|---|---|
| 日期 | 2026-05-13 |
| 状态 | Draft — 待 user 审阅 |
| 作者 | 协作（人 + Claude） |
| 关联 | [[project_playground]] · [[feedback_oneapi_field_semantics]] · [[reference_server_deploy]] |
| 上游参考 | https://github.com/Calcium-Ion/new-api `relay/channel/task/`、`model/task.go` |

---

## 0. 目标 / 背景

灵镜 AI 已上线同步图像（gpt-image-1 / dall-e-3 / nano-banana），但部分第三方中转（apimart 等）以及视频生成模型（jimeng / kling / sora 等）采用 **异步任务协议**（提交返回 task_id、轮询拿结果），与 One API 内置的同步 image adaptor 不兼容。

本设计**移植 New API 的 task 子系统**到灵镜 AI，新增一整套独立的异步任务通路，**不影响**现有同步聊天 / 图像 / 视频功能。

**非目标**：

- 不重写聊天 / 同步图像 / 计费 / 分销机制（复用 `consume_quota` / `quota_log` / referral）
- 不做分布式 worker（单容器单 worker，多容器扩展是未来工作）
- 不镜像上游图片到自家 OSS（沿用 [[project_playground]] "不存历史"决策）

---

## 1. 决策点汇总（已与 user 确认）

| # | 决策项 | 结论 |
|---|---|---|
| 1 | 移植范围 | framework + `apimart` + `jimeng` 两个 adaptor，5-6 天工期 |
| 2 | API 风格 | OpenAI 风格：`POST /v1/images/generations` 返 `{task_id}` + `GET /v1/tasks/{id}` |
| 3 | DB schema | 完全复制 New API `tasks` 原表 + 2 个灵镜业务字段（`refund_log_id`、`timeout_at`）|
| 4 | 轮询机制 | 后端 worker 周期 fetch + 客户端只查本地 |
| 5 | 计费时机 | 预扣 → completed 多退少补 → failed 全退，复用 `consume_quota`，新写 `refund_quota` |
| 6 | 前端 UI | playground 顶部加 "异步生成" tab；同步画图 UI 完全不动 |
| 7 | admin 后台 | 加任务管理页：筛查 / 重试 / 手动退款 |
| 8 | Feature flag | `ENABLE_TASK_SYSTEM=on/off` env 总开关 + 单 channel 可禁 |
| 9 | fetch 错误计数 | Redis 存（TTL 1 小时），不在 tasks 表加列 |
| 10 | 并发模型 | 单 worker 单实例，不加 worker_lock；多容器部署时再补 |
| 11 | fetch 重试阈值 | 5 次错误后强制 FAILURE 退款（业界主流） |

---

## 2. 架构总览

```
┌────────────────────────────────────────────────────────────────┐
│  客户端 (playground 异步 tab / 第三方 SDK)                       │
└────────────────┬───────────────────────────────────────────────┘
                 │ ① POST /v1/images/generations  {model, prompt, ...}
                 │ ② GET  /v1/tasks/{task_id}      (轮询 3s)
                 ▼
┌────────────────────────────────────────────────────────────────┐
│ relay/relay.go (现有 dispatcher，加 1 个 if 分支)                │
│                                                                  │
│   model.channel.Type ∈ {1, 24, ...} (SYNC)  →  现有 image relay │
│   model.channel.Type ∈ {42, 43, ...} (ASYNC) →  新增 TaskRelay  │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────────────┐
│ relay/channel/task/  ← 新增整个子树                              │
│                                                                  │
│   taskcommon/       共享：HTTP / 签名 / 错误包装                  │
│   apimart/          adaptor.go (~250 行)                         │
│   jimeng/           adaptor.go (~400 行, 含 HMAC-SHA256)         │
└──────┬──────────────────────────────────────────────┬───────────┘
       │ ① 提交时写 task 记录                            │ FetchTask
       ▼                                              │
┌──────────────────────┐    ┌──────────────────────────┴─────────┐
│ DB: tasks 表 (新增)    │◄───┤ TaskWorker (新增 goroutine)         │
│  - task_id            │    │  每 5 秒：拉 submitted/processing    │
│  - status             │    │  → 调对应 adaptor.FetchTask()        │
│  - result JSON        │    │  → 更新 tasks.status / result        │
│  - quota_frozen       │    │  → SUCCESS 调 consume_quota          │
│  - timeout_at         │    │  → FAILURE 调 refund_quota           │
└──────────────────────┘    └──────────────────────────────────────┘
                                          │
                                          ▼
                              ┌─────────────────────────┐
                              │ 现有 users/quota_log/    │
                              │ referral_records (不动) │
                              └─────────────────────────┘
```

### 隔离边界

| 现有 | 改动 |
|---|---|
| 聊天模型 (`/v1/chat/completions`) | 完全不碰 |
| 同步图像 (gpt-image-1 / dall-e-3 / nano-banana) | 完全不碰 |
| `relay/channel/openai/`、`gemini/` 等 adaptor | 完全不碰 |
| `consume_quota` / `quota_log` / referral | 函数复用，签名不动 |
| `users` / `channels` / `tokens` 表 | 结构不动 |
| `quota_log` 表 | 加 1 个可空字段 `task_id` |
| `router/relay.go` | 加 5 行 if 分支 |

**Feature flag OFF 时**：worker 不启动、`/v1/tasks/*` 路由不注册、`relayImage` 的 if 分支永远 false → **跟没改一样**。

---

## 3. 数据模型

### 3.1 新增表 `tasks`

```sql
CREATE TABLE tasks (
    -- ========== New API 原表字段 ==========
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    created_at    BIGINT       NOT NULL,
    updated_at    BIGINT       NOT NULL,
    task_id       VARCHAR(191) UNIQUE NOT NULL,
    platform      VARCHAR(30)  NOT NULL,
    user_id       INT          NOT NULL,
    `group`       VARCHAR(50),
    channel_id    INT          NOT NULL,
    quota         INT          NOT NULL DEFAULT 0,
    action        VARCHAR(40),
    status        VARCHAR(20)  NOT NULL,
    fail_reason   TEXT,
    submit_time   BIGINT,
    start_time    BIGINT,
    finish_time   BIGINT,
    progress      VARCHAR(20),
    properties    JSON,
    private_data  JSON,
    data          JSON,

    -- ========== 灵镜业务字段 ==========
    refund_log_id INT          DEFAULT 0,
    timeout_at    BIGINT,

    INDEX idx_status_timeout (status, timeout_at),
    INDEX idx_user_created   (user_id, created_at DESC),
    INDEX idx_channel_status (channel_id, status),
    INDEX idx_task_id        (task_id),
    INDEX idx_platform       (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.2 Status 枚举（字符串，避免 iota 漂移 → [[feedback_oneapi_field_semantics]]）

```go
type TaskStatus string
const (
    TaskStatusNotStart   TaskStatus = "NOT_START"
    TaskStatusSubmitted  TaskStatus = "SUBMITTED"
    TaskStatusQueued     TaskStatus = "QUEUED"
    TaskStatusInProgress TaskStatus = "IN_PROGRESS"
    TaskStatusSuccess    TaskStatus = "SUCCESS"
    TaskStatusFailure    TaskStatus = "FAILURE"
    TaskStatusUnknown    TaskStatus = "UNKNOWN"
    TaskStatusTimeout    TaskStatus = "TIMEOUT"  // 灵镜新增，走 failure 退款路径
)
```

### 3.3 现有表 `quota_log` 唯一改动

```sql
ALTER TABLE quota_log ADD COLUMN task_id VARCHAR(191) NULL DEFAULT NULL AFTER token_name;
ALTER TABLE quota_log ADD INDEX idx_task_id (task_id);
```

—— 老代码写入时不填，读出 NULL，对现有同步消费完全无影响。

### 3.4 状态 / 流水关联

```
SUBMITTED  →  quota_log: type=PRE_CONSUME, quota=-预扣额, task_id=xxx
SUCCESS    →  quota_log: type=CONSUME,     quota=±差额,   task_id=xxx (consume_quota 内触发 referral)
FAILURE    →  quota_log: type=REFUND,      quota=+预扣额, task_id=xxx (refund_quota，不触 referral)
TIMEOUT    →  同 FAILURE
```

### 3.5 数据保留策略

| 状态 | 保留 | 清理 |
|---|---|---|
| `SUCCESS` / `FAILURE` / `TIMEOUT` | 30 天 (`TASK_RETENTION_DAYS`) | worker 凌晨 3 点物理删除 |
| `SUBMITTED` / `QUEUED` / `IN_PROGRESS` | 无限（直到 worker 转 TIMEOUT） | 不清理 |

`quota_log.task_id` 字段永久保留（审计需求）。

---

## 4. API 接口契约

### 4.1 提交任务 — `POST /v1/images/generations`

**请求**（OpenAI 标准，model 名决定走同步还是异步）：

```json
{
  "model": "gpt-image-2",
  "prompt": "a corgi on the moon",
  "n": 1,
  "size": "16:9",
  "resolution": "2k"
}
```

**异步响应**（channel.Type ∈ {42, 43, ...}）：

```json
HTTP 200
{
  "created": 1747156804,
  "data": [{"task_id": "task_01KPQ7J7DWB7QZ3WCEK3YVPBRA", "status": "submitted"}]
}
```

**同步响应**（channel.Type ∈ {1, 24, ...}，行为不变）：

```json
HTTP 200
{
  "created": 1747156804,
  "data": [{"url": "https://..."}]
}
```

→ 客户端通过返回里有没有 `task_id` 字段决定是否走轮询。

### 4.2 查询任务 — `GET /v1/tasks/{task_id}`

```json
HTTP 200
{
  "id": "task_01KPQ7J7DWB7QZ3WCEK3YVPBRA",
  "object": "task",
  "status": "completed",
  "progress": 100,
  "created_at": 1747156804,
  "started_at": 1747156810,
  "completed_at": 1747156852,
  "model": "gpt-image-2",
  "result": {
    "images": [{"url": "https://...", "expires_at": 1747243204}]
  },
  "error": null,
  "usage": {"cost_quota": 1056, "cost_usd": 0.05279}
}
```

> `cost_usd` = `cost_quota / 500000`（沿用 [[feedback_oneapi_field_semantics]] 中 quota 与美元的换算）；`cost_quota` 来源是 `consume_quota` 实际写入 `quota_log` 的值。

**鉴权**：普通 token 只查自己 user_id 的任务（404 屏蔽他人）；admin 可查任意。

### 4.3 批量查询 — `POST /v1/tasks/batch`

```json
{"task_ids": ["task_xxx", "task_yyy"]}
→ {"data": [{...}, {...}]}
```

playground 多任务并行轮询时合并请求。

### 4.4 取消任务 — `POST /v1/tasks/{task_id}/cancel`

仅 `submitted/queued/in_progress` 时有效；状态转 FAILURE + reason="user_canceled" → 全退。

### 4.5 admin 接口

```
GET    /api/admin/tasks                 列表（分页 + 筛选 user/channel/status/platform/keyword）
GET    /api/admin/tasks/{id}            详情
POST   /api/admin/tasks/{id}/retry      重置 FAILURE/TIMEOUT 为 SUBMITTED 重新 fetch
POST   /api/admin/tasks/{id}/refund     已 SUCCESS 但用户投诉无图，手动退款
```

鉴权走 Cookie session ([[feedback_auth_cookie]])。

### 4.6 路由 dispatcher 改动

```go
// router/relay.go
imageGroup.POST("/generations", controller.RelayImage)  // 现有，不动

if config.EnableTaskSystem {
    apiGroup.GET ("/v1/tasks/:id",          controller.GetTask)
    apiGroup.POST("/v1/tasks/batch",        controller.GetTasksBatch)
    apiGroup.POST("/v1/tasks/:id/cancel",   controller.CancelTask)
    adminGroup.GET ("/tasks",               controller.AdminListTasks)
    adminGroup.GET ("/tasks/:id",           controller.AdminGetTask)
    adminGroup.POST("/tasks/:id/retry",     controller.AdminRetryTask)
    adminGroup.POST("/tasks/:id/refund",    controller.AdminRefundTask)
}

// controller/relay.go: RelayImage
//   - relayTaskImage: 新写，落 tasks 表 + 提交上游 + 立即返回 task_id
//   - relayImageSync: 把现有 RelayImage 函数体原样抽出来命名（行为不变）
func RelayImage(c *gin.Context) {
    channel := lookupChannelForModel(model)
    if config.EnableTaskSystem && isAsyncTaskType(channel.Type) {
        relayTaskImage(c, channel)
        return
    }
    relayImageSync(c, channel)  // 现有流程完全不变
}
```

---

## 5. Worker / 状态机 / 错误处理

### 5.1 Worker 总体

- 单 goroutine，由 `service/task_worker.go` 在 main.go init 阶段启动
- `ENABLE_TASK_SYSTEM=off` 时不启动
- env：`TASK_WORKER_INTERVAL=5s`、`TASK_WORKER_BATCH_SIZE=50`、`TASK_TIMEOUT_MINUTES=10`、`TASK_RETENTION_DAYS=30`、`TASK_UPSTREAM_HTTP_TIMEOUT=30s`、`TASK_MAX_FETCH_ERRORS=5`

### 5.2 每轮 `tick()`

1. **超时回收**：把 timeout_at < now 的 SUBMITTED/QUEUED/IN_PROGRESS/UNKNOWN 转 TIMEOUT，触发 refund
2. **fetch**：选最多 50 个待处理任务，按 platform 分桶，每 platform 5 并发上限
3. **清理**：凌晨 3 点物理删除 30 天前的完成任务

### 5.3 状态机

```
             ┌─────────────┐
             │  SUBMITTED  │
             └──────┬──────┘
                    │ fetch
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ QUEUED  │ │ IN_PROG │ │ SUCCESS │ │ FAILURE │
   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
        └────fetch──┘           ▼           │
                          consume_quota     ▼
                            (referral)  refund_quota
                                       (不触 referral)

   任何状态 → timeout_at 到期 → TIMEOUT → refund_quota
   fetch 累计错误 ≥ 5 (Redis) → 强制 FAILURE → refund_quota
```

### 5.4 错误处理与重试

| 场景 | 行为 |
|---|---|
| 上游 200 但响应不能 unmarshal 为已知 status | Redis 错误计数 +1，继续 fetch |
| 上游 5xx | 错误计数 +1，继续 fetch |
| 上游 429 | 错误计数 +1，该 platform 本轮整批跳过 |
| 上游 401/403 (key 失效) | 错误计数 +1，admin 渠道列表标红 |
| HTTP timeout 30s | 错误计数 +1 |
| 错误计数 ≥ 5 | 强制 FAILURE + refund |
| `now ≥ timeout_at` | TIMEOUT + refund |
| admin retry | 清 Redis 计数、status=SUBMITTED、timeout_at=now+10min |

**错误计数存储**：Redis key `task:fetch_errors:{task_id}` TTL 1 小时。

### 5.5 并发安全

- 单 worker 单实例，无 race
- admin retry vs worker fetch 同行：`SELECT ... FOR UPDATE` 锁行
- 多容器部署是未来工作（届时加 `worker_lock` 心跳表，约 50 行代码）

### 5.6 日志

```
[INFO] task submit  task_id=xxx user_id=22 channel=16 quota=1056
[INFO] task fetch   task_id=xxx status=in_progress progress=50
[INFO] task done    task_id=xxx status=success cost_quota=1102 diff=+46
[INFO] task refund  task_id=xxx reason=upstream_failed refund=1056
[ERROR] task fetch error task_id=xxx attempt=3/5 err=...
```

---

## 6. 前端 / Admin UI

### 6.1 Playground "异步生成" tab

- 位置：playground 顶部 tab 加一项 "异步生成"，跟"聊天"/"画图"平级
- 风格：森林科技风（深绿 #0D1F14 + 翠绿 #2ECC71），禁蓝紫禁 AI emoji ([[feedback_ui_forest_style]])
- 任务列表：仅 session 内存，最多 20 个，刷新即丢 ([[project_playground]])
- 轮询：提交后延迟 5s 首查，之后 3s 一次 `POST /v1/tasks/batch`
- 进度条：从 `progress` 字段取 0-100
- 图片显示：直接用上游 URL（不镜像 OSS），标注 "24h 内下载"
- 下载：`<a download>` 强制保存
- 取消：调 `POST /v1/tasks/{id}/cancel`，前端立即停轮询
- 预估扣费：模型价显 $ ([[feedback_currency_display]])
- 余额校验：前端拦截不足
- 鉴权：Cookie session、withCredentials ([[feedback_auth_cookie]])

### 6.2 Admin 任务管理页

路由 `/admin/tasks`，左侧菜单"日志管理"下加"异步任务"。

- 列表：分页 + 筛选 platform/status/user/keyword
- 详情弹窗：格式化 JSON 显示 `private_data` / `data`、`quota_log` 关联、`refund_log_id` 跳转
- 重试：仅 FAILURE/TIMEOUT 可见
- 退款：仅 SUCCESS 可见，要求填 reason，二次确认
- 删除：物理删除，二次确认
- 额度显示：消费/退款显 ¥ ([[feedback_currency_display]])

### 6.3 Admin 首页统计卡片（可选 +3 分钟）

```
异步任务（24h）
─────────────────────
提交 245   成功 218   失败 27
平均耗时 51s    退款 ¥X.XX
```

---

## 7. 部署 / 回滚

### 7.1 Phase 0 — DB 迁移（feature flag OFF）

```sql
CREATE TABLE tasks (...);
ALTER TABLE quota_log ADD COLUMN task_id VARCHAR(191) NULL DEFAULT NULL;
ALTER TABLE quota_log ADD INDEX idx_task_id (task_id);
```

零风险：新表 + 一个可空字段。

### 7.2 Phase 1 — 代码部署（feature flag 仍 OFF）

```bash
cd /root/lingjing-ai
git pull origin main
docker build -t lingjing-api:vYYYYMMDD-task backend/
docker tag lingjing-api:latest lingjing-api:rollback-task-pre
docker tag lingjing-api:vYYYYMMDD-task lingjing-api:latest
cd one-api && docker compose up -d --force-recreate one-api
```

此时与老版本字节级等价（flag OFF）。

### 7.3 Phase 2 — 灰度开关

```bash
# .env 改一行
ENABLE_TASK_SYSTEM=on
cd one-api && docker compose up -d --force-recreate one-api
```

worker 启动、路由生效。

### 7.4 Phase 3 — 上架第一个异步渠道

admin 后台新建 ApiMart 渠道，group=admin 内部测试，通过后改 group=default。

### 7.5 回滚预案

| 级别 | 操作 | 时长 |
|---|---|---|
| L1 channel 异常 | admin → 禁用该 channel | 10 秒 |
| L2 worker 跑飞 | `.env` 改 `ENABLE_TASK_SYSTEM=off` + 重启 | 2 分钟 |
| L3 代码 bug | `docker tag lingjing-api:rollback-task-pre lingjing-api:latest` + 重启 | 30 秒 |
| L4 DB 改动 | 保留 `tasks` 表 + `quota_log.task_id` 字段；都是新增物，对老代码透明 | 无需回滚 |

---

## 8. 监控 / 告警

| 项 | 实现 | 阈值 |
|---|---|---|
| 退款 / 失败激增 | `docker logs --since 5m \| grep -E "task refund\|fetch_max_retries" \| wc -l` | 5 分钟 > 10 条告警 |
| stuck 任务堆积 | `SELECT COUNT(*) FROM tasks WHERE status='IN_PROGRESS' AND submit_time < UNIX_TIMESTAMP()-300` | > 20 告警 |
| Admin 首页统计 | 24h 提交 / 成功 / 失败 / 平均耗时 / 退款金额 | 仅展示 |

告警通道：复用现有（待 user 确认 Slack / 微信 webhook 哪种）。

---

## 9. 工期估算

| 阶段 | 工作 | 工期 |
|---|---|---|
| Phase A | 移植 `taskcommon/` + DB migration + `quota_log.task_id` | 0.5 天 |
| Phase B | 移植 `apimart/` adaptor + 单元测试 | 1 天 |
| Phase C | 移植 `jimeng/` adaptor（含 HMAC-SHA256 签名）+ 测试 | 1 天 |
| Phase D | TaskWorker + Redis 错误计数 + 超时回收 | 1 天 |
| Phase E | controller (RelayTaskImage / GetTask / batch / cancel / admin) | 0.5 天 |
| Phase F | `refund_quota` 函数 + `consume_quota` 多退少补适配 | 0.5 天 |
| Phase G | playground 异步 tab UI + 轮询 | 0.5 天 |
| Phase H | admin 任务管理页 UI | 0.5 天 |
| Phase I | E2E 测试 + feature flag 部署 SOP 写到 `scripts/deploy-task-system.sh` | 0.5 天 |
| **总计** | | **6 天** |

工期含测试 + 文档，不含 user 自测和上线灰度。

---

## 10. 风险 / 未决问题

| # | 风险 | 缓解 |
|---|---|---|
| 1 | 上游 apimart 改协议 | 各 adaptor 独立，单点替换；admin 可一键禁该 channel |
| 2 | worker 崩溃 stuck 任务 | 重启自动接管；超时机制兜底（10 分钟自动 TIMEOUT 退款）|
| 3 | 多退少补 race（worker 跟 admin 同时改 quota） | DB transaction + SELECT FOR UPDATE |
| 4 | Redis 挂导致错误计数丢 | 计数清零最多让任务多跑 5 轮 fetch，业务无损 |
| 5 | `quota_log.task_id` 字段对老代码污染 | 字段可空，老 gorm 模型可选择不映射；上线前 dry run 确认 |
| 6 | 告警通道未定 | 待 user 确认 Slack / 微信 webhook |

---

## 11. 后续工作（不在本次范围）

- 多容器部署 → 加 `worker_lock` 心跳表（~50 行代码 ~1 小时）
- 接入更多 adaptor（kling / sora / suno / hailuo / vidu / midjourney）→ 每个 ~1 天
- 自家 OSS 镜像图片 / 永久 URL → 涉及合规和成本，单独立项

---

## 12. 决策审计 trail

| 日期 | 决策 | 变更 |
|---|---|---|
| 2026-05-13 | 移植范围 = framework + apimart + jimeng | 初稿 |
| 2026-05-13 | API 风格 = OpenAI 风格 | 初稿 |
| 2026-05-13 | DB schema = 完全照 New API | 初稿 |
| 2026-05-13 | 计费时机 = 预扣 + 多退少补 + 失败全退 | 初稿 |
| 2026-05-13 | fetch_error 计数存 Redis | 初稿 |
| 2026-05-13 | 单 worker，暂不做分布式 | 初稿 |
