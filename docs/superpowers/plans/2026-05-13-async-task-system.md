# 异步任务系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移植 New API 的 task 子系统到灵镜 AI，支持异步图像/视频任务（apimart、jimeng 等），不破坏现有同步图像 / 聊天功能。

**Architecture:** 在 `relay/adaptor/task/` 下新增独立 TaskAdaptor 抽象 + 共享 worker；通过 `ENABLE_TASK_SYSTEM` env 总开关控制。Feature flag OFF 时 worker 不启动、路由不注册、`relayImage` 的 if 分支永远 false，跟现有版本字节级等价。

**Tech Stack:** Go 1.22 + gorm v2 + gin + MySQL 8 + Redis 7 + React (frontend) + Semi-design (admin)。模块名 `github.com/songquanpeng/one-api`（灵镜保留 One API 原 module path）。

**Spec:** `docs/superpowers/specs/2026-05-13-async-task-system-design.md`

---

## 关键约定（所有 Phase 通用）

- **Go module path**: `github.com/songquanpeng/one-api/...`
- **测试框架**: `github.com/stretchr/testify/assert` + `require`（项目已依赖 v1.9.0）
- **DB 迁移**: gorm AutoMigrate，写在 `model/main.go:158-234` 已有的 AutoMigrate 序列里
- **Channel Type 分配**: 现有最大 56（Dummy），本次分配 `ApiMart=57`、`Jimeng=58`
- **新增目录根**: `backend/relay/adaptor/task/`（跟 `relay/adaptor/openai/` 平级，**注意是 adaptor 不是 channel**——灵镜叫 adaptor，跟 New API 的 channel 不同）
- **commit 规范**: 每个 Step 5 commit 一次；用 `feat(task): xxx` / `test(task): xxx` / `chore(task): xxx` 前缀
- **不破坏现有**: 任何 Phase 都不删除/重命名/改签名既有函数；只新增或在末尾追加

---

## 目录 / 文件结构总览（Phase A 完成后建立完）

```
backend/
├── common/config/config.go                     [+]  新增 env 变量
├── model/
│   ├── task.go                                 [N]  Task struct + CRUD
│   ├── log.go                                  [+]  Log struct 加 TaskId 字段
│   └── main.go                                 [+]  AutoMigrate 加 &Task{}
├── relay/
│   ├── channeltype/define.go                   [+]  加 ApiMart=57, Jimeng=58
│   ├── adaptor/task/
│   │   ├── common/
│   │   │   ├── interface.go                    [N]  TaskAdaptor 接口
│   │   │   ├── status.go                       [N]  TaskStatus 枚举
│   │   │   ├── relay_info.go                   [N]  relay-info 上下文
│   │   │   └── http.go                         [N]  共享 HTTP 客户端
│   │   ├── apimart/
│   │   │   ├── adaptor.go                      [N]  ~250 行
│   │   │   ├── model.go                        [N]  请求/响应 DTO
│   │   │   └── adaptor_test.go                 [N]  单元测试
│   │   └── jimeng/
│   │       ├── adaptor.go                      [N]  ~400 行（含 HMAC-SHA256）
│   │       ├── sign.go                          [N]  签名工具
│   │       ├── model.go                         [N]  DTO
│   │       └── adaptor_test.go                  [N]
│   └── billing/
│       └── task_billing.go                     [N]  PreConsume/Refund/ConsumeDiff
├── controller/
│   ├── task.go                                  [N]  GET/Batch/Cancel
│   ├── task_relay.go                            [N]  relayTaskImage
│   ├── admin_task.go                            [N]  admin 5 个接口
│   └── relay.go                                 [+]  RelayImage 加 if 分支
├── service/
│   └── task_worker.go                           [N]  worker goroutine + Redis 计数
├── router/
│   ├── relay.go                                 [+]  注册 /v1/tasks/*
│   └── api.go                                   [+]  注册 admin /tasks/*
└── main.go                                      [+]  init 阶段启动 worker

frontend/src/pages/Playground/
├── AsyncTaskTab.jsx                             [N]  异步生成 tab 主组件
├── TaskCard.jsx                                 [N]  单任务卡片
└── api/taskApi.js                               [N]  /v1/tasks/* 调用封装

admin/src/pages/
└── Tasks/
    ├── index.jsx                                [N]  列表页
    ├── TaskDetailDialog.jsx                     [N]
    └── api/taskApi.js                           [N]

scripts/
└── deploy-task-system.sh                        [N]  Phase 部署 SOP

docs/superpowers/
├── specs/2026-05-13-async-task-system-design.md [已存在]
└── plans/2026-05-13-async-task-system.md        [本文件]
```

`[N]` = 新建文件，`[+]` = 修改既有文件。

---

# Phase A — DB Schema & Channel Type 常量（0.5 天）

**前置条件**:
- `~/lingjing-ai/` 工作树干净（`git status` 无未提交）
- MySQL 容器跑着（`docker ps | grep one-api-mysql`）
- 开发环境能跑 `go test ./...`

**验收标准**:
- `go test ./model/... -run TestTask` 通过
- 启动 backend 时 AutoMigrate 自动建 `tasks` 表 + 给 `logs` 表加 `task_id` 列
- channel 编辑页能在下拉里看到 ApiMart(57) / Jimeng(58)
- 现有功能（gpt-image-1 同步图像、chat completions）回归通过

**回滚**: `git revert <phase-A-commits>` + `ALTER TABLE logs DROP COLUMN task_id`（生产 DB 改了的话）

---

### Task A1: 新增 channel type 常量

**Files:**
- Modify: `backend/relay/channeltype/define.go`
- Test: `backend/relay/channeltype/define_test.go`（新建）

- [ ] **Step 1: 看一眼现有常量定义找到最大值**

Run: `grep -n "Dummy" backend/relay/channeltype/define.go`
Expected: 看到 `Dummy = 56`（或类似行）

- [ ] **Step 2: 写失败测试**

Create `backend/relay/channeltype/define_test.go`:

```go
package channeltype

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAsyncTaskChannelTypes(t *testing.T) {
	assert.Equal(t, 57, ApiMart, "ApiMart channel type must be 57")
	assert.Equal(t, 58, Jimeng, "Jimeng channel type must be 58")
}
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && go test ./relay/channeltype/ -run TestAsyncTaskChannelTypes`
Expected: FAIL with "undefined: ApiMart" / "undefined: Jimeng"

- [ ] **Step 4: 在 define.go 末尾加常量**

Edit `backend/relay/channeltype/define.go`，在 `Dummy = 56` 行的下面（保持 iota 连续性，但用显式数字避免漂移 → spec 决策点 11/feedback_oneapi_field_semantics）：

```go
// 现有最后一行示意:
//   Dummy = 56
// ↓ 在 const ( ... ) 块的最后一行 Dummy 之后追加：

	ApiMart = 57 // 异步任务图像中转（apimart.ai 协议）
	Jimeng  = 58 // 字节即梦异步图像/视频
```

如果现有 const 块是 iota 推进风格，**改成显式数字赋值**，把 Dummy 也固化成 56；或在 Dummy 之后用 `_ = iota + xxx` 显式跳过——具体看实际定义。

- [ ] **Step 5: 跑测试通过 + 跑现有测试无回归 + commit**

```bash
cd backend
go test ./relay/channeltype/...
go build ./...
git add relay/channeltype/define.go relay/channeltype/define_test.go
git commit -m "feat(task): add ApiMart(57) / Jimeng(58) channel types"
```
Expected: 所有测试 PASS、build 成功

---

### Task A2: 新增 Task 数据模型

**Files:**
- Create: `backend/model/task.go`
- Create: `backend/model/task_test.go`

- [ ] **Step 1: 写失败测试（TaskStatus 枚举 + Task struct 字段）**

Create `backend/model/task_test.go`:

```go
package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTaskStatusConstants(t *testing.T) {
	assert.Equal(t, "SUBMITTED", string(TaskStatusSubmitted))
	assert.Equal(t, "IN_PROGRESS", string(TaskStatusInProgress))
	assert.Equal(t, "SUCCESS", string(TaskStatusSuccess))
	assert.Equal(t, "FAILURE", string(TaskStatusFailure))
	assert.Equal(t, "TIMEOUT", string(TaskStatusTimeout))
}

func TestTaskJSONFields(t *testing.T) {
	task := Task{
		TaskID:    "task_test_001",
		Platform:  "apimart",
		UserId:    22,
		ChannelId: 16,
		Status:    TaskStatusSubmitted,
		Quota:     1056,
	}
	b, err := json.Marshal(task)
	assert.NoError(t, err)
	var m map[string]interface{}
	_ = json.Unmarshal(b, &m)
	assert.Equal(t, "task_test_001", m["task_id"])
	assert.Equal(t, "apimart", m["platform"])
	assert.Equal(t, "SUBMITTED", m["status"])
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && go test ./model/ -run TestTask`
Expected: FAIL with "undefined: Task" / "undefined: TaskStatusSubmitted"

- [ ] **Step 3: 实现 model/task.go**

Create `backend/model/task.go`:

```go
package model

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

type TaskStatus string

const (
	TaskStatusNotStart   TaskStatus = "NOT_START"
	TaskStatusSubmitted  TaskStatus = "SUBMITTED"
	TaskStatusQueued     TaskStatus = "QUEUED"
	TaskStatusInProgress TaskStatus = "IN_PROGRESS"
	TaskStatusSuccess    TaskStatus = "SUCCESS"
	TaskStatusFailure    TaskStatus = "FAILURE"
	TaskStatusUnknown    TaskStatus = "UNKNOWN"
	TaskStatusTimeout    TaskStatus = "TIMEOUT"
)

// TaskProperties 任务属性（业务无关元数据，写到 properties 列）
type TaskProperties struct {
	Input             string `json:"input"`
	UpstreamModelName string `json:"upstream_model_name,omitempty"`
	OriginModelName   string `json:"origin_model_name,omitempty"`
}

// Scan / Value for gorm JSON 序列化
func (p *TaskProperties) Scan(v interface{}) error {
	if v == nil {
		return nil
	}
	return json.Unmarshal(v.([]byte), p)
}
func (p TaskProperties) Value() (driver.Value, error) { return json.Marshal(p) }

// TaskPrivateData 任务私有数据（含上游 key、billing 上下文，写到 private_data 列）
type TaskPrivateData struct {
	UpstreamTaskID string                 `json:"upstream_task_id,omitempty"`
	ResultURL      string                 `json:"result_url,omitempty"`
	TokenId        int                    `json:"token_id,omitempty"`
	BillingContext map[string]interface{} `json:"billing_context,omitempty"`
}

func (p *TaskPrivateData) Scan(v interface{}) error {
	if v == nil {
		return nil
	}
	return json.Unmarshal(v.([]byte), p)
}
func (p TaskPrivateData) Value() (driver.Value, error) { return json.Marshal(p) }

type Task struct {
	ID            int64           `json:"id" gorm:"primary_key;AUTO_INCREMENT"`
	CreatedAt     int64           `json:"created_at" gorm:"index"`
	UpdatedAt     int64           `json:"updated_at"`
	TaskID        string          `json:"task_id" gorm:"type:varchar(191);uniqueIndex;not null"`
	Platform      string          `json:"platform" gorm:"type:varchar(30);index;not null"`
	UserId        int             `json:"user_id" gorm:"index;not null"`
	Group         string          `json:"group" gorm:"type:varchar(50);column:group"`
	ChannelId     int             `json:"channel_id" gorm:"index;not null"`
	Quota         int             `json:"quota" gorm:"not null;default:0"`
	Action        string          `json:"action" gorm:"type:varchar(40);index"`
	Status        TaskStatus      `json:"status" gorm:"type:varchar(20);index;not null"`
	FailReason    string          `json:"fail_reason" gorm:"type:text"`
	SubmitTime    int64           `json:"submit_time"`
	StartTime     int64           `json:"start_time"`
	FinishTime    int64           `json:"finish_time"`
	Progress      string          `json:"progress" gorm:"type:varchar(20)"`
	Properties    TaskProperties  `json:"properties" gorm:"type:json"`
	PrivateData   TaskPrivateData `json:"-" gorm:"type:json;column:private_data"`
	Data          json.RawMessage `json:"data" gorm:"type:json"`
	RefundLogId   int             `json:"refund_log_id" gorm:"default:0"`
	TimeoutAt     int64           `json:"timeout_at" gorm:"index"`
}

func (Task) TableName() string { return "tasks" }

// BeforeCreate / BeforeUpdate hooks 维护 created_at / updated_at
func (t *Task) BeforeCreate(tx *gorm.DB) error {
	now := time.Now().Unix()
	if t.CreatedAt == 0 {
		t.CreatedAt = now
	}
	t.UpdatedAt = now
	if t.SubmitTime == 0 {
		t.SubmitTime = now
	}
	return nil
}

func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	t.UpdatedAt = time.Now().Unix()
	return nil
}

// CreateTask insert + 返回 ID
func CreateTask(t *Task) error {
	return DB.Create(t).Error
}

// GetTaskByTaskID 主查询路径
func GetTaskByTaskID(taskID string) (*Task, error) {
	var t Task
	err := DB.Where("task_id = ?", taskID).First(&t).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// GetUserTask 含 user_id 鉴权过滤（普通 token 走这个）
func GetUserTask(userId int, taskID string) (*Task, error) {
	var t Task
	err := DB.Where("task_id = ? AND user_id = ?", taskID, userId).First(&t).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// ListPendingTasks worker 主查询
func ListPendingTasks(limit int) ([]Task, error) {
	var tasks []Task
	pending := []TaskStatus{TaskStatusSubmitted, TaskStatusQueued, TaskStatusInProgress, TaskStatusUnknown}
	err := DB.Where("status IN ? AND timeout_at >= ?", pending, time.Now().Unix()).
		Order("updated_at ASC").
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

// ListTimeoutTasks 找出已超时未结束的任务
func ListTimeoutTasks(limit int) ([]Task, error) {
	var tasks []Task
	pending := []TaskStatus{TaskStatusSubmitted, TaskStatusQueued, TaskStatusInProgress, TaskStatusUnknown}
	err := DB.Where("status IN ? AND timeout_at < ?", pending, time.Now().Unix()).
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

// UpdateTaskStatus 原子状态转换（用 SELECT FOR UPDATE 防 admin retry 跟 worker fetch 同时改）
func UpdateTaskStatus(tx *gorm.DB, taskID string, updates map[string]interface{}) error {
	return tx.Model(&Task{}).Where("task_id = ?", taskID).Updates(updates).Error
}

// CleanOldTasks 删除 N 天前的已完成任务
func CleanOldTasks(retentionDays int) (int64, error) {
	cutoff := time.Now().Unix() - int64(retentionDays*86400)
	done := []TaskStatus{TaskStatusSuccess, TaskStatusFailure, TaskStatusTimeout}
	res := DB.Where("status IN ? AND finish_time < ?", done, cutoff).Delete(&Task{})
	return res.RowsAffected, res.Error
}
```

> 注：`driver.Value` 需要 `database/sql/driver` 导入。如果项目里其他 model 文件已有类似 JSON 序列化模式，照着抄；否则在文件顶部加 `import "database/sql/driver"`。

- [ ] **Step 4: 跑测试通过**

Run: `cd backend && go test ./model/ -run TestTask -v`
Expected: 2 个测试 PASS

- [ ] **Step 5: build 通过 + commit**

```bash
cd backend && go build ./... && cd ..
git add backend/model/task.go backend/model/task_test.go
git commit -m "feat(task): add Task model with status enum and CRUD helpers"
```

---

### Task A3: Log struct 加 TaskId 字段（quota_log 关联）

**Files:**
- Modify: `backend/model/log.go`
- Test: `backend/model/log_test.go`

- [ ] **Step 1: 写失败测试**

Edit `backend/model/log_test.go`（已有就追加，没有就新建）:

```go
package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLogHasTaskIdField(t *testing.T) {
	l := Log{TaskId: "task_xxx"}
	assert.Equal(t, "task_xxx", l.TaskId)
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && go test ./model/ -run TestLogHasTaskIdField`
Expected: FAIL "unknown field 'TaskId' in struct literal"

- [ ] **Step 3: 在 Log struct 末尾加字段**

打开 `backend/model/log.go`，找到 `type Log struct { ... }` 块的最后一个字段，在它后面追加：

