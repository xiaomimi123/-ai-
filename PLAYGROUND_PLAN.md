# 灵镜 AI 模型广场（Playground）升级方案

> 创建日期：2026-04-24
> 目的：在现有"模型广场"页面上增加**聊天**和**文生图**两大直接体验功能
> 参考：New API 的 Playground 模式

---

## 一、产品决策（已定稿）

| 维度 | 决策 |
|---|---|
| 免费试用 | ❌ 不提供 |
| 使用门槛 | 账户余额 > 0 即可 |
| 计费方式 | 按 API 正常计费，无扣费预估弹窗 |
| 聊天历史 | ✅ 后端 MySQL 存储，每用户上限 50 条对话 |
| 画图历史 | ❌ 不存储（用户需自行下载） |
| 聊天分享链接 | ❌ 不做 |
| 画图模型范围 | GPT Image 2 + Gemini 2.5 Flash Image（Nano Banana） |
| 聊天模型范围 | 所有已启用的 chat 类模型（沿用现有 `model-prices` 可见性） |

---

## 二、后端改动

### 2.1 新增路由（`router/lingjing-router.go`）

加在现有 `user := router.Group("/api/lingjing")` 组下：

```
# 代理类（session 鉴权，内部用用户默认 token 转发到 /v1/*）
POST   /api/lingjing/playground/chat                # SSE 流式代理 /v1/chat/completions
POST   /api/lingjing/playground/generate-image      # 内部按模型分发画图请求
GET    /api/lingjing/playground/models              # 返回广场可用模型列表（分聊天/画图两组）

# 聊天历史 CRUD
GET    /api/lingjing/playground/chats               # 聊天列表（分页）
GET    /api/lingjing/playground/chats/:id           # 单个对话详情
DELETE /api/lingjing/playground/chats/:id           # 删除对话
```

### 2.2 新增数据表

仅新增 1 张表：

```sql
CREATE TABLE playground_chats (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(100),
  model VARCHAR(50),
  messages JSON NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX idx_user_time (user_id, updated_at)
);
```

### 2.3 50 条上限逻辑

新建对话前：
```sql
DELETE FROM playground_chats
WHERE user_id = ?
  AND id NOT IN (
    SELECT id FROM (
      SELECT id FROM playground_chats
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 49
    ) t
  );
```

### 2.4 余额校验中间件

新建 `middleware/playground_balance.go`：

```go
func PlaygroundBalanceCheck() gin.HandlerFunc {
    return func(c *gin.Context) {
        userId := c.GetInt("id")
        user, err := model.GetUserById(userId, false)
        if err != nil || user.Quota <= 0 {
            c.JSON(200, gin.H{
                "success": false,
                "message": "账户余额不足，请先充值",
                "code":    "INSUFFICIENT_BALANCE",
            })
            c.Abort()
            return
        }
        c.Next()
    }
}
```

应用范围：`/playground/chat` + `/playground/generate-image` 两个代理接口。

### 2.5 画图请求分发逻辑

`controller/playground_image.go`：

```go
// 入参
type GenerateImageReq struct {
    Model  string `json:"model" binding:"required"`
    Prompt string `json:"prompt" binding:"required"`
    Size   string `json:"size"`     // 1024x1024 / 1792x1024 / 1024x1792
    N      int    `json:"n"`        // 默认 1
}

// 分发
switch model {
case "gpt-image-1", "gpt-image-2", "dall-e-3":
    // 强制 response_format=b64_json
    body := map[string]any{
        "model":           req.Model,
        "prompt":          req.Prompt,
        "size":            req.Size,
        "n":               req.N,
        "response_format": "b64_json",
    }
    // 内部请求 /v1/images/generations

case "gemini-2.5-flash-image", "nano-banana":
    // 走 /v1/chat/completions
    body := map[string]any{
        "model": req.Model,
        "modalities": []string{"image", "text"},
        "messages": []map[string]any{
            {"role": "user", "content": req.Prompt},
        },
    }
    // 解析 message.content 里的 image base64
}
```