```go
	// 异步任务关联（feature: async task system）
	// 同步消费记录此字段为空字符串
	TaskId string `json:"task_id" gorm:"type:varchar(191);index;default:''"`
```

- [ ] **Step 4: 跑测试通过 + 现有 log 相关测试无回归**

```bash
cd backend && go test ./model/ -v
```

Expected: 所有 PASS

- [ ] **Step 5: commit**

```bash
git add backend/model/log.go backend/model/log_test.go
git commit -m "feat(task): add TaskId field to Log model for async task audit trail"
```

---

### Task A4: AutoMigrate 注册 Task

**Files:**
- Modify: `backend/model/main.go`

- [ ] **Step 1: 找现有 AutoMigrate 块**

Run: `grep -n "AutoMigrate" backend/model/main.go`
Expected: 看到形如 `err = DB.AutoMigrate(&Channel{}, &Token{}, &User{}, ...)` 一行

- [ ] **Step 2: 在 AutoMigrate 参数列表末尾追加 &Task{}**

编辑那一行，在最后一个 `&...{}` 后加 `, &Task{}`。例如：

修改前：
```go
err = DB.AutoMigrate(&Channel{}, &Token{}, &User{}, &Option{}, &Redemption{}, &Ability{}, &Log{})
```

修改后：
```go
err = DB.AutoMigrate(&Channel{}, &Token{}, &User{}, &Option{}, &Redemption{}, &Ability{}, &Log{}, &Task{})
```

- [ ] **Step 3: 重启 backend 确认表自动建出来**

```bash
# 本地 docker 化测试 DB
cd backend && go run main.go &
sleep 5
# 进 mysql 看表
docker exec one-api-mysql mysql -uroot -p<密码> oneapi -e "SHOW TABLES LIKE 'tasks';" 
docker exec one-api-mysql mysql -uroot -p<密码> oneapi -e "DESC tasks;"
docker exec one-api-mysql mysql -uroot -p<密码> oneapi -e "SHOW COLUMNS FROM logs WHERE Field='task_id';"
kill %1
```

Expected: `tasks` 表存在，含 spec Section 3.1 所有字段；`logs.task_id` 列存在。

- [ ] **Step 4: commit**

```bash
git add backend/model/main.go
git commit -m "feat(task): register Task model with gorm AutoMigrate"
```

- [ ] **Step 5: 回归验证现有同步功能**

```bash
# 起服务，测同步图像（沿用昨天的 admin token）
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"hi"}]}'
```

Expected: 200，正常返回 — 证明 schema 改动对现有路径无影响。

---

# Phase B — ApiMart Adaptor（1 天）

**前置条件**: Phase A 完成 + `tasks` 表已建好

**验收标准**:
- `go test ./relay/adaptor/task/apimart/...` 全 PASS
- TaskAdaptor 接口完整定义在 `relay/adaptor/task/common/interface.go`
- 用 mock HTTP server 能跑通 Submit → FetchTask 全链路

**回滚**: `git revert <phase-B-commits>` 删除 `relay/adaptor/task/` 目录

---

### Task B1: TaskAdaptor 接口定义 + 共享类型

**Files:**
- Create: `backend/relay/adaptor/task/common/interface.go`
- Create: `backend/relay/adaptor/task/common/relay_info.go`
- Create: `backend/relay/adaptor/task/common/http.go`
- Create: `backend/relay/adaptor/task/common/interface_test.go`

- [ ] **Step 1: 写失败测试（接口可被实现）**

Create `backend/relay/adaptor/task/common/interface_test.go`:

```go
package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// 编译期断言：任何实现 TaskAdaptor 的类型必须有这些方法
type stubAdaptor struct{}

func (s *stubAdaptor) Init(info *TaskRelayInfo)                                {}
func (s *stubAdaptor) ValidateRequest(info *TaskRelayInfo) error               { return nil }
func (s *stubAdaptor) BuildRequestURL(info *TaskRelayInfo) (string, error)     { return "", nil }
func (s *stubAdaptor) BuildRequestHeader(info *TaskRelayInfo) (map[string]string, error) {
	return nil, nil
}
func (s *stubAdaptor) BuildRequestBody(info *TaskRelayInfo) ([]byte, error)    { return nil, nil }
func (s *stubAdaptor) DoRequest(info *TaskRelayInfo, body []byte) (taskID string, raw []byte, err error) {
	return "", nil, nil
}
func (s *stubAdaptor) FetchTask(info *TaskRelayInfo, taskID string) (*FetchResult, error) {
	return nil, nil
}

func TestStubImplementsTaskAdaptor(t *testing.T) {
	var _ TaskAdaptor = &stubAdaptor{}
	assert.True(t, true, "stub must satisfy TaskAdaptor")
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && go test ./relay/adaptor/task/common/ -run TestStubImplementsTaskAdaptor`
Expected: FAIL "undefined: TaskAdaptor"

- [ ] **Step 3: 写 interface.go**

Create `backend/relay/adaptor/task/common/interface.go`:

```go
package common

// FetchResult 是 worker 调 FetchTask 后的标准化返回
type FetchResult struct {
	Status   string `json:"status"`   // submitted/queued/processing/completed/failed
	Progress string `json:"progress"` // "0".."100"
	// Result 是上游成功时的完整响应（含图 URL / b64 等），原样存到 tasks.data
	Result []byte `json:"result"`
	// FailReason 上游失败时的错误描述
	FailReason string `json:"fail_reason"`
}

// TaskAdaptor 异步任务适配器接口。每个上游（apimart, jimeng, ...）实现一份。
type TaskAdaptor interface {
	// Init 初始化（从 channel.Key / channel.BaseURL 取配置）
	Init(info *TaskRelayInfo)

	// ValidateRequest 验证客户端入参（model 是否合法 / prompt 是否空 / size 是否支持）
	ValidateRequest(info *TaskRelayInfo) error

	// BuildRequestURL 构造上游 submit URL
	BuildRequestURL(info *TaskRelayInfo) (string, error)

	// BuildRequestHeader 构造请求头（含鉴权、Content-Type）
	BuildRequestHeader(info *TaskRelayInfo) (map[string]string, error)

	// BuildRequestBody 把客户端请求转成上游 payload
	BuildRequestBody(info *TaskRelayInfo) ([]byte, error)

	// DoRequest 真实发请求；返回上游 task_id + 原始响应 body
	DoRequest(info *TaskRelayInfo, body []byte) (taskID string, raw []byte, err error)

	// FetchTask worker 调用：拉一次任务状态
	FetchTask(info *TaskRelayInfo, taskID string) (*FetchResult, error)
}
```

- [ ] **Step 4: 写 relay_info.go**

Create `backend/relay/adaptor/task/common/relay_info.go`:

```go
package common

// TaskRelayInfo 在 controller / worker / adaptor 之间传递的上下文
type TaskRelayInfo struct {
	UserID    int
	TokenID   int
	ChannelID int

	BaseURL string // channel.BaseURL，例如 https://api.apimart.ai
	APIKey  string // channel.Key

	OriginModelName   string // 客户端请求里的 model，例如 gpt-image-2
	UpstreamModelName string // model_mapping 转换后的上游 model

	// 客户端请求体已 unmarshal 后的字段
	Prompt     string
	Size       string
	Resolution string
	N          int
	ImageURLs  []string

	// 给 adaptor 透传的原始 JSON（用于 BuildRequestBody 不丢字段）
	OriginalRequestBody []byte

	// 灵镜业务：分组 / 计费上下文
	Group string
}
```

- [ ] **Step 5: 写 http.go（共享 HTTP 客户端）**

Create `backend/relay/adaptor/task/common/http.go`:

```go
package common

import (
	"net/http"
	"time"

	"github.com/songquanpeng/one-api/common/config"
)

var sharedClient *http.Client

// HTTPClient 返回共享 HTTP 客户端（超时来自 env TASK_UPSTREAM_HTTP_TIMEOUT）
func HTTPClient() *http.Client {
	if sharedClient == nil {
		sharedClient = &http.Client{Timeout: config.TaskUpstreamHTTPTimeout}
	}
	return sharedClient
}

// DefaultHTTPTimeout 兜底
const DefaultHTTPTimeout = 30 * time.Second
```

- [ ] **Step 6: 测试通过 + commit**

```bash
cd backend && go test ./relay/adaptor/task/common/ -v && go build ./...
git add backend/relay/adaptor/task/common/
git commit -m "feat(task): define TaskAdaptor interface and shared relay-info/http"
```
Expected: TestStubImplementsTaskAdaptor PASS

> 注：`config.TaskUpstreamHTTPTimeout` 还没定义，会编译失败。把它作为 Phase D-1 的一部分提前定义—— 现在临时改成 `30 * time.Second` 硬编码，等 Phase D 再回来串。

Edit `http.go`，先用硬编码：

```go
func HTTPClient() *http.Client {
	if sharedClient == nil {
		sharedClient = &http.Client{Timeout: 30 * time.Second}
	}
	return sharedClient
}
```

并删除 `config` 引用。Step 6 再 commit。

---

### Task B2: ApiMart Adaptor 骨架 + Init/Validate/URL/Header

**Files:**
- Create: `backend/relay/adaptor/task/apimart/model.go`
- Create: `backend/relay/adaptor/task/apimart/adaptor.go`
- Create: `backend/relay/adaptor/task/apimart/adaptor_test.go`

- [ ] **Step 1: 写 model.go（请求/响应 DTO）**

Create `backend/relay/adaptor/task/apimart/model.go`:

```go
package apimart

// SubmitRequest 提交任务请求体（apimart 格式）
type SubmitRequest struct {
	Model      string   `json:"model"`
	Prompt     string   `json:"prompt"`
	N          int      `json:"n,omitempty"`
	Size       string   `json:"size,omitempty"`
	Resolution string   `json:"resolution,omitempty"`
	ImageURLs  []string `json:"image_urls,omitempty"`
}

// SubmitResponse 提交后的异步响应
type SubmitResponse struct {
	Code int `json:"code"`
	Data []struct {
		Status string `json:"status"`
		TaskID string `json:"task_id"`
	} `json:"data"`
	Error *APIError `json:"error,omitempty"`
}

// FetchResponse GET /v1/tasks/{id} 上游返回
type FetchResponse struct {
	Code int `json:"code"`
	Data struct {
		ID            string  `json:"id"`
		Status        string  `json:"status"`        // submitted/processing/completed/failed
		Progress      int     `json:"progress"`
		Created       int64   `json:"created"`
		Completed     int64   `json:"completed"`
		ActualTime    int     `json:"actual_time"`
		Cost          float64 `json:"cost"`
		EstimatedTime int     `json:"estimated_time"`
		Result        struct {
			Images []struct {
				URL       []string `json:"url"`
				ExpiresAt int64    `json:"expires_at"`
			} `json:"images"`
		} `json:"result"`
		Error *APIError `json:"error,omitempty"`
	} `json:"data"`
}

type APIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Type    string `json:"type"`
}
```

- [ ] **Step 2: 写失败测试（Validate / URL / Header）**

Create `backend/relay/adaptor/task/apimart/adaptor_test.go`:

```go
package apimart

import (
	"testing"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newInfo() *common.TaskRelayInfo {
	return &common.TaskRelayInfo{
		BaseURL:         "https://api.apimart.ai",
		APIKey:          "sk-test",
		OriginModelName: "gpt-image-2",
		Prompt:          "a cat",
		Size:            "16:9",
		Resolution:      "2k",
		N:               1,
	}
}

func TestValidateRequest_empty_prompt(t *testing.T) {
	a := &Adaptor{}
	info := newInfo()
	info.Prompt = ""
	err := a.ValidateRequest(info)
	assert.ErrorContains(t, err, "prompt")
}

func TestBuildRequestURL_normal(t *testing.T) {
	a := &Adaptor{}
	url, err := a.BuildRequestURL(newInfo())
	require.NoError(t, err)
	assert.Equal(t, "https://api.apimart.ai/v1/images/generations", url)
}

func TestBuildRequestURL_strip_trailing_slash(t *testing.T) {
	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = "https://api.apimart.ai/"
	url, _ := a.BuildRequestURL(info)
	assert.Equal(t, "https://api.apimart.ai/v1/images/generations", url, "must strip trailing /")
}

func TestBuildRequestURL_strip_path_duplicate(t *testing.T) {
	// 用户配渠道时容易把 base_url 填成 https://api.apimart.ai/v1
	// 我们要兼容：不重复拼 /v1
	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = "https://api.apimart.ai/v1"
	url, _ := a.BuildRequestURL(info)
	assert.Equal(t, "https://api.apimart.ai/v1/images/generations", url)
}

func TestBuildRequestHeader(t *testing.T) {
	a := &Adaptor{}
	h, err := a.BuildRequestHeader(newInfo())
	require.NoError(t, err)
	assert.Equal(t, "Bearer sk-test", h["Authorization"])
	assert.Equal(t, "application/json", h["Content-Type"])
}
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && go test ./relay/adaptor/task/apimart/ -v`
Expected: FAIL，undefined Adaptor / 方法

- [ ] **Step 4: 实现 Adaptor.Init/Validate/URL/Header**

Create `backend/relay/adaptor/task/apimart/adaptor.go`:

```go
package apimart

import (
	"errors"
	"fmt"
	"strings"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

// Adaptor 实现 common.TaskAdaptor for apimart.ai 异步图像协议
type Adaptor struct{}

var _ common.TaskAdaptor = &Adaptor{}

func (a *Adaptor) Init(info *common.TaskRelayInfo) {
	// apimart 没有需要预处理的字段
}

func (a *Adaptor) ValidateRequest(info *common.TaskRelayInfo) error {
	if strings.TrimSpace(info.Prompt) == "" {
		return errors.New("prompt is required")
	}
	if info.OriginModelName == "" {
		return errors.New("model is required")
	}
	if info.N < 0 || info.N > 10 {
		return errors.New("n must be 1-10")
	}
	if len(info.ImageURLs) > 16 {
		return errors.New("image_urls exceeds max 16")
	}
	return nil
}

// normalizeBaseURL 把用户配的 BaseURL 规范化为 host 形式（去尾斜杠 / 去重复 /v1）
func normalizeBaseURL(raw string) string {
	u := strings.TrimRight(raw, "/")
	u = strings.TrimSuffix(u, "/v1")
	return u
}

func (a *Adaptor) BuildRequestURL(info *common.TaskRelayInfo) (string, error) {
	if info.BaseURL == "" {
		return "", errors.New("apimart channel BaseURL is empty")
	}
	return fmt.Sprintf("%s/v1/images/generations", normalizeBaseURL(info.BaseURL)), nil
}

func (a *Adaptor) BuildRequestHeader(info *common.TaskRelayInfo) (map[string]string, error) {
	if info.APIKey == "" {
		return nil, errors.New("apimart channel APIKey is empty")
	}
	return map[string]string{
		"Authorization": "Bearer " + info.APIKey,
		"Content-Type":  "application/json",
	}, nil
}

// BuildRequestBody / DoRequest / FetchTask 在 Task B3-B4 实现，先桩
func (a *Adaptor) BuildRequestBody(info *common.TaskRelayInfo) ([]byte, error) {
	return nil, errors.New("not implemented")
}
func (a *Adaptor) DoRequest(info *common.TaskRelayInfo, body []byte) (string, []byte, error) {
	return "", nil, errors.New("not implemented")
}
func (a *Adaptor) FetchTask(info *common.TaskRelayInfo, taskID string) (*common.FetchResult, error) {
	return nil, errors.New("not implemented")
}
```

- [ ] **Step 5: 测试通过 + commit**

```bash
cd backend && go test ./relay/adaptor/task/apimart/ -v
git add backend/relay/adaptor/task/apimart/
git commit -m "feat(task): apimart adaptor skeleton + Validate/URL/Header"
```
Expected: 5 个测试 PASS（Validate empty / URL normal / URL strip / / URL strip /v1 / Header）

---

### Task B3: ApiMart BuildRequestBody + DoRequest

**Files:**
- Modify: `backend/relay/adaptor/task/apimart/adaptor.go`
- Modify: `backend/relay/adaptor/task/apimart/adaptor_test.go`

- [ ] **Step 1: 加 BuildRequestBody 测试**

追加到 `adaptor_test.go`:

```go
func TestBuildRequestBody(t *testing.T) {
	a := &Adaptor{}
	info := newInfo()
	info.UpstreamModelName = "gpt-image-2"
	body, err := a.BuildRequestBody(info)
	require.NoError(t, err)

	var req SubmitRequest
	require.NoError(t, json.Unmarshal(body, &req))
	assert.Equal(t, "gpt-image-2", req.Model)
	assert.Equal(t, "a cat", req.Prompt)
	assert.Equal(t, "16:9", req.Size)
	assert.Equal(t, "2k", req.Resolution)
	assert.Equal(t, 1, req.N)
}
```

需要在文件顶部加 `import "encoding/json"`。

- [ ] **Step 2: 加 DoRequest 测试（用 httptest mock）**

追加到 `adaptor_test.go`:

```go
import (
	"net/http"
	"net/http/httptest"
)

func TestDoRequest_success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/images/generations", r.URL.Path)
		assert.Equal(t, "Bearer sk-test", r.Header.Get("Authorization"))
		w.WriteHeader(200)
		w.Write([]byte(`{"code":200,"data":[{"status":"submitted","task_id":"task_xxx"}]}`))
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL
	body, _ := a.BuildRequestBody(info)
	taskID, raw, err := a.DoRequest(info, body)
	require.NoError(t, err)
	assert.Equal(t, "task_xxx", taskID)
	assert.Contains(t, string(raw), "submitted")
}

func TestDoRequest_upstream_html_error(t *testing.T) {
	// 还原我们调试过的实际 bug：上游返 HTML 错误页
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(404)
		w.Write([]byte("<html>not found</html>"))
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL
	body, _ := a.BuildRequestBody(info)
	_, _, err := a.DoRequest(info, body)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "upstream returned non-JSON")
}

func TestDoRequest_upstream_business_error(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		w.Write([]byte(`{"error":{"code":400,"message":"invalid prompt","type":"invalid_request_error"}}`))
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL
	body, _ := a.BuildRequestBody(info)
	_, _, err := a.DoRequest(info, body)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid prompt")
}
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && go test ./relay/adaptor/task/apimart/ -run TestBuildRequestBody -v && go test ./relay/adaptor/task/apimart/ -run TestDoRequest -v`
Expected: FAIL "not implemented"

- [ ] **Step 4: 实现 BuildRequestBody + DoRequest**

Edit `backend/relay/adaptor/task/apimart/adaptor.go`，替换两个 stub 方法：

```go
import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"errors"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

func (a *Adaptor) BuildRequestBody(info *common.TaskRelayInfo) ([]byte, error) {
	model := info.UpstreamModelName
	if model == "" {
		model = info.OriginModelName
	}
	n := info.N
	if n <= 0 {
		n = 1
	}
	req := SubmitRequest{
		Model:      model,
		Prompt:     info.Prompt,
		N:          n,
		Size:       info.Size,
		Resolution: info.Resolution,
		ImageURLs:  info.ImageURLs,
	}
	return json.Marshal(req)
}

func (a *Adaptor) DoRequest(info *common.TaskRelayInfo, body []byte) (string, []byte, error) {
	url, err := a.BuildRequestURL(info)
	if err != nil {
		return "", nil, err
	}
	headers, err := a.BuildRequestHeader(info)
	if err != nil {
		return "", nil, err
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return "", nil, fmt.Errorf("build request: %w", err)
	}
	for k, v := range headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := common.HTTPClient().Do(httpReq)
	if err != nil {
		return "", nil, fmt.Errorf("upstream request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, fmt.Errorf("read upstream body: %w", err)
	}

	// 防 HTML 错误页（昨天遇到的实际 bug）
	if len(raw) > 0 && raw[0] == '<' {
		return "", raw, fmt.Errorf("upstream returned non-JSON (likely HTML error page, status=%d): %s",
			resp.StatusCode, truncate(string(raw), 200))
	}

	var sr SubmitResponse
	if err := json.Unmarshal(raw, &sr); err != nil {
		return "", raw, fmt.Errorf("unmarshal upstream response: %w (body: %s)", err, truncate(string(raw), 200))
	}

	if sr.Error != nil {
		return "", raw, fmt.Errorf("upstream error: %s (%s)", sr.Error.Message, sr.Error.Type)
	}
	if len(sr.Data) == 0 || sr.Data[0].TaskID == "" {
		return "", raw, errors.New("upstream did not return task_id")
	}

	return sr.Data[0].TaskID, raw, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
```

- [ ] **Step 5: 测试通过 + commit**

```bash
cd backend && go test ./relay/adaptor/task/apimart/ -v
git add backend/relay/adaptor/task/apimart/
git commit -m "feat(task): apimart BuildRequestBody + DoRequest (with HTML error guard)"
```
Expected: TestBuildRequestBody + 3 DoRequest 测试全 PASS

---

### Task B4: ApiMart FetchTask（轮询）

**Files:**
- Modify: `backend/relay/adaptor/task/apimart/adaptor.go`
- Modify: `backend/relay/adaptor/task/apimart/adaptor_test.go`

- [ ] **Step 1: 写 FetchTask 测试（覆盖 4 个状态）**

追加到 `adaptor_test.go`:

```go
func TestFetchTask_submitted(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/tasks/task_xxx", r.URL.Path)
		w.Write([]byte(`{"code":200,"data":{"id":"task_xxx","status":"submitted","progress":0}}`))
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL
	res, err := a.FetchTask(info, "task_xxx")
	require.NoError(t, err)
	assert.Equal(t, "submitted", res.Status)
}

func TestFetchTask_processing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"code":200,"data":{"id":"task_xxx","status":"processing","progress":50}}`))
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL
	res, err := a.FetchTask(info, "task_xxx")
	require.NoError(t, err)
	assert.Equal(t, "processing", res.Status)
	assert.Equal(t, "50", res.Progress)
}

func TestFetchTask_completed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{
			"code":200,
			"data":{
				"id":"task_xxx",
				"status":"completed",
				"progress":100,
				"actual_time":52,
				"cost":0.05279,
				"result":{"images":[{"url":["https://cdn.x/abc.png"],"expires_at":1747243204}]}
			}
		}`))
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL
	res, err := a.FetchTask(info, "task_xxx")
	require.NoError(t, err)
	assert.Equal(t, "completed", res.Status)
	assert.NotEmpty(t, res.Result, "result body must be preserved verbatim")
}

func TestFetchTask_failed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{
			"code":200,
			"data":{"id":"task_xxx","status":"failed","error":{"code":500,"message":"upstream timeout","type":"server_error"}}
		}`))
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL
	res, err := a.FetchTask(info, "task_xxx")
	require.NoError(t, err)
	assert.Equal(t, "failed", res.Status)
	assert.Contains(t, res.FailReason, "upstream timeout")
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && go test ./relay/adaptor/task/apimart/ -run TestFetchTask -v`
Expected: FAIL "not implemented"

- [ ] **Step 3: 实现 FetchTask**

替换 `adaptor.go` 中的 FetchTask stub：

```go
import "strconv" // 加到现有 import 块

func (a *Adaptor) FetchTask(info *common.TaskRelayInfo, taskID string) (*common.FetchResult, error) {
	url := fmt.Sprintf("%s/v1/tasks/%s", normalizeBaseURL(info.BaseURL), taskID)

	httpReq, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("build fetch request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+info.APIKey)

	resp, err := common.HTTPClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("fetch upstream: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read fetch body: %w", err)
	}

	if len(raw) > 0 && raw[0] == '<' {
		return nil, fmt.Errorf("upstream returned non-JSON on fetch (status=%d): %s",
			resp.StatusCode, truncate(string(raw), 200))
	}

	var fr FetchResponse
	if err := json.Unmarshal(raw, &fr); err != nil {
		return nil, fmt.Errorf("unmarshal fetch response: %w", err)
	}

	out := &common.FetchResult{
		Status:   fr.Data.Status,
		Progress: strconv.Itoa(fr.Data.Progress),
		Result:   raw, // 完整原文存到 tasks.data
	}
	if fr.Data.Error != nil {
		out.FailReason = fr.Data.Error.Message
	}
	return out, nil
}
```

- [ ] **Step 4: 测试通过 + commit**

```bash
cd backend && go test ./relay/adaptor/task/apimart/ -v
git add backend/relay/adaptor/task/apimart/
git commit -m "feat(task): apimart FetchTask covers submitted/processing/completed/failed"
```
Expected: 全部 PASS

---

### Task B5: ApiMart 整合 e2e 流程测试

**Files:**
- Modify: `backend/relay/adaptor/task/apimart/adaptor_test.go`

- [ ] **Step 1: 写整合测试**

追加：

```go
func TestApiMart_E2E_submit_then_poll_to_completed(t *testing.T) {
	var fetchCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/images/generations" {
			w.Write([]byte(`{"code":200,"data":[{"status":"submitted","task_id":"task_999"}]}`))
			return
		}
		if r.URL.Path == "/v1/tasks/task_999" {
			fetchCount++
			if fetchCount < 3 {
				w.Write([]byte(`{"code":200,"data":{"id":"task_999","status":"processing","progress":30}}`))
				return
			}
			w.Write([]byte(`{
				"code":200,
				"data":{"id":"task_999","status":"completed","progress":100,
				        "result":{"images":[{"url":["https://cdn.x/done.png"]}]}}
			}`))
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL

	// submit
	body, _ := a.BuildRequestBody(info)
	taskID, _, err := a.DoRequest(info, body)
	require.NoError(t, err)
	assert.Equal(t, "task_999", taskID)

	// poll 3 次直到 completed
	var last *common.FetchResult
	for i := 0; i < 3; i++ {
		last, err = a.FetchTask(info, taskID)
		require.NoError(t, err)
	}
	assert.Equal(t, "completed", last.Status)
	assert.Equal(t, 3, fetchCount)
}
```

- [ ] **Step 2: 跑测试**

Run: `cd backend && go test ./relay/adaptor/task/apimart/ -run TestApiMart_E2E -v`
Expected: PASS

- [ ] **Step 3: commit + Phase B 完成审视**

```bash
git add backend/relay/adaptor/task/apimart/
git commit -m "test(task): apimart e2e submit-then-poll-to-completed"
cd backend && go test ./relay/adaptor/task/... -v
go build ./...
```
Expected: 全 PASS，build 成功

---

# Phase C — Jimeng Adaptor（1 天）

**前置条件**: Phase B 完成（TaskAdaptor 接口稳定）

**验收标准**:
- `go test ./relay/adaptor/task/jimeng/...` 全 PASS（含 HMAC-SHA256 签名单元测试）
- Adaptor 实现 `common.TaskAdaptor` 接口

**回滚**: `git revert <phase-C-commits>` 删除 `relay/adaptor/task/jimeng/`

---

### Task C1: HMAC-SHA256 签名工具

**Files:**
- Create: `backend/relay/adaptor/task/jimeng/sign.go`
- Create: `backend/relay/adaptor/task/jimeng/sign_test.go`

- [ ] **Step 1: 写签名测试（拿 Volcengine 官方 SDK 测试向量）**

Create `backend/relay/adaptor/task/jimeng/sign_test.go`:

```go
package jimeng

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestHmacSHA256(t *testing.T) {
	out := hmacSHA256([]byte("key"), []byte("The quick brown fox jumps over the lazy dog"))
	assert.Equal(t, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
		hex(out))
}

func TestDeriveSigningKey(t *testing.T) {
	// 已知 V4 派生 (date=20220101, region=cn-north-1, service=cv)
	k := deriveSigningKey("AKIDEXAMPLE", "20220101", "cn-north-1", "cv")
	assert.NotEmpty(t, k)
	assert.Len(t, k, 32, "HMAC-SHA256 output length is 32 bytes")
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && go test ./relay/adaptor/task/jimeng/ -run TestHmac`
Expected: FAIL undefined

- [ ] **Step 3: 修正 sign_test.go 用 hex.EncodeToString**

测试文件里 `hex(...)` 跟 stdlib 的 `encoding/hex` 包冲突，改成显式包名：

```go
package jimeng

import (
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestHmacSHA256(t *testing.T) {
	out := hmacSHA256([]byte("key"), []byte("The quick brown fox jumps over the lazy dog"))
	assert.Equal(t, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
		hex.EncodeToString(out))
}

func TestDeriveSigningKey(t *testing.T) {
	k := deriveSigningKey("AKIDEXAMPLE", "20220101", "cn-north-1", "cv")
	assert.NotEmpty(t, k)
	assert.Len(t, k, 32, "HMAC-SHA256 output length is 32 bytes")
}
```

- [ ] **Step 3b: 实现 sign.go**

Create `backend/relay/adaptor/task/jimeng/sign.go`:

```go
package jimeng

import (
	"crypto/hmac"
	"crypto/sha256"
)

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

// deriveSigningKey 派生 Volcengine V4 签名 key（AWS 风格四级派生）
func deriveSigningKey(secretKey, date, region, service string) []byte {
	kDate := hmacSHA256([]byte(secretKey), []byte(date))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte("request"))
	return kSigning
}
```

- [ ] **Step 4: 跑测试通过**

Run: `cd backend && go test ./relay/adaptor/task/jimeng/ -v`
Expected: TestHmacSHA256 + TestDeriveSigningKey PASS

- [ ] **Step 5: commit**

```bash
git add backend/relay/adaptor/task/jimeng/sign.go backend/relay/adaptor/task/jimeng/sign_test.go
git commit -m "feat(task): jimeng HMAC-SHA256 signing utils for V4 auth"
```

---

### Task C2: Jimeng Adaptor 骨架 + Sign V4 Header

**Files:**
- Create: `backend/relay/adaptor/task/jimeng/model.go`
- Create: `backend/relay/adaptor/task/jimeng/adaptor.go`
- Create: `backend/relay/adaptor/task/jimeng/adaptor_test.go`

- [ ] **Step 1: 写 model.go**

Create `backend/relay/adaptor/task/jimeng/model.go`:

```go
package jimeng

// SubmitRequest jimeng CVSync2AsyncSubmitTask payload
type SubmitRequest struct {
	ReqKey   string   `json:"req_key"`
	Prompt   string   `json:"prompt"`
	Seed     int      `json:"seed,omitempty"`
	ImageURL []string `json:"image_url,omitempty"`
}

// SubmitResponse
type SubmitResponse struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
	Data      struct {
		TaskID string `json:"task_id"`
	} `json:"data"`
}

// FetchRequest CVSync2AsyncGetResult payload
type FetchRequest struct {
	ReqKey string `json:"req_key"`
	TaskID string `json:"task_id"`
}