**前端统一接收响应格式**（后端封装）：
```json
{
  "success": true,
  "data": {
    "images": [
      "data:image/png;base64,iVBORw0KGgoAAAA..."
    ],
    "model": "gpt-image-2",
    "prompt": "...",
    "cost_quota": 15000
  }
}
```

### 2.6 内容审核（强制）

画图 prompt 入库前必须过一遍：
```go
// 调 /v1/moderations（后端内部调用）
// 命中敏感标签直接 reject，不发送到上游
if flagged {
    c.JSON(200, gin.H{
        "success": false,
        "message": "提示词包含违规内容",
        "code":    "CONTENT_FLAGGED",
    })
    return
}
```

### 2.7 `/playground/models` 响应结构

```json
{
  "success": true,
  "data": {
    "chat": [
      { "id": "gpt-4o", "name": "GPT-4o", "input": 2.5, "output": 10 },
      { "id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "input": 3, "output": 15 }
    ],
    "image": [
      { "id": "gpt-image-2", "name": "GPT Image 2", "price_per_image": 0.04 },
      { "id": "gemini-2.5-flash-image", "name": "Nano Banana", "price_per_image": 0.025 }
    ]
  }
}
```

---

## 三、前端改动

### 3.1 页面结构

**路由**：`/playground`（扩展现有的"模型广场"路由）

```
┌─────────────────────────────────────────────────┐
│  顶部 Tab:  [💬 聊天]  [🎨 画图]                │
├──────────┬──────────────────────────┬───────────┤
│ 模型列表  │                          │ 聊天历史  │
│          │       对话/生成区         │ (仅聊天)  │
│ [GPT-4o] │                          │           │
│ [Claude] │                          │           │
│ [GPT-I2] │                          │           │
│ [NanoBn] │   ┌─────────────────┐   │           │
│          │   │  输入框 / Prompt │   │           │
│          │   └─────────────────┘   │           │
└──────────┴──────────────────────────┴───────────┘
  顶部状态条：余额 ¥XX.XX（< ¥0.1 红色提示）
```

### 3.2 聊天 Tab

- 流式渲染：`fetch` + `ReadableStream` 读 SSE，逐 token 追加
- Markdown 渲染：`react-markdown` + `highlight.js`
- 历史侧栏：
  - 显示最近 50 条对话
  - 点击加载消息 `GET /chats/:id`
  - 悬浮显示删除按钮 `DELETE /chats/:id`
- 新建对话：点"➕ 新对话"清空当前消息区
- 标题自动取首条 user 消息前 20 字

### 3.3 画图 Tab

- 模型选择器：GPT Image 2 / Nano Banana 切换
- Prompt 输入框（多行，最多 1000 字）
- 尺寸选择（仅 GPT Image 2 支持）：1024×1024 / 1792×1024 / 1024×1792
- **顶部醒目提示**：
  > ⚠️ 生成的图片不会保存在云端，请及时下载保存
- 图片展示：`<img src={base64Data}>`
- **下载按钮**：
  ```js
  const a = document.createElement('a');
  a.href = base64Data;
  a.download = `lingjing-${Date.now()}.png`;
  a.click();
  ```
- 同一 session 内保留最近 20 张图（内存 Array，不持久化）
- 刷新页面后全部丢失（这是约定）

### 3.4 前端关键文件

```
frontend/src/
├── pages/Playground/
│   ├── index.tsx              # Tab 容器
│   ├── ChatTab.tsx            # 聊天主体
│   ├── ImageTab.tsx           # 画图主体
│   ├── ModelSelector.tsx      # 左侧模型列表
│   ├── ChatHistory.tsx        # 右侧历史抽屉
│   └── components/
│       ├── StreamingMessage.tsx
│       ├── GeneratedImage.tsx
│       └── BalanceBar.tsx
└── api/playground.ts          # 前端 API 封装
```