// FetchResponse
type FetchResponse struct {
	Code      int    `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
	Data      struct {
		Status     string   `json:"status"` // generating / done / failed
		ImageURLs  []string `json:"image_urls,omitempty"`
		FailReason string   `json:"fail_reason,omitempty"`
	} `json:"data"`
}

// 渠道配置（在 channel.Key 里以 JSON 存）
type ChannelConfig struct {
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	Region          string `json:"region"`  // 默认 cn-north-1
	Service         string `json:"service"` // 默认 cv
}
```

- [ ] **Step 2: 写 Adaptor 测试（覆盖 ChannelConfig 解析 + URL 构造）**

Create `backend/relay/adaptor/task/jimeng/adaptor_test.go`:

```go
package jimeng

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newInfo() *common.TaskRelayInfo {
	cfg := ChannelConfig{
		AccessKeyID:     "AK_TEST",
		SecretAccessKey: "SK_TEST",
		Region:          "cn-north-1",
		Service:         "cv",
	}
	keyJSON, _ := json.Marshal(cfg)
	return &common.TaskRelayInfo{
		BaseURL:           "https://visual.volcengineapi.com",
		APIKey:            string(keyJSON),
		OriginModelName:   "jimeng-v3.0",
		UpstreamModelName: "jimeng_t2v_v30",
		Prompt:            "a cat",
	}
}

func TestParseChannelConfig(t *testing.T) {
	a := &Adaptor{}
	info := newInfo()
	a.Init(info)
	assert.Equal(t, "AK_TEST", a.cfg.AccessKeyID)
	assert.Equal(t, "cn-north-1", a.cfg.Region)
}

func TestBuildRequestURL_submit(t *testing.T) {
	a := &Adaptor{}
	info := newInfo()
	a.Init(info)
	url, err := a.BuildRequestURL(info)
	require.NoError(t, err)
	assert.Contains(t, url, "Action=CVSync2AsyncSubmitTask")
	assert.Contains(t, url, "Version=2022-08-31")
}
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && go test ./relay/adaptor/task/jimeng/ -run TestParseChannelConfig -v`
Expected: FAIL undefined Adaptor

- [ ] **Step 4: 实现 Adaptor**

Create `backend/relay/adaptor/task/jimeng/adaptor.go`:

```go
package jimeng

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

const (
	defaultRegion  = "cn-north-1"
	defaultService = "cv"
	apiVersion     = "2022-08-31"
)

type Adaptor struct {
	cfg ChannelConfig
}

var _ common.TaskAdaptor = &Adaptor{}

func (a *Adaptor) Init(info *common.TaskRelayInfo) {
	_ = json.Unmarshal([]byte(info.APIKey), &a.cfg)
	if a.cfg.Region == "" {
		a.cfg.Region = defaultRegion
	}
	if a.cfg.Service == "" {
		a.cfg.Service = defaultService
	}
}

func (a *Adaptor) ValidateRequest(info *common.TaskRelayInfo) error {
	if a.cfg.AccessKeyID == "" || a.cfg.SecretAccessKey == "" {
		return errors.New("jimeng channel key must be JSON {access_key_id, secret_access_key, ...}")
	}
	if strings.TrimSpace(info.Prompt) == "" {
		return errors.New("prompt is required")
	}
	return nil
}

func (a *Adaptor) BuildRequestURL(info *common.TaskRelayInfo) (string, error) {
	base := strings.TrimRight(info.BaseURL, "/")
	if base == "" {
		base = "https://visual.volcengineapi.com"
	}
	q := url.Values{}
	q.Set("Action", "CVSync2AsyncSubmitTask")
	q.Set("Version", apiVersion)
	return base + "/?" + q.Encode(), nil
}

func (a *Adaptor) buildFetchURL(info *common.TaskRelayInfo) string {
	base := strings.TrimRight(info.BaseURL, "/")
	if base == "" {
		base = "https://visual.volcengineapi.com"
	}
	q := url.Values{}
	q.Set("Action", "CVSync2AsyncGetResult")
	q.Set("Version", apiVersion)
	return base + "/?" + q.Encode()
}

func (a *Adaptor) BuildRequestHeader(info *common.TaskRelayInfo) (map[string]string, error) {
	// 真实头要带签名；签名依赖 body，所以 DoRequest 里现算
	return map[string]string{"Content-Type": "application/json"}, nil
}

func (a *Adaptor) BuildRequestBody(info *common.TaskRelayInfo) ([]byte, error) {
	model := info.UpstreamModelName
	if model == "" {
		model = info.OriginModelName
	}
	req := SubmitRequest{
		ReqKey: model,
		Prompt: info.Prompt,
	}
	if len(info.ImageURLs) > 0 {
		req.ImageURL = info.ImageURLs
	}
	return json.Marshal(req)
}

// signRequest 写入 Volcengine V4 签名（含 hmacSHA256 派生 + Canonical Request）
func (a *Adaptor) signRequest(httpReq *http.Request, body []byte) {
	now := time.Now().UTC()
	shortDate := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	httpReq.Header.Set("X-Date", amzDate)
	httpReq.Header.Set("Host", httpReq.URL.Host)

	// 1. Canonical Request
	bodyHash := sha256.Sum256(body)
	httpReq.Header.Set("X-Content-Sha256", hex.EncodeToString(bodyHash[:]))

	signedHeaders := []string{"content-type", "host", "x-content-sha256", "x-date"}
	sort.Strings(signedHeaders)
	headerList := strings.Join(signedHeaders, ";")

	var canonicalHeaders strings.Builder
	for _, h := range signedHeaders {
		canonicalHeaders.WriteString(h + ":" + strings.TrimSpace(httpReq.Header.Get(h)) + "\n")
	}

	canonicalRequest := strings.Join([]string{
		httpReq.Method,
		httpReq.URL.Path,
		httpReq.URL.RawQuery,
		canonicalHeaders.String(),
		headerList,
		hex.EncodeToString(bodyHash[:]),
	}, "\n")

	// 2. String To Sign
	credScope := fmt.Sprintf("%s/%s/%s/request", shortDate, a.cfg.Region, a.cfg.Service)
	hashCR := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"HMAC-SHA256",
		amzDate,
		credScope,
		hex.EncodeToString(hashCR[:]),
	}, "\n")

	// 3. Signature
	sigKey := deriveSigningKey(a.cfg.SecretAccessKey, shortDate, a.cfg.Region, a.cfg.Service)
	signature := hex.EncodeToString(hmacSHA256(sigKey, []byte(stringToSign)))

	// 4. Authorization Header
	httpReq.Header.Set("Authorization", fmt.Sprintf(
		"HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		a.cfg.AccessKeyID, credScope, headerList, signature,
	))
}

func (a *Adaptor) DoRequest(info *common.TaskRelayInfo, body []byte) (string, []byte, error) {
	urlStr, err := a.BuildRequestURL(info)
	if err != nil {
		return "", nil, err
	}
	httpReq, err := http.NewRequest("POST", urlStr, bytes.NewReader(body))
	if err != nil {
		return "", nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	a.signRequest(httpReq, body)

	resp, err := common.HTTPClient().Do(httpReq)
	if err != nil {
		return "", nil, fmt.Errorf("jimeng submit: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	if len(raw) > 0 && raw[0] == '<' {
		return "", raw, fmt.Errorf("upstream HTML error (status=%d)", resp.StatusCode)
	}

	var sr SubmitResponse
	if err := json.Unmarshal(raw, &sr); err != nil {
		return "", raw, fmt.Errorf("unmarshal jimeng submit: %w", err)
	}
	if sr.Code != 10000 {
		return "", raw, fmt.Errorf("jimeng submit failed code=%d msg=%s", sr.Code, sr.Message)
	}
	return sr.Data.TaskID, raw, nil
}

func (a *Adaptor) FetchTask(info *common.TaskRelayInfo, taskID string) (*common.FetchResult, error) {
	urlStr := a.buildFetchURL(info)
	model := info.UpstreamModelName
	if model == "" {
		model = info.OriginModelName
	}
	reqBody, _ := json.Marshal(FetchRequest{ReqKey: model, TaskID: taskID})

	httpReq, err := http.NewRequest("POST", urlStr, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	a.signRequest(httpReq, reqBody)

	resp, err := common.HTTPClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("jimeng fetch: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	var fr FetchResponse
	if err := json.Unmarshal(raw, &fr); err != nil {
		return nil, fmt.Errorf("unmarshal jimeng fetch: %w", err)
	}
	if fr.Code != 10000 {
		return nil, fmt.Errorf("jimeng fetch failed code=%d msg=%s", fr.Code, fr.Message)
	}

	out := &common.FetchResult{Result: raw}
	switch fr.Data.Status {
	case "done":
		out.Status = "completed"
		out.Progress = "100"
	case "generating":
		out.Status = "processing"
		out.Progress = "50"
	case "failed":
		out.Status = "failed"
		out.FailReason = fr.Data.FailReason
	default:
		out.Status = "queued"
		out.Progress = "0"
	}
	return out, nil
}
```

- [ ] **Step 5: 测试通过 + commit**

```bash
cd backend && go test ./relay/adaptor/task/jimeng/ -v
git add backend/relay/adaptor/task/jimeng/
git commit -m "feat(task): jimeng adaptor with V4 signing, submit + fetch"
```
Expected: 测试 PASS

---

### Task C3: Jimeng 签名往返集成测试

**Files:**
- Modify: `backend/relay/adaptor/task/jimeng/adaptor_test.go`

- [ ] **Step 1: 加 mock 服务器验证签名头存在**

追加：

```go
func TestJimeng_E2E_signed_request(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		assert.Contains(t, auth, "HMAC-SHA256 Credential=AK_TEST/")
		assert.Contains(t, auth, "Signature=")
		assert.NotEmpty(t, r.Header.Get("X-Date"))
		assert.NotEmpty(t, r.Header.Get("X-Content-Sha256"))

		// 模拟提交成功
		w.Write([]byte(`{"code":10000,"message":"ok","data":{"task_id":"j_task_001"}}`))
	}))
	defer srv.Close()

	a := &Adaptor{}
	info := newInfo()
	info.BaseURL = srv.URL
	a.Init(info)

	body, _ := a.BuildRequestBody(info)
	taskID, _, err := a.DoRequest(info, body)
	require.NoError(t, err)
	assert.Equal(t, "j_task_001", taskID)
}
```

- [ ] **Step 2: 跑测试**

Run: `cd backend && go test ./relay/adaptor/task/jimeng/ -v`
Expected: PASS

- [ ] **Step 3: commit**

```bash
git add backend/relay/adaptor/task/jimeng/adaptor_test.go
git commit -m "test(task): jimeng e2e signed request validates Authorization header"
```

---

# Phase D — TaskWorker（1 天）

**前置条件**: Phase A-C 完成

**验收标准**:
- worker 启动时不阻塞 main()
- `ENABLE_TASK_SYSTEM=off` 时 worker 不启动
- env 配置变量都能从 .env 加载
- Redis 错误计数能跑通

**回滚**: `git revert <phase-D-commits>` + worker.Stop() 在 main.go 里去掉

---

### Task D1: env 配置 + Adaptor 注册中心

**Files:**
- Modify: `backend/common/config/config.go`
- Create: `backend/relay/adaptor/task/registry.go`

- [ ] **Step 1: 加 env 变量**

在 `backend/common/config/config.go` 文件末尾追加：

```go
import "time" // 如未导入

var (
	EnableTaskSystem        = false
	TaskWorkerInterval      = 5 * time.Second
	TaskWorkerBatchSize     = 50
	TaskTimeoutMinutes      = 10
	TaskRetentionDays       = 30
	TaskUpstreamHTTPTimeout = 30 * time.Second
	TaskMaxFetchErrors      = 5
)

func InitTaskConfig() {
	EnableTaskSystem = env.Bool("ENABLE_TASK_SYSTEM", false)
	TaskWorkerInterval = env.Duration("TASK_WORKER_INTERVAL", 5*time.Second)
	TaskWorkerBatchSize = env.Int("TASK_WORKER_BATCH_SIZE", 50)
	TaskTimeoutMinutes = env.Int("TASK_TIMEOUT_MINUTES", 10)
	TaskRetentionDays = env.Int("TASK_RETENTION_DAYS", 30)
	TaskUpstreamHTTPTimeout = env.Duration("TASK_UPSTREAM_HTTP_TIMEOUT", 30*time.Second)
	TaskMaxFetchErrors = env.Int("TASK_MAX_FETCH_ERRORS", 5)
}
```

> 注：env helper 可能没 `Duration`。如没有，加一行：

```go
// 加到 common/env/helper.go
func Duration(key string, defaultValue time.Duration) time.Duration {
	s := os.Getenv(key)
	if s == "" {
		return defaultValue
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return defaultValue
	}
	return d
}
```

- [ ] **Step 2: 写 registry.go**

Create `backend/relay/adaptor/task/registry.go`:

```go
package task

import (
	"github.com/songquanpeng/one-api/relay/adaptor/task/apimart"
	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
	"github.com/songquanpeng/one-api/relay/adaptor/task/jimeng"
	"github.com/songquanpeng/one-api/relay/channeltype"
)

// IsAsyncTaskType 判断 channel.Type 是否走异步任务框架
func IsAsyncTaskType(channelType int) bool {
	switch channelType {
	case channeltype.ApiMart, channeltype.Jimeng:
		return true
	}
	return false
}

// PlatformOf 把 channel.Type 映射成 platform 字符串
func PlatformOf(channelType int) string {
	switch channelType {
	case channeltype.ApiMart:
		return "apimart"
	case channeltype.Jimeng:
		return "jimeng"
	}
	return ""
}

// AdaptorOf 按 platform 名返回 adaptor 实例
func AdaptorOf(platform string) common.TaskAdaptor {
	switch platform {
	case "apimart":
		return &apimart.Adaptor{}
	case "jimeng":
		return &jimeng.Adaptor{}
	}
	return nil
}
```

- [ ] **Step 3: 调用 InitTaskConfig**

找到 `backend/main.go` 中现有的 config init 序列（搜 `config.Init` 或类似），在末尾加：

```go
config.InitTaskConfig()
```

- [ ] **Step 4: build + commit**

```bash
cd backend && go build ./...
git add backend/common/config/config.go backend/common/env/helper.go \
        backend/relay/adaptor/task/registry.go backend/main.go
git commit -m "feat(task): env config + adaptor registry"
```

---

### Task D2: Redis 错误计数

**Files:**
- Create: `backend/service/task_error_counter.go`
- Create: `backend/service/task_error_counter_test.go`

- [ ] **Step 1: 写测试**

Create `backend/service/task_error_counter_test.go`:

```go
package service

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestRedis(t *testing.T) *redis.Client {
	c := redis.NewClient(&redis.Options{Addr: "localhost:6379", DB: 15})
	if err := c.Ping(context.Background()).Err(); err != nil {
		t.Skip("redis not available, skip")
	}
	c.FlushDB(context.Background())
	return c
}

func TestTaskErrorCounter_increment_and_get(t *testing.T) {
	r := setupTestRedis(t)
	defer r.Close()
	c := NewTaskErrorCounter(r)

	n, err := c.Increment("task_xxx")
	require.NoError(t, err)
	assert.Equal(t, int64(1), n)

	n, _ = c.Increment("task_xxx")
	assert.Equal(t, int64(2), n)

	got, _ := c.Get("task_xxx")
	assert.Equal(t, int64(2), got)
}

func TestTaskErrorCounter_reset(t *testing.T) {
	r := setupTestRedis(t)
	defer r.Close()
	c := NewTaskErrorCounter(r)
	c.Increment("task_xxx")
	c.Reset("task_xxx")
	got, _ := c.Get("task_xxx")
	assert.Equal(t, int64(0), got)
}

func TestTaskErrorCounter_TTL(t *testing.T) {
	r := setupTestRedis(t)
	defer r.Close()
	c := NewTaskErrorCounter(r)
	c.Increment("task_xxx")
	ttl := r.TTL(context.Background(), "task:fetch_errors:task_xxx").Val()
	assert.Greater(t, ttl, 30*time.Minute) // 至少 30 分钟（实际 1h）
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && go test ./service/ -run TestTaskErrorCounter -v`
Expected: FAIL undefined

- [ ] **Step 3: 实现 counter**

Create `backend/service/task_error_counter.go`:

```go
package service

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

const taskErrorTTL = 1 * time.Hour

type TaskErrorCounter struct {
	r *redis.Client
}

func NewTaskErrorCounter(r *redis.Client) *TaskErrorCounter {
	return &TaskErrorCounter{r: r}
}

func keyOf(taskID string) string { return "task:fetch_errors:" + taskID }

func (c *TaskErrorCounter) Increment(taskID string) (int64, error) {
	ctx := context.Background()
	pipe := c.r.TxPipeline()
	incr := pipe.Incr(ctx, keyOf(taskID))
	pipe.Expire(ctx, keyOf(taskID), taskErrorTTL)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

func (c *TaskErrorCounter) Get(taskID string) (int64, error) {
	ctx := context.Background()
	n, err := c.r.Get(ctx, keyOf(taskID)).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return n, err
}

func (c *TaskErrorCounter) Reset(taskID string) error {
	return c.r.Del(context.Background(), keyOf(taskID)).Err()
}
```

> 注：项目里如何拿到 Redis client？搜一下既有的：`grep -n "redis.NewClient\|RedisClient\|GetRedis" backend/common/ -r`。如果有现成的 `common/redis/client.go` 就用现成的；否则在 main.go init 阶段建一个全局 client，TaskErrorCounter 用全局 client 初始化。

- [ ] **Step 4: 跑测试 + commit**

```bash
cd backend && go test ./service/ -run TestTaskErrorCounter -v
git add backend/service/task_error_counter*.go
git commit -m "feat(task): Redis-backed task fetch error counter with TTL 1h"
```

---

### Task D3: Worker 主循环骨架

**Files:**
- Create: `backend/service/task_worker.go`
- Create: `backend/service/task_worker_test.go`

- [ ] **Step 1: 写测试（worker 启动 / 停止）**

Create `backend/service/task_worker_test.go`:

```go
package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestTaskWorker_start_then_stop(t *testing.T) {
	w := &TaskWorker{
		interval:  100 * time.Millisecond,
		batchSize: 10,
		tickFn:    func(context.Context) {},
	}
	w.Start()
	time.Sleep(250 * time.Millisecond)
	w.Stop()
	assert.True(t, w.IsStopped())
}

func TestTaskWorker_tick_invoked(t *testing.T) {
	count := 0
	w := &TaskWorker{
		interval:  50 * time.Millisecond,
		batchSize: 10,
		tickFn: func(context.Context) {
			count++
		},
	}
	w.Start()
	time.Sleep(180 * time.Millisecond)
	w.Stop()
	assert.GreaterOrEqual(t, count, 3, "tick should fire at least 3 times in 180ms")
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && go test ./service/ -run TestTaskWorker -v`
Expected: FAIL undefined

- [ ] **Step 3: 实现 worker.go**

Create `backend/service/task_worker.go`:

```go
package service

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/songquanpeng/one-api/common/logger"
)

type TaskWorker struct {
	interval  time.Duration
	batchSize int
	tickFn    func(ctx context.Context)

	stopCh    chan struct{}
	stoppedCh chan struct{}
	stopped   atomic.Bool
	startOnce sync.Once
	stopOnce  sync.Once
}

func NewTaskWorker(interval time.Duration, batchSize int, tick func(context.Context)) *TaskWorker {
	return &TaskWorker{
		interval:  interval,
		batchSize: batchSize,
		tickFn:    tick,
		stopCh:    make(chan struct{}),
		stoppedCh: make(chan struct{}),
	}
}

func (w *TaskWorker) Start() {
	w.startOnce.Do(func() {
		if w.stopCh == nil {
			w.stopCh = make(chan struct{})
		}
		if w.stoppedCh == nil {
			w.stoppedCh = make(chan struct{})
		}
		go w.loop()
	})
}

func (w *TaskWorker) Stop() {
	w.stopOnce.Do(func() {
		close(w.stopCh)
		<-w.stoppedCh
	})
}

func (w *TaskWorker) IsStopped() bool { return w.stopped.Load() }

func (w *TaskWorker) loop() {
	defer func() {
		w.stopped.Store(true)
		close(w.stoppedCh)
	}()
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-w.stopCh:
			logger.SysLog("task worker stopped")
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), w.interval*2)
			func() {
				defer cancel()
				defer func() {
					if r := recover(); r != nil {
						logger.SysError("task worker tick panic recovered")
					}
				}()
				w.tickFn(ctx)
			}()
		}
	}
}
```

- [ ] **Step 4: 跑测试通过 + commit**

```bash
cd backend && go test ./service/ -run TestTaskWorker -v
git add backend/service/task_worker.go backend/service/task_worker_test.go
git commit -m "feat(task): task worker main loop with Start/Stop/panic recovery"
```

---

### Task D4: Tick 实现（timeout 回收 + fetch + 清理）

**Files:**
- Create: `backend/service/task_tick.go`
- Create: `backend/service/task_tick_test.go`

- [ ] **Step 1: 实现 tick 函数（含 3 个步骤）**

Create `backend/service/task_tick.go`:

```go
package service

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/adaptor/task"
	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

// TickContext worker tick 的依赖注入
type TickContext struct {
	ErrorCounter *TaskErrorCounter
	BillingFn    TaskBillingFn // SUCCESS → consume / FAILURE → refund
}

// TaskBillingFn 计费回调签名（Phase F 实现）
type TaskBillingFn interface {
	OnSuccess(t *model.Task, fetchData []byte) error
	OnFailure(t *model.Task, reason string) error
}

func Tick(ctx context.Context, tc *TickContext) {
	// 1. 超时回收
	timeoutTasks, err := model.ListTimeoutTasks(config.TaskWorkerBatchSize)
	if err == nil {
		for _, t := range timeoutTasks {
			t := t
			logger.SysLog("task timeout reclaim task_id=" + t.TaskID)
			tc.BillingFn.OnFailure(&t, "worker_timeout")
		}
	}

	// 2. fetch pending
	pending, err := model.ListPendingTasks(config.TaskWorkerBatchSize)
	if err != nil {
		logger.SysError("list pending tasks: " + err.Error())
		return
	}

	// 按 platform 分组并发，每 platform 最多 5 并发
	groups := map[string][]model.Task{}
	for _, t := range pending {
		groups[t.Platform] = append(groups[t.Platform], t)
	}

	var wg sync.WaitGroup
	for platform, ts := range groups {
		wg.Add(1)
		go func(p string, ts []model.Task) {
			defer wg.Done()
			sem := make(chan struct{}, 5)
			var iwg sync.WaitGroup
			for _, t := range ts {
				sem <- struct{}{}
				iwg.Add(1)
				go func(tk model.Task) {
					defer func() { <-sem; iwg.Done() }()
					fetchOne(ctx, &tk, tc)
				}(t)
			}
			iwg.Wait()
		}(platform, ts)
	}
	wg.Wait()

	// 3. 凌晨 3 点清理过期任务（一天一次）
	now := time.Now()
	if now.Hour() == 3 && now.Minute() == 0 {
		if n, err := model.CleanOldTasks(config.TaskRetentionDays); err == nil && n > 0 {
			logger.SysLog("task cleanup removed " + itoa(n) + " old records")
		}
	}
}

func fetchOne(ctx context.Context, t *model.Task, tc *TickContext) {
	channel, err := model.GetChannelById(t.ChannelId, false)
	if err != nil {
		tc.ErrorCounter.Increment(t.TaskID)
		return
	}
	adaptor := task.AdaptorOf(t.Platform)
	if adaptor == nil {
		return
	}

	info := &common.TaskRelayInfo{
		UserID:    t.UserId,
		ChannelID: t.ChannelId,
		BaseURL:   channel.GetBaseURL(),
		APIKey:    channel.Key,
	}
	adaptor.Init(info)

	res, err := adaptor.FetchTask(info, t.PrivateData.UpstreamTaskID)
	if err != nil {
		n, _ := tc.ErrorCounter.Increment(t.TaskID)
		logger.SysError("task fetch error task_id=" + t.TaskID + " attempt=" + itoa(n) + " err=" + err.Error())
		if int(n) >= config.TaskMaxFetchErrors {
			tc.BillingFn.OnFailure(t, "fetch_max_retries: "+err.Error())
			tc.ErrorCounter.Reset(t.TaskID)
		}
		return
	}

	tc.ErrorCounter.Reset(t.TaskID)

	switch res.Status {
	case "completed":
		logger.SysLog("task done task_id=" + t.TaskID + " status=success")
		_ = tc.BillingFn.OnSuccess(t, res.Result)
	case "failed":
		logger.SysLog("task done task_id=" + t.TaskID + " status=failure reason=" + res.FailReason)
		_ = tc.BillingFn.OnFailure(t, res.FailReason)
	case "processing":
		_ = model.UpdateTaskStatus(model.DB, t.TaskID, map[string]interface{}{
			"status":   model.TaskStatusInProgress,
			"progress": res.Progress,
		})
	case "queued":
		_ = model.UpdateTaskStatus(model.DB, t.TaskID, map[string]interface{}{
			"status": model.TaskStatusQueued,
		})
	}
	_ = json.Unmarshal // 留作未来：把 res.Result 写到 t.Data
}

func itoa(n int64) string  { return strconv.FormatInt(n, 10) }
func itoaI(n int) string   { return strconv.Itoa(n) }
```

> 注：在 `task_tick.go` 顶部的 import 块里加 `"strconv"`。Increment 返回 int64 用 itoa；普通 int 用 itoaI。

- [ ] **Step 2: 写测试（用 mock BillingFn）**

Create `backend/service/task_tick_test.go`：

```go
package service

import (
	"context"
	"testing"

	"github.com/songquanpeng/one-api/model"
	"github.com/stretchr/testify/assert"
)

type mockBilling struct {
	successCalls int
	failureCalls int
}

func (m *mockBilling) OnSuccess(t *model.Task, _ []byte) error { m.successCalls++; return nil }
func (m *mockBilling) OnFailure(t *model.Task, _ string) error { m.failureCalls++; return nil }

// 注：完整 Tick 测试需要 mock DB，超出当前范围；
// 这里仅做编译/接口装配验证
func TestTick_interface_wire(t *testing.T) {
	tc := &TickContext{
		BillingFn: &mockBilling{},
	}
	// 不调用 Tick，仅验证类型匹配
	assert.NotNil(t, tc.BillingFn)
	_ = context.Background()
}
```

- [ ] **Step 3: build + 编译通过 + commit**

```bash
cd backend && go build ./...
go test ./service/ -run TestTick -v
git add backend/service/task_tick.go backend/service/task_tick_test.go
git commit -m "feat(task): worker tick — timeout reclaim + batched fetch + cleanup"
```

> 实际 DB 集成测试在 Phase I E2E 阶段做。

---

### Task D5: 在 main.go 启动 worker

**Files:**
- Modify: `backend/main.go`

- [ ] **Step 1: 找到 main.go 现有的 init 序列**

Run: `grep -n "func main\|model.InitDB\|router.SetRouter" backend/main.go`

- [ ] **Step 2: 在 router 启动之前加 worker.Start**

在 model DB 初始化完、router.SetRouter() 之前插入：

```go
if config.EnableTaskSystem {
	taskErrorCounter := service.NewTaskErrorCounter(common.RedisClient) // 用项目现有 Redis client
	billing := billing.NewTaskBilling()                                  // Phase F 实现
	tc := &service.TickContext{
		ErrorCounter: taskErrorCounter,
		BillingFn:    billing,
	}
	worker := service.NewTaskWorker(
		config.TaskWorkerInterval,
		config.TaskWorkerBatchSize,
		func(ctx context.Context) { service.Tick(ctx, tc) },
	)
	worker.Start()

	// 注册 SIGTERM hook
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-c
		worker.Stop()
		os.Exit(0)
	}()

	logger.SysLog("task system enabled, worker started")
} else {
	logger.SysLog("task system disabled (set ENABLE_TASK_SYSTEM=true to enable)")
}
```

需要 import：`"context"`, `"os"`, `"os/signal"`, `"syscall"`, `"github.com/songquanpeng/one-api/service"`, `"github.com/songquanpeng/one-api/relay/billing"`, `"github.com/songquanpeng/one-api/common"`。

> 注：`billing.NewTaskBilling()` 是 Phase F 实现的；为了让 Phase D 单独 build 过，先 stub：在 `relay/billing/task_billing.go` 创建空实现：

```go
package billing

import "github.com/songquanpeng/one-api/model"

type TaskBilling struct{}

func NewTaskBilling() *TaskBilling                                 { return &TaskBilling{} }
func (b *TaskBilling) OnSuccess(t *model.Task, _ []byte) error    { return nil }
func (b *TaskBilling) OnFailure(t *model.Task, _ string) error    { return nil }
```

Phase F 会替换 stub。

- [ ] **Step 3: build + run 验证**

```bash
cd backend && go build ./...
ENABLE_TASK_SYSTEM=true go run main.go &
sleep 3
grep "task worker" <(docker logs one-api 2>&1 | tail -20) || tail -20 ~/lingjing-ai/log.txt
kill %1
```

Expected: 日志包含 "task system enabled, worker started"

- [ ] **Step 4: commit**

```bash
git add backend/main.go backend/relay/billing/task_billing.go
git commit -m "feat(task): wire worker startup with feature flag and SIGTERM hook"
```

---

# Phase E — Controllers（0.5 天）

**前置条件**: Phase A-D 完成

**验收标准**:
- `POST /v1/images/generations` 对异步 channel 返 task_id
- `GET /v1/tasks/{id}` 返完整任务状态（同 user / admin 鉴权正确）
- `POST /v1/tasks/batch` / `cancel` 正常
- admin 5 个接口工作

**回滚**: `git revert <phase-E-commits>`

---

### Task E1: 修改 RelayImage 加 if 分支

**Files:**
- Modify: `backend/controller/relay.go`（或 image 相关文件）
- Test: `backend/controller/relay_image_test.go`（新建）

- [ ] **Step 1: 找现有 RelayImage 函数**

Run: `grep -rn "func.*RelayImage\b" backend/`

- [ ] **Step 2: 抽出现有函数体为 relayImageSync**

把现有 `func RelayImage(c *gin.Context)` 整体内容（不改一字）改名为 `func relayImageSync(c *gin.Context)`。然后写新的 RelayImage 分发器：

```go
import (
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/relay/adaptor/task"
	"github.com/songquanpeng/one-api/relay/channeltype"
)

func RelayImage(c *gin.Context) {
	// 解析请求里的 model
	modelName, _ := c.GetPostForm("model")
	if modelName == "" {
		// 从 JSON body 拿
		modelName = getModelFromJSONBody(c)
	}

	// 查 model 对应的 channel.Type（用现有的 model→channel 路由逻辑）
	channelType := getChannelTypeForModel(c, modelName)

	if config.EnableTaskSystem && task.IsAsyncTaskType(channelType) {
		RelayTaskImage(c) // 新函数，下个 task 实现
		return
	}
	relayImageSync(c) // 现有流程
}
```

- [ ] **Step 3: build + commit（中间状态，RelayTaskImage 还是 stub）**

先在 `controller/task_relay.go` 写 stub：

```go
package controller

import "github.com/gin-gonic/gin"

func RelayTaskImage(c *gin.Context) {
	c.JSON(501, gin.H{"error": gin.H{"message": "task relay not implemented"}})
}
```

```bash
cd backend && go build ./...
git add backend/controller/relay.go backend/controller/task_relay.go
git commit -m "feat(task): RelayImage dispatcher with feature flag if-branch"
```

- [ ] **Step 4: 测试同步路径无回归**

```bash
ENABLE_TASK_SYSTEM=false go run main.go &
sleep 3
curl -X POST http://localhost:3000/v1/images/generations \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"a cat","n":1,"size":"1024x1024"}'
kill %1
```
Expected: 正常返回（同步图像不动）

---

### Task E2: RelayTaskImage 实现

**Files:**
- Modify: `backend/controller/task_relay.go`

- [ ] **Step 1: 实现完整提交流程**

替换 stub：

```go
package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/adaptor/task"
	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
	"github.com/songquanpeng/one-api/relay/billing"
	"github.com/songquanpeng/one-api/common/config"
)

type taskRequestBody struct {
	Model      string   `json:"model"`
	Prompt     string   `json:"prompt"`
	N          int      `json:"n"`
	Size       string   `json:"size"`
	Resolution string   `json:"resolution"`
	ImageURLs  []string `json:"image_urls"`
}

func RelayTaskImage(c *gin.Context) {
	var req taskRequestBody
	raw, _ := readBody(c)
	if err := json.Unmarshal(raw, &req); err != nil {
		errResp(c, 400, "invalid_request_error", "bad json: "+err.Error())
		return
	}

	userID := c.GetInt("id")
	tokenID := c.GetInt("token_id")
	group := c.GetString("group")

	// 查 model 对应 channel
	channel, err := model.GetRandomSatisfiedChannel(group, req.Model)
	if err != nil {
		errResp(c, 400, "model_not_found", "no available channel for model "+req.Model)
		return
	}

	adaptor := task.AdaptorOf(task.PlatformOf(channel.Type))
	if adaptor == nil {
		errResp(c, 500, "internal", "no adaptor for channel type")
		return
	}

	info := &common.TaskRelayInfo{
		UserID:          userID,
		TokenID:         tokenID,
		ChannelID:       channel.Id,
		BaseURL:         channel.GetBaseURL(),
		APIKey:          channel.Key,
		OriginModelName: req.Model,
		Prompt:          req.Prompt,
		Size:            req.Size,
		Resolution:      req.Resolution,
		N:               req.N,
		ImageURLs:       req.ImageURLs,
		Group:           group,
	}
	// model_mapping
	info.UpstreamModelName = applyModelMapping(channel, req.Model)

	adaptor.Init(info)
	if err := adaptor.ValidateRequest(info); err != nil {
		errResp(c, 400, "invalid_request_error", err.Error())
		return
	}

	// 预扣 quota
	estimatedQuota := estimateImageQuota(req)
	if err := billing.PreConsumeTaskQuota(userID, tokenID, channel.Id, estimatedQuota, req.Model); err != nil {
		errResp(c, 402, "insufficient_quota", err.Error())
		return
	}

	// 落 task 记录
	taskUUID := "task_" + uuid.New().String()
	taskRecord := &model.Task{
		TaskID:     taskUUID,
		Platform:   task.PlatformOf(channel.Type),
		UserId:     userID,
		Group:      group,
		ChannelId:  channel.Id,
		Quota:      estimatedQuota,
		Action:     "image_generations",
		Status:     model.TaskStatusNotStart,
		Properties: model.TaskProperties{Input: req.Prompt, OriginModelName: req.Model, UpstreamModelName: info.UpstreamModelName},
		PrivateData: model.TaskPrivateData{TokenId: tokenID},
		TimeoutAt:  time.Now().Add(time.Duration(config.TaskTimeoutMinutes) * time.Minute).Unix(),
	}
	if err := model.CreateTask(taskRecord); err != nil {
		// 预扣已发生 → 退回
		_ = billing.RefundTaskQuota(userID, channel.Id, estimatedQuota, taskUUID, "create_task_failed")
		errResp(c, 500, "internal", "create task: "+err.Error())
		return
	}

	// 提交上游
	body, _ := adaptor.BuildRequestBody(info)
	upstreamTaskID, rawResp, err := adaptor.DoRequest(info, body)
	if err != nil {
		_ = model.UpdateTaskStatus(model.DB, taskUUID, map[string]interface{}{
			"status":      model.TaskStatusFailure,
			"fail_reason": err.Error(),
		})
		_ = billing.RefundTaskQuota(userID, channel.Id, estimatedQuota, taskUUID, "submit_failed")
		errResp(c, 502, "upstream_error", err.Error())
		return
	}

	// 更新 task 记录为 SUBMITTED + 写入上游 task_id
	taskRecord.PrivateData.UpstreamTaskID = upstreamTaskID
	_ = model.UpdateTaskStatus(model.DB, taskUUID, map[string]interface{}{
		"status":       model.TaskStatusSubmitted,
		"submit_time":  time.Now().Unix(),
		"private_data": taskRecord.PrivateData,
		"data":         json.RawMessage(rawResp),
	})

	logger.SysLog("task submit task_id=" + taskUUID + " user_id=" + strconv.Itoa(userID) +
		" channel=" + strconv.Itoa(channel.Id) + " quota=" + strconv.Itoa(estimatedQuota))

	c.JSON(http.StatusOK, gin.H{
		"created": time.Now().Unix(),
		"data": []gin.H{
			{"task_id": taskUUID, "status": "submitted"},
		},
	})
}

func readBody(c *gin.Context) ([]byte, error) {
	if c.Request.Body == nil {
		return nil, errors.New("empty body")
	}
	raw := make([]byte, c.Request.ContentLength)
	_, err := c.Request.Body.Read(raw)
	return raw, err
}

func errResp(c *gin.Context, code int, typ, msg string) {
	c.JSON(code, gin.H{"error": gin.H{"message": msg, "type": typ}})
}

func estimateImageQuota(req taskRequestBody) int {
	// 简单实现：1024 quota/张，按 n 倍数
	n := req.N
	if n <= 0 {
		n = 1
	}
	return 1024 * n
}

func applyModelMapping(channel *model.Channel, original string) string {
	// 简单 stub；实际从 channel.ModelMapping JSON 取
	return original
}
```

> 注：项目里如果有 `getRequestBody(c)` 之类的现成 helper，用现成的。`uuid` 包如未引入：`go get github.com/google/uuid`。

- [ ] **Step 2: build**

```bash
cd backend && go build ./...
```

- [ ] **Step 3: commit**

```bash
git add backend/controller/task_relay.go backend/go.mod backend/go.sum
git commit -m "feat(task): RelayTaskImage end-to-end submit (pre-consume + DoRequest)"
```

---

### Task E3: GetTask / GetTasksBatch / CancelTask

**Files:**
- Create: `backend/controller/task.go`

- [ ] **Step 1: 写完整 controller**

Create `backend/controller/task.go`:

```go
package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/billing"
)

// GetTask GET /v1/tasks/{id}
func GetTask(c *gin.Context) {
	taskID := c.Param("id")
	userID := c.GetInt("id")
	isAdmin := c.GetBool("admin")

	var t *model.Task
	var err error
	if isAdmin {
		t, err = model.GetTaskByTaskID(taskID)
	} else {
		t, err = model.GetUserTask(userID, taskID)
	}
	if err != nil {
		errResp(c, 404, "not_found_error", "task not found or expired")
		return
	}

	c.JSON(http.StatusOK, taskToOpenAIView(t))
}

// GetTasksBatch POST /v1/tasks/batch
func GetTasksBatch(c *gin.Context) {
	var req struct {
		TaskIDs []string `json:"task_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.TaskIDs) == 0 {
		errResp(c, 400, "invalid_request_error", "task_ids required")
		return
	}
	if len(req.TaskIDs) > 50 {
		errResp(c, 400, "invalid_request_error", "max 50 task_ids per batch")
		return
	}

	userID := c.GetInt("id")
	isAdmin := c.GetBool("admin")
	var tasks []model.Task
	q := model.DB.Where("task_id IN ?", req.TaskIDs)
	if !isAdmin {
		q = q.Where("user_id = ?", userID)
	}
	q.Find(&tasks)

	out := []gin.H{}
	for _, t := range tasks {
		t := t
		out = append(out, taskToOpenAIView(&t))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// CancelTask POST /v1/tasks/{id}/cancel
func CancelTask(c *gin.Context) {
	taskID := c.Param("id")
	userID := c.GetInt("id")
	isAdmin := c.GetBool("admin")

	var t *model.Task
	var err error
	if isAdmin {
		t, err = model.GetTaskByTaskID(taskID)
	} else {
		t, err = model.GetUserTask(userID, taskID)
	}
	if err != nil {
		errResp(c, 404, "not_found_error", "task not found")
		return
	}

	switch t.Status {
	case model.TaskStatusSubmitted, model.TaskStatusQueued, model.TaskStatusInProgress, model.TaskStatusUnknown:
		// OK to cancel
	default:
		errResp(c, 400, "invalid_state", "task in state "+string(t.Status)+" cannot be canceled")
		return
	}

	tb := billing.NewTaskBilling()
	_ = tb.OnFailure(t, "user_canceled")

	c.JSON(http.StatusOK, gin.H{"id": taskID, "status": "canceled"})
}

func taskToOpenAIView(t *model.Task) gin.H {
	var status string
	switch t.Status {
	case model.TaskStatusSuccess:
		status = "completed"
	case model.TaskStatusFailure, model.TaskStatusTimeout:
		status = "failed"
	case model.TaskStatusInProgress:
		status = "in_progress"
	case model.TaskStatusQueued, model.TaskStatusUnknown:
		status = "queued"
	case model.TaskStatusSubmitted:
		status = "submitted"
	default:
		status = "submitted"
	}

	progress := 0
	if t.Progress != "" {
		_, _ = fmt.Sscanf(t.Progress, "%d", &progress)
	}

	view := gin.H{
		"id":           t.TaskID,
		"object":       "task",
		"status":       status,
		"progress":     progress,
		"created_at":   t.CreatedAt,
		"started_at":   t.StartTime,
		"completed_at": t.FinishTime,
		"model":        t.Properties.OriginModelName,
	}

	if t.Status == model.TaskStatusSuccess && len(t.Data) > 0 {
		// 把上游原始 data 透传出去（前端按 platform 自己解析图 URL）
		view["result"] = gin.H{"raw": json.RawMessage(t.Data)}
		view["usage"] = gin.H{
			"cost_quota": t.Quota,
			"cost_usd":   float64(t.Quota) / 500000.0,
		}
	}
	if status == "failed" {
		view["error"] = gin.H{"message": t.FailReason}
	}

	_ = time.Now() // suppress lint
	return view
}
```

> 注：上面用到 `fmt`、`json` 未 import，需要加。

- [ ] **Step 2: build + commit**

```bash
cd backend && go build ./...
git add backend/controller/task.go
git commit -m "feat(task): GET /v1/tasks/{id}, batch, cancel controllers"
```

---

### Task E4: Admin Controllers

**Files:**
- Create: `backend/controller/admin_task.go`

- [ ] **Step 1: 写 5 个 admin 接口**

Create `backend/controller/admin_task.go`:

```go
package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/billing"
)

// AdminListTasks GET /api/admin/tasks
func AdminListTasks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("p", "0"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize > 100 {
		pageSize = 100
	}
	platform := c.Query("platform")
	status := c.Query("status")
	userIDStr := c.Query("user_id")
	keyword := c.Query("keyword")

	q := model.DB.Model(&model.Task{})
	if platform != "" {
		q = q.Where("platform = ?", platform)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if userIDStr != "" {
		uid, _ := strconv.Atoi(userIDStr)
		q = q.Where("user_id = ?", uid)
	}
	if keyword != "" {
		q = q.Where("task_id LIKE ?", "%"+keyword+"%")
	}

	var total int64
	q.Count(&total)
	var rows []model.Task
	q.Order("created_at DESC").Limit(pageSize).Offset(page * pageSize).Find(&rows)

	c.JSON(http.StatusOK, gin.H{
		"data":  rows,
		"total": total,
		"page":  page,
	})
}

// AdminGetTask GET /api/admin/tasks/:id
func AdminGetTask(c *gin.Context) {
	t, err := model.GetTaskByTaskID(c.Param("id"))
	if err != nil {
		errResp(c, 404, "not_found_error", "task not found")
		return
	}
	c.JSON(http.StatusOK, t)
}

// AdminRetryTask POST /api/admin/tasks/:id/retry
func AdminRetryTask(c *gin.Context) {
	t, err := model.GetTaskByTaskID(c.Param("id"))
	if err != nil {
		errResp(c, 404, "not_found_error", "task not found")
		return
	}
	if t.Status != model.TaskStatusFailure && t.Status != model.TaskStatusTimeout {
		errResp(c, 400, "invalid_state", "only FAILURE/TIMEOUT can retry")
		return
	}

	updates := map[string]interface{}{
		"status":      model.TaskStatusSubmitted,
		"fail_reason": "",
		"timeout_at":  time.Now().Add(time.Duration(config.TaskTimeoutMinutes) * time.Minute).Unix(),
	}
	if err := model.UpdateTaskStatus(model.DB, t.TaskID, updates); err != nil {
		errResp(c, 500, "internal", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": t.TaskID, "status": "submitted"})
}

// AdminRefundTask POST /api/admin/tasks/:id/refund
func AdminRefundTask(c *gin.Context) {
	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.Reason == "" {
		errResp(c, 400, "invalid_request_error", "reason required")
		return
	}

	t, err := model.GetTaskByTaskID(c.Param("id"))
	if err != nil {
		errResp(c, 404, "not_found_error", "task not found")
		return
	}
	if t.Status != model.TaskStatusSuccess {
		errResp(c, 400, "invalid_state", "only SUCCESS can be manually refunded")
		return
	}

	tb := billing.NewTaskBilling()
	if err := tb.OnFailure(t, "admin_manual_refund: "+req.Reason); err != nil {
		errResp(c, 500, "internal", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": t.TaskID, "status": "refunded"})
}
```

- [ ] **Step 2: build + commit**

```bash
cd backend && go build ./...
git add backend/controller/admin_task.go
git commit -m "feat(task): admin list/get/retry/refund task controllers"
```

---

### Task E5: Router 注册

**Files:**
- Modify: `backend/router/relay.go`
- Modify: `backend/router/api.go`

- [ ] **Step 1: 在 relay.go 加 user-facing 路由**

找到 `relayV1Router.POST("/chat/completions", controller.Relay)` 这种现有路由的代码块，在末尾加：

```go
if config.EnableTaskSystem {
	relayV1Router.GET("/tasks/:id", controller.GetTask)
	relayV1Router.POST("/tasks/batch", controller.GetTasksBatch)
	relayV1Router.POST("/tasks/:id/cancel", controller.CancelTask)
}
```

需要 `import "github.com/songquanpeng/one-api/common/config"`。

- [ ] **Step 2: 在 api.go 加 admin 路由**

找到 `channelRoute := apiRouter.Group("/channel"); channelRoute.Use(middleware.AdminAuth())` 这种现有 admin 路由块附近，加一组：

```go
if config.EnableTaskSystem {
	taskAdminRoute := apiRouter.Group("/admin/tasks")
	taskAdminRoute.Use(middleware.AdminAuth())
	taskAdminRoute.GET("", controller.AdminListTasks)
	taskAdminRoute.GET("/:id", controller.AdminGetTask)
	taskAdminRoute.POST("/:id/retry", controller.AdminRetryTask)
	taskAdminRoute.POST("/:id/refund", controller.AdminRefundTask)
}
```

- [ ] **Step 3: build + run + smoke 测试**

```bash
cd backend && go build ./...
ENABLE_TASK_SYSTEM=true go run main.go &
sleep 3

# 异步路由要鉴权但应能响应 401（路由存在）
curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000/v1/tasks/test_id
# Expected: 401

# admin 路由
curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/tasks
# Expected: 401

kill %1
```

- [ ] **Step 4: commit**

```bash
git add backend/router/relay.go backend/router/api.go
git commit -m "feat(task): register /v1/tasks/* and /api/admin/tasks/* routes"
```

---

# Phase F — 计费整合（0.5 天）

**前置条件**: Phase A + D + E 完成

**验收标准**:
- 预扣 → 实际记账 → 退款链路完整跑通
- 现有 `consume_quota` / `quota_log` / referral 行为不变
- `quota_log` 写入时 `task_id` 字段正确填充

**回滚**: 替换回 Phase D stub 即可

---

### Task F1: PreConsumeTaskQuota

**Files:**
- Create: `backend/relay/billing/task_billing.go`（覆盖 Phase D stub）

- [ ] **Step 1: 写测试**

Create `backend/relay/billing/task_billing_test.go`:

```go
package billing

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPreConsume_basic(t *testing.T) {
	// 单元测试只测函数签名 + 业务校验；DB 集成测试在 Phase I 做
	err := PreConsumeTaskQuota(0, 0, 0, 100, "test-model")
	// 用户 0 不存在 → 报错
	assert.Error(t, err)
}
```

- [ ] **Step 2: 实现 task_billing.go（替换 Phase D stub）**

Create/Modify `backend/relay/billing/task_billing.go`:

```go
package billing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/songquanpeng/one-api/model"
)

type TaskBilling struct{}

func NewTaskBilling() *TaskBilling { return &TaskBilling{} }

// PreConsumeTaskQuota 提交任务时预扣额度（写 logs type=PRE_CONSUME）
func PreConsumeTaskQuota(userID, tokenID, channelID, quota int, modelName string) error {
	if userID == 0 {
		return errors.New("user_id required")
	}
	user, err := model.GetUserById(userID, false)
	if err != nil {
		return fmt.Errorf("get user: %w", err)
	}
	if int(user.Quota) < quota {
		return errors.New("insufficient quota")
	}

	// 扣 user.quota
	if err := model.DecreaseUserQuota(userID, int64(quota)); err != nil {
		return fmt.Errorf("decrease quota: %w", err)
	}

	// 写 quota_log: type=PRE_CONSUME 用 Type=5（项目里现有 LogTypeConsume 应该是 2，这里复用 + 用 Content 区分）
	_ = model.RecordConsumeLog(context.Background(), &model.Log{
		UserId:    userID,
		ChannelId: channelID,
		Quota:     -quota,
		ModelName: modelName,
		Content:   "[async task pre-consume]",
		// TaskId 在 OnSuccess/OnFailure 时关联
	})
	return nil
}

// RefundTaskQuota 退还预扣（写 logs type=REFUND，不触发 referral）
func RefundTaskQuota(userID, channelID, quota int, taskID, reason string) error {
	if err := model.IncreaseUserQuota(userID, int64(quota)); err != nil {
		return fmt.Errorf("increase quota: %w", err)
	}
	_ = model.RecordConsumeLog(context.Background(), &model.Log{
		UserId:    userID,
		ChannelId: channelID,
		Quota:     quota, // 正数 = 退款
		Content:   "[async task refund] " + reason,
		TaskId:    taskID,
	})
	return nil
}

// OnSuccess 任务成功：差额结算
func (b *TaskBilling) OnSuccess(t *model.Task, fetchData []byte) error {
	// MVP：暂按预扣额度结算（不调整差额）→ 后续解析 fetchData 拿 actual_cost 再多退少补
	now := time.Now().Unix()
	_ = model.UpdateTaskStatus(model.DB, t.TaskID, map[string]interface{}{
		"status":      model.TaskStatusSuccess,
		"finish_time": now,
		"progress":    "100",
		"data":        fetchData,
	})

	// 写最终消费 log（关联 task_id）→ referral 会在 RecordConsumeLog 内自动触发
	_ = model.RecordConsumeLog(context.Background(), &model.Log{
		UserId:    t.UserId,
		ChannelId: t.ChannelId,
		Quota:     0, // 差额 0（预扣已扣）
		ModelName: t.Properties.OriginModelName,
		Content:   "[async task settle]",
		TaskId:    t.TaskID,
	})
	return nil
}

// OnFailure 任务失败/超时/取消：全额退还预扣
func (b *TaskBilling) OnFailure(t *model.Task, reason string) error {
	now := time.Now().Unix()
	_ = model.UpdateTaskStatus(model.DB, t.TaskID, map[string]interface{}{
		"status":      model.TaskStatusFailure,
		"finish_time": now,
		"fail_reason": reason,
	})
	return RefundTaskQuota(t.UserId, t.ChannelId, t.Quota, t.TaskID, reason)
}
```

> 注：现有项目里如何调 `DecreaseUserQuota` / `GetUserById`？通过 Explore 已确认在 `model/user.go`。如签名不一样按现有签名改。

> 注：referral 是怎么在 RecordConsumeLog 里触发的？grep 一下 `grep -rn "referral\|invite" backend/model/log.go` 确认逻辑。如果是其它函数触发的，OnSuccess 里改成调那个函数。

- [ ] **Step 3: build + commit**

```bash
cd backend && go test ./relay/billing/... && go build ./...
git add backend/relay/billing/task_billing.go backend/relay/billing/task_billing_test.go
git commit -m "feat(task): integrate task billing (pre-consume / refund / settle)"
```

---

# Phase G — Playground 异步 tab（0.5 天）

**前置条件**: Phase E 完成（接口可用）

**验收标准**:
- playground 有新 tab "异步生成"
- 提交 → 显示进度 → 完成显示图 → 下载
- 取消可用
- 余额不足前端拦截
- 森林风格（深绿 + 翠绿）、无 AI emoji

**回滚**: `git revert <phase-G-commits>`

---

### Task G1: API client + Tab 入口

**Files:**
- Create: `frontend/src/pages/Playground/api/taskApi.js`
- Modify: `frontend/src/pages/Playground/index.jsx`（或 main tab 组件）
- Create: `frontend/src/pages/Playground/AsyncTaskTab.jsx`

- [ ] **Step 1: 写 API client**

Create `frontend/src/pages/Playground/api/taskApi.js`:

```javascript
const BASE = '/v1';

async function http(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include', // Cookie session [[feedback_auth_cookie]]
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
  return j;
}

export const taskApi = {
  submit: (payload) => http('POST', '/images/generations', payload),
  get: (taskId) => http('GET', `/tasks/${taskId}`),
  batch: (taskIds) => http('POST', '/tasks/batch', { task_ids: taskIds }),
  cancel: (taskId) => http('POST', `/tasks/${taskId}/cancel`),
};
```

- [ ] **Step 2: 加 Tab**

找到 playground 主组件（按 Explore 报告：`~/lingjing-ai/frontend/src/pages/Playground/`），在 tab 列表加 "异步生成"：

```jsx
// 假设当前结构是 Tabs：
<Tabs activeKey={activeKey} onChange={setActiveKey}>
  <TabPane key="chat" tab="聊天">...</TabPane>
  <TabPane key="image" tab="画图">...</TabPane>
  <TabPane key="async" tab="异步生成">       {/* ← 新增 */}
    <AsyncTaskTab />
  </TabPane>
</Tabs>
```

- [ ] **Step 3: stub AsyncTaskTab**

Create `frontend/src/pages/Playground/AsyncTaskTab.jsx`:

```jsx
import React from 'react';

export default function AsyncTaskTab() {
  return (
    <div style={{ padding: 24, color: '#E8F2EC' }}>
      <h2 style={{ color: '#2ECC71' }}>异步生成（开发中）</h2>
      <p>支持 gpt-image-2 / jimeng 异步图像、视频任务</p>
    </div>
  );
}
```

- [ ] **Step 4: build frontend + check**

```bash
cd ~/lingjing-ai/frontend && npm run build
ls dist/index.html
```

Expected: build 成功

- [ ] **Step 5: commit**

```bash
git add frontend/src/pages/Playground/
git commit -m "feat(playground): scaffold async task tab + taskApi client"
```

---

### Task G2: AsyncTaskTab 提交表单

**Files:**
- Modify: `frontend/src/pages/Playground/AsyncTaskTab.jsx`

- [ ] **Step 1: 写完整组件**

替换 stub:

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { taskApi } from './api/taskApi';
import TaskCard from './TaskCard';

const FOREST_BG = '#0D1F14';
const FOREST_BG_ALT = '#152B1E';
const FOREST_ACCENT = '#2ECC71';
const FOREST_TEXT = '#E8F2EC';
const FOREST_TEXT_DIM = '#8FA89A';

const MODELS = [
  { id: 'gpt-image-2', label: 'GPT Image 2 (apimart)', eta: '30-60秒', supportsRatio: true, supportsRes: true },
  { id: 'jimeng-v3.0', label: '即梦 v3.0', eta: '60-90秒', supportsRatio: false, supportsRes: false },
];

const RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'];
const RESOLUTIONS = ['1k', '2k', '4k'];

export default function AsyncTaskTab() {
  const [model, setModel] = useState(MODELS[0].id);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('16:9');
  const [resolution, setResolution] = useState('1k');
  const [n, setN] = useState(1);
  const [tasks, setTasks] = useState([]); // 仅 session 内存，最多 20，刷新即丢 [[project_playground]]
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const onSubmit = async () => {
    if (!prompt.trim()) { setErrMsg('请输入提示词'); return; }
    setSubmitting(true);
    setErrMsg('');
    try {
      const m = MODELS.find(x => x.id === model);
      const payload = {
        model,
        prompt: prompt.trim(),
        n,
      };
      if (m.supportsRatio) payload.size = size;
      if (m.supportsRes) payload.resolution = resolution;

      const resp = await taskApi.submit(payload);
      const taskId = resp.data?.[0]?.task_id;
      if (!taskId) { setErrMsg('上游未返回 task_id'); return; }

      setTasks(prev => {
        const next = [{
          taskId,
          model,
          prompt: prompt.trim(),
          status: 'submitted',
          progress: 0,
          createdAt: Date.now(),
        }, ...prev];
        return next.slice(0, 20);
      });
      setPrompt('');
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24, background: FOREST_BG, color: FOREST_TEXT, minHeight: '100vh' }}>
      <h2 style={{ color: FOREST_ACCENT, marginBottom: 16 }}>异步生成</h2>

      <div style={{ background: FOREST_BG_ALT, padding: 20, borderRadius: 8, marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: FOREST_TEXT_DIM }}>模型: </label>
          <select value={model} onChange={(e) => setModel(e.target.value)}
                  style={{ background: FOREST_BG, color: FOREST_TEXT, border: `1px solid ${FOREST_ACCENT}`, padding: 6, marginLeft: 8 }}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label} · {m.eta}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                    placeholder="一只橘猫坐在窗台上看夕阳..."
                    rows={3}
                    style={{ width: '100%', background: FOREST_BG, color: FOREST_TEXT, border: `1px solid ${FOREST_TEXT_DIM}`, padding: 10 }}/>
        </div>

        {MODELS.find(m => m.id === model)?.supportsRatio && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <span>比例: <select value={size} onChange={(e) => setSize(e.target.value)}>{RATIOS.map(r => <option key={r}>{r}</option>)}</select></span>
            <span>分辨率: <select value={resolution} onChange={(e) => setResolution(e.target.value)}>{RESOLUTIONS.map(r => <option key={r}>{r}</option>)}</select></span>
            <span>张数: <select value={n} onChange={(e) => setN(parseInt(e.target.value))}>{[1, 2, 3, 4].map(x => <option key={x}>{x}</option>)}</select></span>
          </div>
        )}

        {errMsg && <div style={{ color: '#FF6B6B', marginBottom: 8 }}>{errMsg}</div>}

        <button onClick={onSubmit} disabled={submitting}
                style={{ background: FOREST_ACCENT, color: FOREST_BG, padding: '10px 24px', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {submitting ? '提交中...' : '提交任务'}
        </button>
      </div>

      <h3 style={{ color: FOREST_TEXT_DIM, fontSize: 14, marginBottom: 12 }}>当前任务（最多 20 个，刷新即丢）</h3>
      <div style={{ display: 'grid', gap: 12 }}>
        {tasks.length === 0 && <div style={{ color: FOREST_TEXT_DIM, fontStyle: 'italic' }}>暂无任务</div>}
        {tasks.map(t => (
          <TaskCard key={t.taskId} task={t} onUpdate={(upd) => {
            setTasks(prev => prev.map(x => x.taskId === t.taskId ? { ...x, ...upd } : x));
          }} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: stub TaskCard**

Create `frontend/src/pages/Playground/TaskCard.jsx`:

```jsx
import React from 'react';

export default function TaskCard({ task, onUpdate }) {
  return (
    <div style={{ background: '#152B1E', padding: 16, borderRadius: 6, borderLeft: '3px solid #2ECC71' }}>
      <div style={{ color: '#E8F2EC' }}>{task.taskId}</div>
      <div style={{ color: '#8FA89A', fontSize: 12 }}>{task.prompt}</div>
      <div style={{ color: '#2ECC71' }}>状态: {task.status}</div>
    </div>
  );
}
```

- [ ] **Step 3: build + commit**

```bash
cd ~/lingjing-ai/frontend && npm run build
git add frontend/src/pages/Playground/
git commit -m "feat(playground): async task submit form with forest theme"
```

---

### Task G3: TaskCard 轮询 + 图片展示 + 取消

**Files:**
- Modify: `frontend/src/pages/Playground/TaskCard.jsx`

- [ ] **Step 1: 实现完整 TaskCard**

替换 stub:

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { taskApi } from './api/taskApi';

const ACCENT = '#2ECC71';
const ALT = '#152B1E';
const DIM = '#8FA89A';
const TEXT = '#E8F2EC';
const RED = '#FF6B6B';

export default function TaskCard({ task, onUpdate }) {
  const [polling, setPolling] = useState(false);
  const pollRef = useRef(null);
  const [imageUrls, setImageUrls] = useState([]);

  useEffect(() => {
    if (['completed', 'failed', 'canceled'].includes(task.status)) return;
    if (pollRef.current) return;

    const tick = async () => {
      try {
        const view = await taskApi.get(task.taskId);
        const status = view.status;
        onUpdate({ status, progress: view.progress || 0, error: view.error?.message });

        if (status === 'completed') {
          const urls = extractImageURLs(view.result?.raw);
          setImageUrls(urls);
          clearInterval(pollRef.current);
          pollRef.current = null;
        } else if (['failed', 'canceled'].includes(status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e) {
        // 静默重试，但 3 次连续失败后停止
      }
    };

    // 首查延迟 5 秒
    const firstTimer = setTimeout(() => {
      tick();
      pollRef.current = setInterval(tick, 3000);
    }, 5000);

    return () => {
      clearTimeout(firstTimer);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [task.taskId, task.status]);

  const onCancel = async () => {
    try {
      await taskApi.cancel(task.taskId);
      onUpdate({ status: 'canceled' });
    } catch (e) { /* ignore */ }
  };

  const onDownload = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `image-${task.taskId}.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const elapsed = Math.floor((Date.now() - task.createdAt) / 1000);

  return (
    <div style={{ background: ALT, padding: 16, borderRadius: 6, borderLeft: `3px solid ${ACCENT}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: TEXT, fontFamily: 'monospace', fontSize: 12 }}>{task.taskId.slice(0, 20)}...</span>
        <span style={{ color: DIM, fontSize: 12 }}>{elapsed}s</span>
      </div>

      <div style={{ color: DIM, marginBottom: 8 }}>{task.prompt}</div>

      {['submitted', 'queued', 'in_progress'].includes(task.status) && (
        <>
          <div style={{ background: '#0D1F14', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ background: ACCENT, height: '100%', width: `${task.progress || 0}%`, transition: 'width 0.5s' }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: ACCENT, fontSize: 12 }}>{task.status.toUpperCase()} {task.progress || 0}%</span>
            <button onClick={onCancel} style={{ background: 'transparent', border: `1px solid ${RED}`, color: RED, padding: '2px 12px', cursor: 'pointer' }}>取消</button>
          </div>
        </>
      )}

      {task.status === 'completed' && imageUrls.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {imageUrls.map(url => (
              <div key={url}>
                <img src={url} alt="" style={{ maxWidth: 200, borderRadius: 4 }}/>
                <button onClick={() => onDownload(url)} style={{ display: 'block', width: '100%', background: ACCENT, color: '#0D1F14', border: 'none', padding: 6, marginTop: 4, cursor: 'pointer', fontSize: 12 }}>下载</button>
              </div>
            ))}
          </div>
          <div style={{ color: DIM, fontSize: 11 }}>提示：图片 24 小时内可下载，逾期失效</div>
        </>
      )}

      {task.status === 'failed' && (
        <div style={{ color: RED }}>失败：{task.error || '未知错误'}</div>
      )}

      {task.status === 'canceled' && (
        <div style={{ color: DIM }}>已取消</div>
      )}
    </div>
  );
}

function extractImageURLs(raw) {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // 兼容 apimart 格式
    const images = data?.data?.result?.images || [];
    return images.flatMap(im => im.url || []);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: build + 浏览器测试**

```bash
cd ~/lingjing-ai/frontend && npm run build
# 部署到本地 nginx 后浏览器访问 playground，肉眼检查异步 tab
```

- [ ] **Step 3: commit**

```bash
git add frontend/src/pages/Playground/TaskCard.jsx
git commit -m "feat(playground): TaskCard with polling, image preview, download, cancel"
```

---

# Phase H — Admin 任务管理页（0.5 天）

**前置条件**: Phase E + G 完成

**验收标准**:
- admin 后台菜单"日志管理"下有"异步任务"
- 列表 + 筛选 + 分页
- 详情弹窗显示 JSON
- 重试 / 退款 / 删除按钮 + 二次确认

**回滚**: `git revert <phase-H-commits>`

---

### Task H1: Admin API client + 路由

**Files:**
- Create: `admin/src/pages/Tasks/api/taskApi.js`
- Modify: `admin/src/router/index.js` (or wherever routes are)
- Create: `admin/src/pages/Tasks/index.jsx`

- [ ] **Step 1: API client**

Create `admin/src/pages/Tasks/api/taskApi.js`:

```javascript
const BASE = '/api/admin/tasks';

async function http(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
  return j;
}

export const adminTaskApi = {
  list: (params) => http('GET', `?${new URLSearchParams(params)}`),
  get: (id) => http('GET', `/${id}`),
  retry: (id) => http('POST', `/${id}/retry`),
  refund: (id, reason) => http('POST', `/${id}/refund`, { reason }),
};
```

- [ ] **Step 2: 加路由**

按 Explore 报告 admin 用 React Router，找到现有 routes 文件，加：

```jsx
import Tasks from '@/pages/Tasks';

// routes:
{ path: '/tasks', element: <Tasks /> }
```

并在侧边菜单（找 Layout/Sidebar 组件）"日志管理"下加：

```jsx
{ key: 'tasks', label: '异步任务', path: '/tasks' }
```

- [ ] **Step 3: stub Tasks/index.jsx**

```jsx
import React from 'react';
export default function Tasks() { return <div style={{padding:24}}>异步任务管理（开发中）</div>; }
```

- [ ] **Step 4: build + commit**

```bash
cd ~/lingjing-ai/admin && npm run build
git add admin/src/pages/Tasks/ admin/src/router/  
git commit -m "feat(admin): scaffold async task management page + routing"
```

---

### Task H2: Tasks 列表 + 筛选 + 详情

**Files:**
- Modify: `admin/src/pages/Tasks/index.jsx`
- Create: `admin/src/pages/Tasks/TaskDetailDialog.jsx`

- [ ] **Step 1: 完整实现 Tasks/index.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import { adminTaskApi } from './api/taskApi';
import TaskDetailDialog from './TaskDetailDialog';

const PLATFORMS = [
  { value: '', label: '全部平台' },
  { value: 'apimart', label: 'ApiMart' },
  { value: 'jimeng', label: '即梦' },
];

const STATUSES = ['', 'SUBMITTED', 'QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'TIMEOUT'];

export default function Tasks() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ platform: '', status: '', user_id: '', keyword: '' });
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await adminTaskApi.list({ ...filters, p: page, page_size: 20 });
      setList(resp.data || []);
      setTotal(resp.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, filters]);

  const onRetry = async (id) => {
    if (!window.confirm(`重试任务 ${id}？`)) return;
    await adminTaskApi.retry(id);
    await load();
  };

  const onRefund = async (id) => {
    const reason = window.prompt('退款原因（必填）');
    if (!reason) return;
    if (!window.confirm(`确认退款给用户？此操作不可撤销`)) return;
    await adminTaskApi.refund(id, reason);
    await load();
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>异步任务</h2>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={filters.platform} onChange={e => setFilters({ ...filters, platform: e.target.value })}>
          {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          {STATUSES.map(s => <option key={s} value={s}>{s || '全部状态'}</option>)}
        </select>
        <input placeholder="用户 ID" value={filters.user_id} onChange={e => setFilters({ ...filters, user_id: e.target.value })}/>
        <input placeholder="搜索 task_id" value={filters.keyword} onChange={e => setFilters({ ...filters, keyword: e.target.value })}/>
        <button onClick={() => setPage(0)}>查询</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            <th>task_id</th><th>用户</th><th>平台</th><th>状态</th>
            <th>耗时</th><th>额度</th><th>提交时间</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {list.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.task_id.slice(0, 24)}...</td>
              <td>{t.user_id}</td>
              <td>{t.platform}</td>
              <td><span style={{ color: t.status === 'SUCCESS' ? 'green' : t.status === 'FAILURE' ? 'red' : '#666' }}>{t.status}</span></td>
              <td>{t.finish_time > 0 ? `${t.finish_time - t.submit_time}s` : '-'}</td>
              <td>¥{(t.quota / 500000).toFixed(4)}</td>
              <td>{new Date(t.created_at * 1000).toLocaleString()}</td>
              <td>
                <button onClick={() => setDetail(t)}>详情</button>
                {['FAILURE', 'TIMEOUT'].includes(t.status) && <button onClick={() => onRetry(t.task_id)}>重试</button>}
                {t.status === 'SUCCESS' && <button onClick={() => onRefund(t.task_id)}>退款</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>◀ 上一页</button>
        <span>第 {page + 1} 页 / 共 {Math.ceil(total / 20)} 页</span>
        <button onClick={() => setPage(page + 1)} disabled={(page + 1) * 20 >= total}>下一页 ▶</button>
      </div>

      {detail && <TaskDetailDialog task={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Detail dialog**

Create `admin/src/pages/Tasks/TaskDetailDialog.jsx`:

```jsx
import React from 'react';

export default function TaskDetailDialog({ task, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', padding: 24, maxWidth: 800, width: '90%', maxHeight: '80vh', overflow: 'auto', borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3>任务详情 - {task.task_id}</h3>
          <button onClick={onClose}>关闭</button>
        </div>
        <pre style={{ background: '#f5f5f5', padding: 12, overflow: 'auto', fontSize: 12 }}>
          {JSON.stringify(task, null, 2)}
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: build + commit**

```bash
cd ~/lingjing-ai/admin && npm run build
git add admin/src/pages/Tasks/
git commit -m "feat(admin): tasks list + filter + detail + retry/refund actions"
```

---

# Phase I — 部署 SOP + E2E 测试（0.5 天）

**前置条件**: Phase A-H 完成

**验收标准**:
- `scripts/deploy-task-system.sh` 跑通完整 Phase 0→3 部署
- 生产环境 ENABLE_TASK_SYSTEM=off 时跟老版本字节级等价
- 切到 on 后 curl + playground UI 全链路通

---

### Task I1: 更新 .env.example

**Files:**
- Modify: `backend/.env.example`（或项目根 .env.example）

- [ ] **Step 1: 加新变量**

在 .env.example 末尾加：

```bash
# ========== 异步任务系统 (默认 off) ==========
ENABLE_TASK_SYSTEM=false
TASK_WORKER_INTERVAL=5s
TASK_WORKER_BATCH_SIZE=50
TASK_TIMEOUT_MINUTES=10
TASK_RETENTION_DAYS=30
TASK_UPSTREAM_HTTP_TIMEOUT=30s
TASK_MAX_FETCH_ERRORS=5
```

- [ ] **Step 2: commit**

```bash
git add backend/.env.example
git commit -m "chore(task): add task system env vars to .env.example"
```

---

### Task I2: 写部署脚本

**Files:**
- Create: `scripts/deploy-task-system.sh`

- [ ] **Step 1: 写部署脚本**

Create `scripts/deploy-task-system.sh`:

```bash
#!/bin/bash
# deploy-task-system.sh — 异步任务系统分 Phase 部署
#
# 用法（在服务器上）：
#   chmod +x scripts/deploy-task-system.sh
#   ./scripts/deploy-task-system.sh phase1   # 部署代码（feature flag 默认 off）
#   ./scripts/deploy-task-system.sh phase2   # 打开 feature flag
#   ./scripts/deploy-task-system.sh phase3   # 上架 apimart 渠道（admin 后台手动建）
#   ./scripts/deploy-task-system.sh rollback # 一键回滚

set -euo pipefail

DEPLOY_DIR="/root/lingjing-ai"
BACKUP_DIR="/root/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
banner() { echo ""; echo -e "${BLUE}━━━ $1 ━━━${NC}"; echo ""; }
confirm() { read -r -p "$(echo -e "${YELLOW}>>> $1 [yes/no]: ${NC}")" R; [[ "$R" == "yes" ]] || err "已取消"; }

cd "$DEPLOY_DIR"
mkdir -p "$BACKUP_DIR"

case "${1:-}" in
  phase1)
    banner "Phase 1: 代码部署（feature flag 仍 off）"
    docker tag lingjing-api:latest "lingjing-api:rollback-task-${TIMESTAMP}"
    log "镜像备份: lingjing-api:rollback-task-${TIMESTAMP}"

    docker exec one-api-mysql mysqldump -uroot -p"$(grep MYSQL_PASSWORD one-api/.env | cut -d= -f2-)" \
      oneapi tasks logs > "${BACKUP_DIR}/db-backup-${TIMESTAMP}.sql" 2>/dev/null || true
    log "DB 备份: ${BACKUP_DIR}/db-backup-${TIMESTAMP}.sql"

    git fetch origin
    git pull origin main || err "git pull failed"
    log "代码更新到: $(git rev-parse --short HEAD)"

    docker build -t "lingjing-api:v${TIMESTAMP}-task" backend/ || err "build failed"
    docker tag "lingjing-api:v${TIMESTAMP}-task" lingjing-api:latest

    confirm "重启 backend（5-15秒生产抖动）？"
    cd one-api && docker compose up -d --force-recreate one-api && cd ..

    for i in {1..30}; do
      if curl -sf http://localhost:3000/api/status >/dev/null; then log "新版本健康"; break; fi
      sleep 1
    done
    log "Phase 1 完成。当前状态：ENABLE_TASK_SYSTEM=$(grep ^ENABLE_TASK_SYSTEM one-api/.env | cut -d= -f2 || echo off)"
    ;;

  phase2)
    banner "Phase 2: 开启 feature flag"
    grep -q "ENABLE_TASK_SYSTEM" one-api/.env || echo "ENABLE_TASK_SYSTEM=true" >> one-api/.env
    sed -i 's/^ENABLE_TASK_SYSTEM=.*/ENABLE_TASK_SYSTEM=true/' one-api/.env
    log ".env 已更新"

    confirm "重启 backend 以应用 .env？"
    cd one-api && docker compose up -d --force-recreate one-api && cd ..

    sleep 3
    docker logs one-api --tail 20 | grep "task system enabled" && log "Worker 已启动" || warn "未看到 worker 启动日志"
    log "Phase 2 完成。接下来去 admin 后台建 channel"
    ;;

  phase3)
    banner "Phase 3: 上架 apimart 渠道（手工）"
    cat <<EOF
请去 admin 后台手动建渠道：
  1. 渠道管理 → 新建
     - 类型: ApiMart (57)
     - 名称: apimart 异步图像
     - models: gpt-image-2
     - base_url: https://<你的apimart站>.com
     - key: <apimart api key>
     - group: admin   ← 先内部测试
  2. 用 admin token 测：
     curl -X POST https://api.aitoken.homes/v1/images/generations \\
       -H "Authorization: Bearer <admin-token>" \\
       -d '{"model":"gpt-image-2","prompt":"a cat","n":1,"size":"16:9","resolution":"1k"}'
  3. 拿到 task_id 后轮询 /v1/tasks/<id> 直到 completed
  4. 通过后把 group 改成 default
EOF
    ;;

  rollback)
    banner "回滚到 Phase 1 之前"
    LAST_TAG=$(docker images lingjing-api --format "{{.Tag}}" | grep "rollback-task-" | sort -r | head -1)
    [[ -z "$LAST_TAG" ]] && err "未找到 rollback tag"
    confirm "回滚到 lingjing-api:${LAST_TAG}？"
    docker tag "lingjing-api:${LAST_TAG}" lingjing-api:latest
    sed -i 's/^ENABLE_TASK_SYSTEM=.*/ENABLE_TASK_SYSTEM=false/' one-api/.env
    cd one-api && docker compose up -d --force-recreate one-api && cd ..
    log "已回滚 + flag 关闭"
    ;;

  *)
    cat <<EOF
用法: $0 [phase1|phase2|phase3|rollback]

  phase1   - 代码部署（feature flag 仍 off）
  phase2   - 打开 ENABLE_TASK_SYSTEM=true
  phase3   - 提示在 admin 后台建 channel
  rollback - 回滚镜像 + 关 flag
EOF
    ;;
esac
```

- [ ] **Step 2: chmod + commit**

```bash
chmod +x scripts/deploy-task-system.sh
git add scripts/deploy-task-system.sh
git commit -m "chore(task): add phased deployment script with rollback"
```

---

### Task I3: E2E 测试 checklist

**Files:**
- Create: `docs/superpowers/plans/2026-05-13-async-task-e2e-checklist.md`

- [ ] **Step 1: 写 checklist**

```markdown
# 异步任务系统 E2E 测试 checklist

## 上线前（开发环境）

- [ ] `go test ./...` 全 PASS
- [ ] `npm run build`（frontend + admin）成功
- [ ] 启动 backend（ENABLE_TASK_SYSTEM=false）→ `curl /api/status` 200，无 worker 启动日志
- [ ] 启动 backend（ENABLE_TASK_SYSTEM=true）→ 日志 "task system enabled, worker started"
- [ ] `mysql -e "SHOW TABLES LIKE 'tasks';"` 表存在
- [ ] `mysql -e "SHOW COLUMNS FROM logs WHERE Field='task_id';"` 字段存在

## 同步路径回归

- [ ] curl gpt-3.5-turbo `/v1/chat/completions` 正常返回
- [ ] curl gpt-image-1 `/v1/images/generations` 同步返回 url
- [ ] playground 同步画图 tab 工作正常

## 异步路径

- [ ] admin 后台建 ApiMart 渠道（group=admin）
- [ ] curl `/v1/images/generations` model=gpt-image-2 返回 `task_id` + status=submitted
- [ ] curl `/v1/tasks/{id}` 多次 → status: submitted → in_progress → completed
- [ ] tasks 表里 status=SUCCESS、quota 实际扣到 user
- [ ] logs 表里有 task_id 关联的 [async task pre-consume] 和 [async task settle] 记录

## 失败 / 退款

- [ ] 故意配错 apimart key → submit 失败 → 401 → 不扣 quota
- [ ] 故意让 fetch 报错（停掉 mock）→ 5 次失败后 task 转 FAILURE → 用户 quota 回退到提交前

## 超时

- [ ] 配 TASK_TIMEOUT_MINUTES=1，提交后断网 65 秒 → task 转 TIMEOUT → 退款

## 取消

- [ ] playground 提交 → 立即点取消 → task 转 FAILURE reason=user_canceled → 退款

## Admin

- [ ] admin /tasks 看到列表
- [ ] 筛选 platform/status/user_id 工作
- [ ] 详情弹窗 JSON 完整
- [ ] retry 按钮：把 FAILURE 改成 SUBMITTED，worker 接管重新 fetch
- [ ] refund 按钮：要 reason，确认后用户 quota 回退

## 回滚演练

- [ ] 跑 `./scripts/deploy-task-system.sh rollback` → ENABLE_TASK_SYSTEM=false + 镜像回滚
- [ ] 同步图像 + 聊天恢复正常
```

- [ ] **Step 2: commit**

```bash
git add docs/superpowers/plans/2026-05-13-async-task-e2e-checklist.md
git commit -m "docs(task): E2E test checklist"
```

---

### Task I4: 监控 crontab

**Files:**
- Modify: `scripts/` 添加监控片段（也可写到 deploy-task-system.sh 末尾）

- [ ] **Step 1: 加监控脚本**

Create `scripts/monitor-task-system.sh`:

```bash
#!/bin/bash
# 由 crontab 每 5 分钟调用一次
# */5 * * * * /root/lingjing-ai/scripts/monitor-task-system.sh

ERRORS=$(docker logs --since 5m one-api 2>&1 | grep -cE "task refund|fetch_max_retries")
if [[ $ERRORS -gt 10 ]]; then
  # 发送告警（替换成你的 webhook）
  curl -s -X POST <你的告警 webhook> -d "{\"text\":\"灵镜异步任务告警: 5 分钟内 ${ERRORS} 条退款/重试失败\"}"
fi

# stuck 任务监控
MYSQL_PASS=$(grep MYSQL_PASSWORD /root/lingjing-ai/one-api/.env | cut -d= -f2-)
STUCK=$(docker exec one-api-mysql mysql -uroot -p"$MYSQL_PASS" oneapi -sN -e "
  SELECT COUNT(*) FROM tasks WHERE status='IN_PROGRESS' AND submit_time < UNIX_TIMESTAMP() - 300;")
if [[ $STUCK -gt 20 ]]; then
  curl -s -X POST <你的告警 webhook> -d "{\"text\":\"灵镜异步任务告警: ${STUCK} 个任务超过 5 分钟未完成\"}"
fi
```

- [ ] **Step 2: commit**

```bash
chmod +x scripts/monitor-task-system.sh
git add scripts/monitor-task-system.sh
git commit -m "chore(task): monitor script for crontab"
```

---

# 完成 — 整体校验

- [ ] 所有 Phase 测试 PASS（`go test ./...` + `npm run build`）
- [ ] 在测试环境跑完整个 E2E checklist
- [ ] 准备生产部署：通知用户、选低峰期、备份 DB、执行 phase1 → phase2 → phase3

---

## 工期复核

| Phase | 任务数 | 实际工期 |
|---|---|---|
| A | 4 | 0.5 天 |
| B | 5 | 1 天 |
| C | 3 | 1 天 |
| D | 5 | 1 天 |
| E | 5 | 0.5 天 |
| F | 1 | 0.5 天 |
| G | 3 | 0.5 天 |
| H | 2 | 0.5 天 |
| I | 4 | 0.5 天 |
| **总计** | **32** | **6 天** |

---

## 实施时的注意事项

1. **每个 Step 都是 2-5 分钟的小操作**，按顺序跑，不要跳过。
2. **commit 频率**: 每个 Task 末尾 commit 一次（约 32 次 commit），出问题时容易二分定位。
3. **跑测试**: 每个 Task 的 Step 中 "跑测试通过" 是必须的——失败不要继续，先修。
4. **不重写既有代码**: Phase A-I 全程不删除/重命名既有函数，只新增。
5. **联调点**: Phase E5 (router) + Phase F (billing) + Phase G (frontend) 之间会有跨边界 bug。建议各 Phase 都跑完 Step "build + smoke" 再进下一个。
6. **TaskBilling 在 Phase D 是 stub**: Phase F 才替换为真实实现。中间状态 worker 接到 SUCCESS/FAILURE 不会扣钱也不会退钱（无副作用）。
7. **生产部署窗口**: 等开发完后再决定。**这次绝对不要在白天上线**——参考 [[project_china_routing_fix]] 的"凌晨低峰期"原则。