---

## 四、分阶段任务清单

### Day 1 — 后端代理骨架
- [ ] 新建 `controller/playground_chat.go` + `controller/playground_image.go` + `controller/playground_models.go`
- [ ] 实现余额中间件 `middleware/playground_balance.go`
- [ ] 注册 5 条路由到 `router/lingjing-router.go`
- [ ] 实现 `/playground/chat` SSE 代理（含流式写入数据库）
- [ ] 实现 `/playground/generate-image` 分发逻辑
- [ ] Postman 跑通两条主路径

### Day 2 — 后端聊天历史 CRUD + 内容审核
- [ ] 迁移文件新增 `playground_chats` 表
- [ ] 实现 3 个 CRUD 接口
- [ ] 50 条上限清理逻辑
- [ ] 接入 `/v1/moderations` 前置过滤
- [ ] 单元测试关键路径

### Day 3 — 前端广场改造（Tab + 卡片）
- [ ] `/playground` 路由 + Tab 容器
- [ ] 左侧模型列表组件（调 `/playground/models`）
- [ ] 顶部余额条（调 `/api/user/self` 拿 quota）
- [ ] 封装 `api/playground.ts`

### Day 4 — 前端聊天 UI
- [ ] SSE 流式响应读取 + 渲染
- [ ] Markdown + 代码高亮
- [ ] 输入框（Ctrl+Enter 发送 / Shift+Enter 换行）
- [ ] 发送时余额 0 禁用并提示

### Day 5 — 前端聊天历史侧栏
- [ ] 历史列表（分页滚动加载）
- [ ] 点击加载详情
- [ ] 删除确认 Modal
- [ ] 新建对话清空区

### Day 6 — 前端画图 UI
- [ ] 模型切换逻辑（GPT Image 2 / Nano Banana）
- [ ] Prompt 输入 + 尺寸选择
- [ ] 图片展示 + 下载按钮
- [ ] Session 内 20 张历史（纯前端内存）

### Day 7 — 联调 + 部署
- [ ] 端到端测试：注册 → 充值 → 广场聊天 → 广场画图
- [ ] Nano Banana 响应结构联调
- [ ] 生产环境部署（`push.sh`）
- [ ] 线上烟测 3 条核心链路

---

## 五、风险清单

| 风险 | 严重度 | 对策 |
|---|---|---|
| 画图 prompt 涉黄涉政触发上游封号 | 🔴 高 | `/v1/moderations` 前置过滤，命中直接 reject |
| Nano Banana 响应结构和 OpenAI 有差异 | 🟡 中 | Day 7 预留半天联调专门跑这个 |
| 聊天流式响应中途用户余额耗尽 | 🟡 中 | 上游 relay 会自动 400，前端捕获并提示充值 |
| Electron 客户端 Cookie 持久化 | 🟡 中 | 主进程用 `persist:lingjing` partition |
| Gemini 图片 base64 体积偏大（>2MB） | 🟢 低 | 前端 `loading="lazy"` + 控制显示数量 |

---

## 六、上线验收标准

- ✅ 无余额用户无法发送消息 / 生成图片（返回 `INSUFFICIENT_BALANCE`）
- ✅ 聊天历史正确保存，且超 50 条时最老的被删
- ✅ 画图返回 base64 可直接 `<img src>` 显示
- ✅ 下载按钮可保存为 `.png` 文件
- ✅ 违规 Prompt 被 moderations 拦截，不产生计费
- ✅ 所有接口在无 session 时返回 401，session 存在但余额 0 时返回 `INSUFFICIENT_BALANCE`
- ✅ 流式输出无卡顿、无乱码

---

## 七、不在本次范围（将来版本再考虑）

- Midjourney 接入（需要 `/mj/*` 路由 + 异步任务表）
- 画图历史持久化 + OSS 存储
- 聊天对话分享公开链接
- 多轮对话的"分支"功能
- 语音输入 / 语音合成
- 团队共享 workspace
