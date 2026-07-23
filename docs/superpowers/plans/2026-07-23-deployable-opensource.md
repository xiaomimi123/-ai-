# 开源化改造一期（可部署）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把灵镜 AI 从"只能在 aitoken.homes 跑"改造成任何人 clone 后填 `.env` 即可 `docker compose up -d` 一键部署的开源白牌产品。

**Architecture:** 配置收敛为三层——部署层（根 `.env`，唯一真源）、品牌层（容器 entrypoint 生成 `config.js`，前端运行时读 `window.__CONFIG__`，**不走 Vite 编译期**）、运营层（现有 options 表不动）。全栈进 docker compose，nginx 作为唯一对外入口。支付拆成可插拔 Provider，未配置时自动降级为仅兑换码。

**Tech Stack:** Go 1.x + Gin + GORM（backend，模块路径 `github.com/songquanpeng/one-api`）、React 19 + TypeScript + Vite 8（frontend / admin）、MySQL 8.0、Redis 7、nginx、Docker Compose。

## Global Constraints

- **仓库根目录**：`/Users/lizhishaoniange/lingjing-ai`。本计划所有相对路径以此为根。
- **分支**：全部工作在 `feature/deployable` 上进行，不直接提交 `main`。
- **白牌深度仅限用户可见层**：`lingjing_*.go` 文件名、`/api/lingjing/*` 路由前缀、DB 表名、Go 模块路径 **一律不改名**。
- **不得删除 `backend/web/`**，也不得修改 `backend/main.go` 的 `//go:embed web/build/*` 指令。
- **不做 i18n**。本期新增的所有用户可见文案用中文，与现有代码一致。
- **占位符统一格式**：`CHANGE_ME_<用途>`，例如 `CHANGE_ME_MYSQL_PASSWORD`。启动自检必须拒绝任何仍以 `CHANGE_ME_` 开头的必填值。
- **旧支付回调路径 `/api/lingjing/pay/notify/hupijiao` 必须保留**（虎皮椒商户后台已配置该 URL，变更会导致线上掉单）。
- **MySQL DSN 必须保持** `charset=utf8mb4&parseTime=True&loc=Local`。
- **compose 的 env 必须用显式 `environment:` 白名单**，不使用 `env_file` 全量注入（项目既有约定）。新增任何环境变量都必须手动加进 `environment:` 段。
- **协议 MIT**，`NOTICE` 中保留 One API 原始版权声明。
- 每个 Task 结束时提交，commit message 用中文，格式 `<type>(<scope>): <说明>`，与现有 git 历史一致。

## 文件结构

**新建：**

| 路径 | 职责 |
|---|---|
| `LICENSE` | MIT 协议全文 |
| `NOTICE` | One API 原始版权声明与衍生说明 |
| `.env.example` | 部署层全量环境变量模板（唯一真源的模板） |
| `docker-compose.yml` | 根编排：nginx / frontend / admin / backend / mysql / redis |
| `docker-compose.override.yml.example` | 本地开发覆盖（暴露端口、跳过 nginx） |
| `backend/common/config/validate.go` | 启动自检：必填项与占位符校验 |
| `backend/common/config/validate_test.go` | 自检单测 |
| `backend/middleware/cors_test.go` | CORS 白名单解析单测 |
| `backend/payment/provider.go` | `Provider` 接口与 `NotifyResult` 类型 |
| `backend/payment/registry.go` | provider 注册表与 `AnyConfigured()` |
| `backend/payment/hupijiao/hupijiao.go` | 虎皮椒实现（从 `lingjing_pay.go` 迁入） |
| `backend/payment/hupijiao/sign.go` | 签名与验签 |
| `backend/payment/hupijiao/sign_test.go` | 签名单测 |
| `frontend/Dockerfile` | 多阶段构建 |
| `frontend/docker-entrypoint.sh` | 生成 `config.js` |
| `frontend/src/runtimeConfig.ts` | 读 `window.__CONFIG__`，带开发态 fallback |
| `frontend/src/runtimeConfig.test.ts` | fallback 逻辑单测 |
| `admin/Dockerfile` | 多阶段构建 |
| `admin/docker-entrypoint.sh` | 生成 `config.js` |
| `admin/src/runtimeConfig.ts` | 同 frontend |
| `nginx/templates/site.conf.template` | envsubst 模板 |
| `nginx/Dockerfile` | 基于 nginx:alpine，注入模板与 entrypoint |
| `README.md` | 项目门面 |
| `docs/deployment.md` / `configuration.md` / `payment-provider.md` / `upgrade.md` | 四篇文档 |
| `docs/production-migration-runbook.md` | 生产站切换 runbook |

**修改：**

| 路径 | 改动 |
|---|---|
| `backend/common/config/config.go:15-16,106` | `SystemName` / `ServerAddress` / `RootUserEmail` 改从 env 读 |
| `backend/middleware/cors.go:40-41` | 白名单从 `CORS_ALLOWED_ORIGINS` 读 |
| `backend/controller/lingjing_pay.go` | 拆出 provider；品牌串改用 `config.SystemName`；`serverAddr` fallback 去域名 |
| `backend/router/lingjing-router.go:21-22` | 新增 `:provider` 路由，保留旧路径 |
| `frontend/src/api/index.ts:5` | `import.meta.env` → `runtimeConfig` |
| `frontend/src/pages/ModelDetail.tsx:44` | 同上 |
| `frontend/src/pages/Docs.tsx:12,298-299,859` | 同上 + CF 排障文案条件化 |
| `frontend/src/pages/Playground/api/taskApi.ts` | 同上 |
| `frontend/index.html` / `admin/index.html` | 引入 `config.js`，标题占位 |
| `admin/src/api/index.ts:3` | baseURL 改用 `runtimeConfig` |
| `admin/src/pages/Login.tsx:27` | 提示文案去域名 |
| `admin/src/pages/PaymentSettings.tsx:188` | 回调地址动态拼接 |
| `admin/src/pages/Settings.tsx:187,300` | placeholder 去域名 |
| `deploy.sh` | 重写 |
| `push.sh` | 去阿里云 Workbench 文案 |
| `.gitignore` | 补 `frontend/.env.production` 等 |

**删除跟踪（文件保留在本地）：** `frontend/.env.production`

---

## Task 1: 分支、LICENSE 与密钥清理

**Files:**
- Create: `LICENSE`, `NOTICE`
- Modify: `.gitignore`
- Untrack: `frontend/.env.production`
- Create: `frontend/.env.production.example`

**Interfaces:**
- Consumes: 无
- Produces: `feature/deployable` 分支；后续所有 Task 在其上工作

- [ ] **Step 1: 创建分支**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git checkout -b feature/deployable
git status
```

Expected: `On branch feature/deployable`，working tree clean。

- [ ] **Step 2: 全量 git 历史扫描密钥**

```bash
docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest detect \
  --source /repo --no-banner --redact --report-format json --report-path /repo/gitleaks-report.json
echo "exit=$?"
```

Expected: `exit=0` 表示无泄漏。

**若 exit=1（发现泄漏）：停止本 Task，把 `gitleaks-report.json` 内容报告给用户，由用户决定轮换密钥还是改写历史。不要自行执行 `git filter-repo`。**

扫描完删除报告文件（它本身可能含敏感片段）：

```bash
rm -f gitleaks-report.json
```

- [ ] **Step 3: 写 LICENSE**

创建 `LICENSE`，内容为标准 MIT 全文，版权行两条（上游 + 本项目）：

```
MIT License

Copyright (c) 2023 JustSong
Copyright (c) 2026 灵镜AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: 写 NOTICE**

创建 `NOTICE`：

```
本项目基于 One API（https://github.com/songquanpeng/one-api）二次开发。

One API
Copyright (c) 2023 JustSong
Licensed under the MIT License.

本项目在其基础上新增了用户前台、管理后台、套餐与订单、分销、
异步任务系统、模型广场等功能，同样以 MIT License 发布。
Go 模块路径保留为 github.com/songquanpeng/one-api，以减少与上游
同步时的改动量，不代表上游对本项目的背书。
```

- [ ] **Step 5: 把 `frontend/.env.production` 移出跟踪**

该文件当前被 git 跟踪且写着生产域名。

```bash
cp frontend/.env.production frontend/.env.production.example
git rm --cached frontend/.env.production
```

编辑 `frontend/.env.production.example`，把内容替换为：

```
# 生产环境前端 API 地址。
# 留空 = 走同源 /api（由 nginx 反代，推荐，零 DNS 配置）。
# 仅当你的部署把 API 放在独立子域名（例如为绕开 CDN 超时限制）时才填写。
# 注意：docker compose 部署下本文件不生效，请改用根目录 .env 的 PUBLIC_API_BASE_URL。
VITE_API_BASE_URL=
```

- [ ] **Step 6: 更新 .gitignore**

在 `.gitignore` 的 `# Environment` 段落下追加：

```
frontend/.env.production
admin/.env.production
gitleaks-report.json
```

- [ ] **Step 7: 验证 .env.production 确实不再被跟踪**

```bash
git ls-files | grep -c "frontend/.env.production$"
```

Expected: `0`

- [ ] **Step 8: 提交**

```bash
git add LICENSE NOTICE .gitignore frontend/.env.production.example
git add -u frontend/.env.production
git commit -m "chore(oss): 补 MIT LICENSE 与 NOTICE，生产 env 移出版本跟踪"
```

---

## Task 2: backend 去硬编码与启动自检

**Files:**
- Modify: `backend/common/config/config.go:15-16`, `backend/common/config/config.go:106`
- Modify: `backend/middleware/cors.go:36-56`
- Create: `backend/common/config/validate.go`
- Test: `backend/common/config/validate_test.go`, `backend/middleware/cors_test.go`
- Modify: `backend/main.go`（调用自检）

**Interfaces:**
- Consumes: `github.com/songquanpeng/one-api/common/env` 的 `env.String(key, default) string`（已存在于 `backend/common/env/helper.go`）
- Produces:
  - `config.Validate() error` —— 启动自检，供 `main.go` 调用
  - `middleware.ParseAllowedOrigins(raw string) []string` —— 供 CORS 与单测使用
  - 环境变量契约：`SYSTEM_NAME`、`SERVER_ADDRESS`、`ROOT_USER_EMAIL`、`CORS_ALLOWED_ORIGINS`

- [ ] **Step 1: 写 CORS 白名单解析的失败测试**

创建 `backend/middleware/cors_test.go`：

```go
package middleware

import "testing"

func TestParseAllowedOrigins(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []string
	}{
		{"空字符串", "", []string{}},
		{"单个", "https://a.com", []string{"https://a.com"}},
		{"多个带空格", "https://a.com, https://b.com ", []string{"https://a.com", "https://b.com"}},
		{"忽略空段", "https://a.com,,https://b.com", []string{"https://a.com", "https://b.com"}},
		{"去尾斜杠", "https://a.com/", []string{"https://a.com"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ParseAllowedOrigins(tc.raw)
			if len(got) != len(tc.want) {
				t.Fatalf("长度不符: got %v want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("第 %d 项: got %q want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestOriginAllowed(t *testing.T) {
	allowed := []string{"https://example.com", "*.example.com"}
	cases := []struct {
		origin string
		want   bool
	}{
		{"https://example.com", true},
		{"https://api.example.com", true},
		{"https://admin.example.com", true},
		{"https://evil.com", false},
		{"https://notexample.com", false},
		{"http://localhost:5173", true},
		{"http://127.0.0.1:3000", true},
		{"https://localhost.evil.com", false},
	}
	for _, tc := range cases {
		if got := originAllowed(tc.origin, allowed); got != tc.want {
			t.Errorf("origin %q: got %v want %v", tc.origin, got, tc.want)
		}
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go test ./middleware/ -run 'TestParseAllowedOrigins|TestOriginAllowed' -v
```

Expected: FAIL，报 `undefined: ParseAllowedOrigins` 和 `undefined: originAllowed`。

- [ ] **Step 3: 实现 CORS 白名单参数化**

修改 `backend/middleware/cors.go`。把文件顶部注释里的 `*.aitoken.homes` 改成泛化表述，并替换 `strictCORS` 中写死的判断：

```go
// ParseAllowedOrigins 解析 CORS_ALLOWED_ORIGINS。
// 逗号分隔，支持 "*.example.com" 形式的子域通配。空段与首尾空白忽略，尾部斜杠去掉。
func ParseAllowedOrigins(raw string) []string {
	out := []string{}
	for _, part := range strings.Split(raw, ",") {
		p := strings.TrimRight(strings.TrimSpace(part), "/")
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// originAllowed 判断 origin 是否命中白名单。
// localhost / 127.0.0.1 恒定放行，供本地开发使用。
func originAllowed(origin string, allowed []string) bool {
	if strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") {
		return true
	}
	for _, a := range allowed {
		if strings.HasPrefix(a, "*.") {
			// "*.example.com" 匹配 "https://x.example.com"，
			// 但不能匹配 "https://notexample.com"，所以比对必须带前导点
			if strings.HasSuffix(origin, a[1:]) {
				return true
			}
			continue
		}
		if origin == a {
			return true
		}
	}
	return false
}
```

再把 `strictCORS()` 中的 `config.AllowOriginFunc` 替换为：

```go
func strictCORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	// withCredentials=true 时浏览器禁止 Access-Control-Allow-Origin: *，
	// 必须按请求 Origin 动态返回具体值
	allowed := ParseAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	config.AllowOriginFunc = func(origin string) bool {
		return originAllowed(origin, allowed)
	}
	config.AllowCredentials = true
	config.AllowMethods = corsMethods()
	config.AllowHeaders = corsHeaders()
	config.ExposeHeaders = []string{"Content-Length", "X-Playground-Chat-Id"}
	config.MaxAge = 12 * 60 * 60
	return cors.New(config)
}
```

`v1OpenCORS()` 和 `openFallbackCORS()` 不动。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go test ./middleware/ -run 'TestParseAllowedOrigins|TestOriginAllowed' -v
```

Expected: PASS，两个测试全绿。

- [ ] **Step 5: 写启动自检的失败测试**

创建 `backend/common/config/validate_test.go`：

```go
package config

import (
	"os"
	"strings"
	"testing"
)

func withEnv(t *testing.T, kv map[string]string, fn func()) {
	t.Helper()
	old := map[string]string{}
	for k, v := range kv {
		old[k] = os.Getenv(k)
		os.Setenv(k, v)
	}
	defer func() {
		for k, v := range old {
			if v == "" {
				os.Unsetenv(k)
			} else {
				os.Setenv(k, v)
			}
		}
	}()
	fn()
}

func TestValidateRejectsPlaceholder(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "CHANGE_ME_SESSION_SECRET",
		"SQL_DSN":        "root:pw@tcp(mysql:3306)/oneapi",
	}, func() {
		err := Validate()
		if err == nil {
			t.Fatal("占位符 SESSION_SECRET 应该被拒绝，但 Validate 返回 nil")
		}
		if !strings.Contains(err.Error(), "SESSION_SECRET") {
			t.Fatalf("错误信息应指明是哪个变量，实际: %v", err)
		}
	})
}

func TestValidateRejectsShortSecret(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "short",
		"SQL_DSN":        "root:pw@tcp(mysql:3306)/oneapi",
	}, func() {
		if err := Validate(); err == nil {
			t.Fatal("过短的 SESSION_SECRET 应该被拒绝")
		}
	})
}

func TestValidateRejectsMissingDSN(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "0123456789abcdef0123456789abcdef",
		"SQL_DSN":        "",
	}, func() {
		err := Validate()
		if err == nil {
			t.Fatal("缺失 SQL_DSN 应该被拒绝")
		}
		if !strings.Contains(err.Error(), "SQL_DSN") {
			t.Fatalf("错误信息应指明 SQL_DSN，实际: %v", err)
		}
	})
}

func TestValidateAcceptsValid(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "0123456789abcdef0123456789abcdef",
		"SQL_DSN":        "root:pw@tcp(mysql:3306)/oneapi?charset=utf8mb4&parseTime=True&loc=Local",
	}, func() {
		if err := Validate(); err != nil {
			t.Fatalf("合法配置不应报错，实际: %v", err)
		}
	})
}

func TestValidateWarnsOnMissingUtf8mb4(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "0123456789abcdef0123456789abcdef",
		"SQL_DSN":        "root:pw@tcp(mysql:3306)/oneapi",
	}, func() {
		if got := DSNWarnings(); len(got) == 0 {
			t.Fatal("缺 charset=utf8mb4 的 DSN 应产生警告")
		}
	})
}
```

- [ ] **Step 6: 运行测试确认失败**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go test ./common/config/ -run 'TestValidate|TestDSN' -v
```

Expected: FAIL，报 `undefined: Validate` / `undefined: DSNWarnings`。

- [ ] **Step 7: 实现启动自检**

创建 `backend/common/config/validate.go`：

```go
package config

import (
	"fmt"
	"os"
	"strings"
)

// placeholderPrefix 是 .env.example 里所有待填值的统一前缀。
// 带着它启动说明用户直接复制了模板没有改，必须拦下来——
// 否则会出现"服务起来了但 session 全员共享同一个 secret"这类难以诊断的问题。
const placeholderPrefix = "CHANGE_ME_"

// minSessionSecretLen 是 SESSION_SECRET 的最小长度。
// 推荐用 openssl rand -base64 32 生成。
const minSessionSecretLen = 16

// Validate 在服务启动时校验部署层必填环境变量。
// 返回非 nil 时调用方应打印错误并退出，不要继续启动。
func Validate() error {
	var problems []string

	secret := os.Getenv("SESSION_SECRET")
	switch {
	case secret == "":
		problems = append(problems, "SESSION_SECRET 未设置。请在 .env 中填写，可用 `openssl rand -base64 32` 生成")
	case strings.HasPrefix(secret, placeholderPrefix):
		problems = append(problems, "SESSION_SECRET 仍是 .env.example 的占位符，请改成真实随机值（openssl rand -base64 32）")
	case len(secret) < minSessionSecretLen:
		problems = append(problems, fmt.Sprintf("SESSION_SECRET 太短（%d 字符），至少需要 %d 字符", len(secret), minSessionSecretLen))
	}

	dsn := os.Getenv("SQL_DSN")
	switch {
	case dsn == "":
		problems = append(problems, "SQL_DSN 未设置。docker compose 部署下它由 compose 拼装，请检查 .env 的 MYSQL_PASSWORD 是否已填")
	case strings.Contains(dsn, placeholderPrefix):
		problems = append(problems, "SQL_DSN 中含占位符（通常是 MYSQL_PASSWORD 没改），请填写真实数据库密码")
	}

	if len(problems) == 0 {
		return nil
	}
	return fmt.Errorf("配置自检未通过：\n  - %s", strings.Join(problems, "\n  - "))
}

// DSNWarnings 返回 DSN 的非致命问题。这些不阻止启动，但会导致中文乱码
// 或时间字段解析异常，值得在日志里显眼提示。
func DSNWarnings() []string {
	dsn := os.Getenv("SQL_DSN")
	if dsn == "" || !strings.Contains(dsn, "@tcp(") {
		return nil
	}
	var warns []string
	if !strings.Contains(dsn, "charset=utf8mb4") {
		warns = append(warns, "SQL_DSN 缺少 charset=utf8mb4，中文与 emoji 会乱码")
	}
	if !strings.Contains(dsn, "parseTime=True") {
		warns = append(warns, "SQL_DSN 缺少 parseTime=True，时间字段可能解析失败")
	}
	if !strings.Contains(dsn, "loc=Local") {
		warns = append(warns, "SQL_DSN 缺少 loc=Local，时间会按 UTC 解读")
	}
	return warns
}
```

- [ ] **Step 8: 运行测试确认通过**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go test ./common/config/ -run 'TestValidate|TestDSN' -v
```

Expected: PASS，五个测试全绿。

- [ ] **Step 9: 配置默认值改从 env 读**

修改 `backend/common/config/config.go`。第 15-16 行：

```go
var SystemName = env.String("SYSTEM_NAME", "AI API Platform")
var ServerAddress = env.String("SERVER_ADDRESS", "http://localhost:3000")
```

第 106 行：

```go
var RootUserEmail = env.String("ROOT_USER_EMAIL", "admin@example.com")
```

`env` 包已在文件顶部 import，无需新增。

注意：这三个值在 options 表里若已有记录，运行时仍以 DB 值为准（One API 既有行为），env 只提供首次启动的默认值。这一点要写进 `docs/configuration.md`。

- [ ] **Step 10: main.go 接入自检**

在 `backend/main.go` 中，紧接在配置初始化之后、数据库初始化之前插入：

```go
	if err := config.Validate(); err != nil {
		logger.FatalLog(err.Error())
	}
	for _, w := range config.DSNWarnings() {
		logger.SysError("[配置警告] " + w)
	}
```

若 `main.go` 尚未 import `config` 或 `logger`，补上 `"github.com/songquanpeng/one-api/common/config"` 与 `"github.com/songquanpeng/one-api/common/logger"`。若 `logger.FatalLog` 不存在，改用：

```go
	if err := config.Validate(); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
```

- [ ] **Step 11: 支付文件里的品牌串与域名 fallback**

修改 `backend/controller/lingjing_pay.go`：

第 141 行 `orderName = "灵镜AI-" + plan.Name` → `orderName = config.SystemName + "-" + plan.Name`

第 150 行 `orderName = fmt.Sprintf("灵镜AI-充值¥%.0f", amount)` → `orderName = fmt.Sprintf("%s-充值¥%.0f", config.SystemName, amount)`

第 192 行：

```go
	serverAddr := strings.TrimRight(model.GetOptionValue("ServerAddress"), "/")
	if serverAddr == "" {
		serverAddr = strings.TrimRight(config.ServerAddress, "/")
	}
```

第 253 行 User-Agent：

```go
	httpReq.Header.Set("User-Agent", "one-api-platform/1.0")
```

第 501 行左右的站内通知文案 `"感谢使用灵镜 AI！"` → `fmt.Sprintf("感谢使用 %s！", config.SystemName)`。

确保文件已 import `"github.com/songquanpeng/one-api/common/config"`。

- [ ] **Step 12: 全量编译与测试**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go build ./... && go test ./middleware/ ./common/config/ -v
```

Expected: 编译无错误；测试全 PASS。

- [ ] **Step 13: 确认 backend 已无硬编码生产域名**

```bash
cd /Users/lizhishaoniange/lingjing-ai && grep -rn "aitoken.homes" backend/ --include="*.go"
```

Expected: 只剩注释行（`main.go:158-159` 的 COOKIE_DOMAIN 说明、`cors.go` 顶部注释）。**若仍有代码行命中，回到对应步骤修完再继续。** 注释中的域名也一并改成 `example.com`。

- [ ] **Step 14: 提交**

```bash
git add backend/
git commit -m "refactor(config): backend 去硬编码域名，新增启动自检与 CORS 白名单参数化"
```

---

## Task 3: 根 .env.example 与 compose 骨架

**Files:**
- Create: `.env.example`, `docker-compose.yml`
- Reference: `one-api/docker-compose.yml`（迁移来源，本 Task 不删）

**Interfaces:**
- Consumes: Task 2 的环境变量契约（`SYSTEM_NAME`、`SERVER_ADDRESS`、`ROOT_USER_EMAIL`、`CORS_ALLOWED_ORIGINS`）
- Produces: 根 `docker-compose.yml` 中的 `backend` / `mysql` / `redis` 三个服务与 `api-net` 网络；后续 Task 在其上追加 `nginx` / `frontend` / `admin`

- [ ] **Step 1: 写 `.env.example`**

创建 `.env.example`：

```bash
# ==========================================
#  部署配置 —— 复制为 .env 后按注释填写
#  cp .env.example .env
# ==========================================

# ---------- 必填 ----------

# 站点主域名（含协议，不带结尾斜杠）。本地试跑填 http://localhost
SITE_URL=http://localhost

# 数据库 root 密码。禁止使用默认值。
MYSQL_PASSWORD=CHANGE_ME_MYSQL_PASSWORD

# 会话密钥。生成命令：openssl rand -base64 32
SESSION_SECRET=CHANGE_ME_SESSION_SECRET

# ---------- 站点信息 ----------

# 站点名称，显示在浏览器标题、页面 logo 旁、订单名、站内通知中
SITE_NAME=AI API Platform

# 首个注册用户会成为管理员；此邮箱仅作为管理员账号的默认邮箱
ROOT_USER_EMAIL=admin@example.com

# 前端主题色（十六进制）
BRAND_PRIMARY_COLOR=#2ECC71

# logo 图片 URL，留空使用内置默认 logo
BRAND_LOGO_URL=

# 页脚文案，留空则不显示
BRAND_FOOTER_TEXT=

# ICP 备案号（中国大陆部署需要），留空则不显示
BRAND_ICP_NUMBER=

# 客服 / 联系方式链接，留空则隐藏入口
BRAND_CONTACT_URL=

# ---------- 网络与 API 地址 ----------

# 前端调用后端的基址。
# 留空 = 走同源 /api（推荐，零额外 DNS 配置）。
# 仅当你把 API 放在独立子域名时才填，例如 https://api.example.com
PUBLIC_API_BASE_URL=

# 跨子域共享登录态。单域名部署留空即可。
# 多子域部署（如 example.com + admin.example.com）填 .example.com（注意前导点）
COOKIE_DOMAIN=

# CORS 白名单，逗号分隔。支持 *.example.com 形式的子域通配。
# localhost / 127.0.0.1 恒定放行，无需列出。
CORS_ALLOWED_ORIGINS=http://localhost

# nginx 对外端口
HTTP_PORT=80
HTTPS_PORT=443

# ---------- HTTPS ----------

# none        仅 HTTP，本地或内网使用
# letsencrypt 内置 certbot 自动签发（需域名已解析到本机）
# external    TLS 由外部终结（CDN / 外层反代 / 已有证书）
SSL_MODE=none

# SSL_MODE=letsencrypt 时必填，用于接收证书到期通知
CERTBOT_EMAIL=

# ---------- 数据持久化 ----------

# 留空 = 使用 docker named volume（推荐）
# 填绝对路径 = 使用宿主机 bind mount（用于从既有部署迁移）
MYSQL_DATA_PATH=
REDIS_DATA_PATH=

# ---------- 上传与超时 ----------

# 图生图 multipart 上传体积上限。nginx 默认仅 1M，会导致 413。
MAX_UPLOAD_SIZE=30M

# nginx 等待后端响应的上限。必须 ≥ TASK_SYNC_WAIT_SECONDS + 20
NGINX_PROXY_READ_TIMEOUT=320

# ---------- 时区 ----------

TZ=Asia/Shanghai

# ---------- 异步任务系统 ----------

ENABLE_TASK_SYSTEM=false
TASK_WORKER_INTERVAL=5s
TASK_WORKER_BATCH_SIZE=50
# 多参考图 img2img 实测 p95 > 10min，默认 20min
TASK_TIMEOUT_MINUTES=20
TASK_RETENTION_DAYS=30
# 部分上游（apimart gpt-image 系）单次 HTTP 就要跑 30-450s，默认 30s 会挂
TASK_UPSTREAM_HTTP_TIMEOUT=180s
TASK_MAX_FETCH_ERRORS=5
# sync-by-default：客户端一次调用等到出图；超时降级为 202 + task_id
TASK_SYNC_WAIT_SECONDS=300
TASK_SYNC_POLL_INTERVAL_SECONDS=2

# ---------- 其他 ----------

STREAM_NORMALIZER=on

# 紧急开关：线上 CORS 配错导致接口全挂时设为 true 快速恢复
# 牺牲安全性（任意 origin + 带凭证），修好后必须改回 false
CORS_FALLBACK_OPEN=false
```

- [ ] **Step 2: 写根 `docker-compose.yml`（backend + mysql + redis）**

创建 `docker-compose.yml`。内容是把 `one-api/docker-compose.yml` 迁上来并参数化，**保留其全部资源限制、日志轮转、MySQL 调优参数与 healthcheck**：

```yaml
services:
  backend:
    build:
      context: ./backend
    image: lingjing-api:latest
    container_name: ai-platform-backend
    restart: always
    environment:
      # 数据库 DSN：utf8mb4 / parseTime / loc 三件套缺一不可
      - SQL_DSN=root:${MYSQL_PASSWORD}@tcp(mysql:3306)/oneapi?charset=utf8mb4&parseTime=True&loc=Local
      - REDIS_CONN_STRING=redis://redis:6379
      - SESSION_SECRET=${SESSION_SECRET}
      - TZ=${TZ:-Asia/Shanghai}
      - COOKIE_DOMAIN=${COOKIE_DOMAIN:-}
      - CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-}
      - CORS_FALLBACK_OPEN=${CORS_FALLBACK_OPEN:-false}
      - SYSTEM_NAME=${SITE_NAME:-AI API Platform}
      - SERVER_ADDRESS=${SITE_URL}
      - ROOT_USER_EMAIL=${ROOT_USER_EMAIL:-admin@example.com}
      - STREAM_NORMALIZER=${STREAM_NORMALIZER:-on}
      # 异步任务系统
      - ENABLE_TASK_SYSTEM=${ENABLE_TASK_SYSTEM:-false}
      - TASK_WORKER_INTERVAL=${TASK_WORKER_INTERVAL:-5s}
      - TASK_WORKER_BATCH_SIZE=${TASK_WORKER_BATCH_SIZE:-50}
      - TASK_TIMEOUT_MINUTES=${TASK_TIMEOUT_MINUTES:-20}
      - TASK_RETENTION_DAYS=${TASK_RETENTION_DAYS:-30}
      - TASK_UPSTREAM_HTTP_TIMEOUT=${TASK_UPSTREAM_HTTP_TIMEOUT:-180s}
      - TASK_MAX_FETCH_ERRORS=${TASK_MAX_FETCH_ERRORS:-5}
      - TASK_SYNC_WAIT_SECONDS=${TASK_SYNC_WAIT_SECONDS:-300}
      - TASK_SYNC_POLL_INTERVAL_SECONDS=${TASK_SYNC_POLL_INTERVAL_SECONDS:-2}
    volumes:
      - backend-data:/data
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - api-net
    # 防 Go 服务异常泄漏吃光整机资源
    mem_limit: 4g
    mem_reservation: 512m
    cpus: "2.0"
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "3"

  mysql:
    image: mysql:8.0
    container_name: ai-platform-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_DATABASE: oneapi
      MYSQL_CHARACTER_SET_SERVER: utf8mb4
      MYSQL_COLLATION_SERVER: utf8mb4_unicode_ci
    # max_connections=500：AI 调用 hold 连接久，默认 151 不够
    # innodb_buffer_pool_size=2G：热点表常驻内存，避免磁盘 IO 成瓶颈
    command:
      - --max-connections=500
      - --innodb-buffer-pool-size=2G
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --slow-query-log=1
      - --slow-query-log-file=/var/lib/mysql/slow.log
      - --long-query-time=1
    volumes:
      - ${MYSQL_DATA_PATH:-mysql-data}:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-p${MYSQL_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - api-net
    mem_limit: 3g
    mem_reservation: 1g
    cpus: "1.5"
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    container_name: ai-platform-redis
    restart: always
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - ${REDIS_DATA_PATH:-redis-data}:/data
    networks:
      - api-net
    mem_limit: 512m
    cpus: "0.5"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "2"

networks:
  api-net:
    driver: bridge

volumes:
  mysql-data:
  redis-data:
  backend-data:
```

关于 `${MYSQL_DATA_PATH:-mysql-data}`：留空时值为 `mysql-data`，compose 解析为顶部声明的 named volume；填绝对路径时解析为 bind mount。这就是生产站零迁移的机制。

- [ ] **Step 3: 验证 compose 文件语法**

```bash
cd /Users/lizhishaoniange/lingjing-ai
cp .env.example .env
docker compose config > /dev/null && echo "语法 OK"
```

Expected: 输出 `语法 OK`。（此时 `.env` 里还是占位符，只验证语法。）

- [ ] **Step 4: 验证占位符确实被自检拦下**

填入真实 MySQL 密码但保留 `SESSION_SECRET` 占位符，确认 backend 拒绝启动：

```bash
cd /Users/lizhishaoniange/lingjing-ai
sed -i '' 's/^MYSQL_PASSWORD=.*/MYSQL_PASSWORD=testpw123/' .env
docker compose up -d mysql redis
docker compose up backend 2>&1 | tail -20
```

Expected: backend 打印 `配置自检未通过：` 并包含 `SESSION_SECRET 仍是 .env.example 的占位符`，容器退出。

**这一步是在验证 Task 2 的自检真的生效。如果 backend 正常启动了，说明自检没接进 main.go，回 Task 2 Step 10 修。**

- [ ] **Step 5: 填入真实密钥，验证 backend 起得来**

```bash
cd /Users/lizhishaoniange/lingjing-ai
SECRET=$(openssl rand -base64 32)
sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env
docker compose up -d backend
sleep 20
curl -sf http://localhost:3000/api/status | head -c 200
```

**注意**：此时 compose 尚无 nginx，backend 端口未映射到宿主机。先临时在 backend 服务下加 `ports: ["3000:3000"]` 做本步验证，验证通过后**删掉该 ports 段**（最终形态下只有 nginx 对外暴露端口）。

Expected: 返回 JSON，含 `"success":true`。

- [ ] **Step 6: 清理并提交**

```bash
cd /Users/lizhishaoniange/lingjing-ai
docker compose down
git add .env.example docker-compose.yml
git commit -m "feat(deploy): 新增根 docker-compose 与 .env.example，backend/mysql/redis 全参数化"
```

`.env` 已在 `.gitignore` 中，不会被提交。**确认一下**：`git status` 不应出现 `.env`。

---

## Task 4: frontend 运行时配置

**Files:**
- Create: `frontend/src/runtimeConfig.ts`, `frontend/src/runtimeConfig.test.ts`
- Create: `frontend/Dockerfile`, `frontend/docker-entrypoint.sh`
- Modify: `frontend/index.html`, `frontend/package.json`（加 vitest）
- Modify: `frontend/src/api/index.ts:5`, `frontend/src/pages/ModelDetail.tsx:44`, `frontend/src/pages/Docs.tsx:12,298-299,859`, `frontend/src/pages/Playground/api/taskApi.ts`

**Interfaces:**
- Consumes: Task 3 `.env.example` 中的 `PUBLIC_API_BASE_URL`、`SITE_NAME`、`BRAND_*`
- Produces:
  - `frontend/src/runtimeConfig.ts` 导出 `runtimeConfig: RuntimeConfig` 与 `readRuntimeConfig(win, viteEnv): RuntimeConfig`
  - `RuntimeConfig` 类型：`{ apiBaseUrl: string; siteName: string; logoUrl: string; primaryColor: string; footerText: string; icpNumber: string; contactUrl: string }`
  - 容器内 `/usr/share/nginx/html/config.js` 定义 `window.__CONFIG__`
- admin（Task 5）复制同一份 `runtimeConfig.ts`，字段名必须完全一致

- [ ] **Step 1: 装 vitest**

frontend 目前没有测试框架。运行时配置的 fallback 优先级是容易写错又容易回归的逻辑，值得有测试。

```bash
cd /Users/lizhishaoniange/lingjing-ai/frontend && npm install -D vitest@^3
```

在 `frontend/package.json` 的 `scripts` 中加一行：

```json
    "test": "vitest run",
```

- [ ] **Step 2: 写失败测试**

创建 `frontend/src/runtimeConfig.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { readRuntimeConfig } from './runtimeConfig'

describe('readRuntimeConfig', () => {
  it('优先取 window.__CONFIG__', () => {
    const cfg = readRuntimeConfig(
      { __CONFIG__: { apiBaseUrl: 'https://api.example.com', siteName: '我的站' } },
      { VITE_API_BASE_URL: 'https://dev.example.com' }
    )
    expect(cfg.apiBaseUrl).toBe('https://api.example.com')
    expect(cfg.siteName).toBe('我的站')
  })

  it('window.__CONFIG__ 缺失时回落到 Vite env（开发态）', () => {
    const cfg = readRuntimeConfig({}, { VITE_API_BASE_URL: 'https://dev.example.com' })
    expect(cfg.apiBaseUrl).toBe('https://dev.example.com')
  })

  it('两者都没有时 apiBaseUrl 为空字符串（走同源 /api）', () => {
    const cfg = readRuntimeConfig({}, {})
    expect(cfg.apiBaseUrl).toBe('')
  })

  it('去掉 apiBaseUrl 结尾斜杠，避免拼出双斜杠', () => {
    const cfg = readRuntimeConfig({ __CONFIG__: { apiBaseUrl: 'https://api.example.com/' } }, {})
    expect(cfg.apiBaseUrl).toBe('https://api.example.com')
  })

  it('entrypoint 未替换的占位符视为未配置', () => {
    const cfg = readRuntimeConfig({ __CONFIG__: { apiBaseUrl: '__PUBLIC_API_BASE_URL__' } }, {})
    expect(cfg.apiBaseUrl).toBe('')
  })

  it('siteName 缺失时给默认值而不是 undefined', () => {
    const cfg = readRuntimeConfig({}, {})
    expect(cfg.siteName).toBe('AI API Platform')
    expect(cfg.primaryColor).toBe('#2ECC71')
    expect(cfg.footerText).toBe('')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd /Users/lizhishaoniange/lingjing-ai/frontend && npm test
```

Expected: FAIL，报无法解析 `./runtimeConfig`。

- [ ] **Step 4: 实现 runtimeConfig**

创建 `frontend/src/runtimeConfig.ts`：

```ts
// 运行时配置。
//
// 为什么不用 Vite 的 import.meta.env：compose 部署下前端是预构建镜像，
// 编译期注入意味着用户改个站名就得自己 build 镜像，"一条命令起站"就不成立了。
// 所以生产走 window.__CONFIG__（由容器 entrypoint 从环境变量生成 config.js），
// 只有本地 dev 才回落到 Vite env。

export interface RuntimeConfig {
  /** 后端基址。空字符串 = 走同源 /api（由 nginx 反代） */
  apiBaseUrl: string
  siteName: string
  logoUrl: string
  primaryColor: string
  footerText: string
  icpNumber: string
  contactUrl: string
}

const DEFAULTS: RuntimeConfig = {
  apiBaseUrl: '',
  siteName: 'AI API Platform',
  logoUrl: '',
  primaryColor: '#2ECC71',
  footerText: '',
  icpNumber: '',
  contactUrl: '',
}

// entrypoint 用 sed 替换 __XXX__ 占位符。若某个环境变量为空，
// 占位符会原样留在 config.js 里，此时应视为"未配置"而不是字面量值。
function clean(v: unknown): string {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  if (s.startsWith('__') && s.endsWith('__')) return ''
  return s
}

export function readRuntimeConfig(
  win: Record<string, unknown>,
  viteEnv: Record<string, unknown>
): RuntimeConfig {
  const injected = (win.__CONFIG__ ?? {}) as Record<string, unknown>
  const pick = (key: keyof RuntimeConfig, viteKey?: string): string => {
    const fromWindow = clean(injected[key])
    if (fromWindow) return fromWindow
    if (viteKey) {
      const fromVite = clean(viteEnv[viteKey])
      if (fromVite) return fromVite
    }
    return DEFAULTS[key]
  }
  return {
    apiBaseUrl: pick('apiBaseUrl', 'VITE_API_BASE_URL').replace(/\/$/, ''),
    siteName: pick('siteName'),
    logoUrl: pick('logoUrl'),
    primaryColor: pick('primaryColor'),
    footerText: pick('footerText'),
    icpNumber: pick('icpNumber'),
    contactUrl: pick('contactUrl'),
  }
}

export const runtimeConfig: RuntimeConfig = readRuntimeConfig(
  typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {},
  import.meta.env as unknown as Record<string, unknown>
)
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd /Users/lizhishaoniange/lingjing-ai/frontend && npm test
```

Expected: PASS，6 个测试全绿。

- [ ] **Step 6: 提交这一小步**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add frontend/src/runtimeConfig.ts frontend/src/runtimeConfig.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): 新增运行时配置模块，替代 Vite 编译期注入"
```

- [ ] **Step 7: 改 api/index.ts**

修改 `frontend/src/api/index.ts` 第 3-5 行：

```ts
import axios from 'axios'
import { runtimeConfig } from '../runtimeConfig'

// 空 = 同源 /api（nginx 反代）；非空 = 独立 API 域名
const API_BASE = runtimeConfig.apiBaseUrl
```

其余不动（`apiUrl`、`http`、各 api 对象全部沿用 `API_BASE`）。

- [ ] **Step 8: 改 ModelDetail.tsx**

修改 `frontend/src/pages/ModelDetail.tsx` 第 44 行：

```ts
  const BASE_URL = (runtimeConfig.apiBaseUrl || window.location.origin) + '/v1'
```

文件顶部加 `import { runtimeConfig } from '../runtimeConfig'`。

- [ ] **Step 9: 改 Docs.tsx**

修改 `frontend/src/pages/Docs.tsx`。

第 8-12 行的注释块与常量替换为：

```ts
import { runtimeConfig } from '../runtimeConfig'

// API 基址：优先用部署配置的独立 API 域名，否则用当前站点同源。
// 部署在 CDN 代理后面时建议单独配 API 子域名直连——多数 CDN 对
// 响应首字节有硬超时（Cloudflare 免费版 100s），长耗时的图像生成会被截断。
const BASE_URL = (runtimeConfig.apiBaseUrl || window.location.origin) + '/v1'
```

第 298-299 行的警示框：只在 `apiBaseUrl` 已配置且与当前 origin 不同时才显示。把整个警示框 `<div>` 包进条件：

```tsx
      {runtimeConfig.apiBaseUrl && runtimeConfig.apiBaseUrl !== window.location.origin && (
        <div style={{ /* 保持原有样式对象不变 */ }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            ⚠️ API 请务必使用 <code style={{ background: '#fff', padding: '1px 6px', borderRadius: 3, color: '#7c2d12' }}>{new URL(runtimeConfig.apiBaseUrl).host}</code> 这个地址
          </div>
          站点主域名可能经过 CDN 代理，存在响应超时上限。图像生成、长上下文对话等耗时请求请使用上述 API 地址，避免被中间层截断。<br/>
        </div>
      )}
```

第 859 行 FAQ 条目改为泛化表述：

```ts
            { q: '报错 HTTP 524 或 "error code: 524" 是什么？怎么修？', a: '524 是 CDN 层的 origin timeout，含义是"CDN 等后端超过其超时上限仍未收到响应头就放弃了"（Cloudflare 免费版为 100 秒）。图像生成 sync 模式动辄 30-300 秒，容易踩到。修法：把 base_url 换成本页顶部显示的 API 地址——它直连后端、绕过 CDN，没有这个限制。如果你自建部署且未使用 CDN，则不会遇到此问题。' },
```

- [ ] **Step 10: 改 taskApi.ts**

修改 `frontend/src/pages/Playground/api/taskApi.ts`，把顶部读 `import.meta.env.VITE_API_BASE_URL` 的逻辑改为：

```ts
import { runtimeConfig } from '../../../runtimeConfig'

// 空 = 同源 /api；非空 = 独立 API 域名（用于绕开 CDN 超时限制）
const API_BASE = runtimeConfig.apiBaseUrl
```

**执行前先 `cat frontend/src/pages/Playground/api/taskApi.ts` 确认实际的变量名与相对路径深度**，`../../../` 是按 `src/pages/Playground/api/` 推算的，若目录层级不同要相应调整。

- [ ] **Step 11: 确认前端已无硬编码域名，且无残留 import.meta.env 读取**

```bash
cd /Users/lizhishaoniange/lingjing-ai
grep -rn "aitoken.homes" frontend/src/ ; echo "--- 上面应无输出"
grep -rn "import.meta.env.VITE_API_BASE_URL" frontend/src/ | grep -v runtimeConfig.ts ; echo "--- 上面应无输出"
```

Expected: 两处均无输出。

- [ ] **Step 12: 构建验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/frontend && npm run build
```

Expected: 构建成功，无 TS 错误。

- [ ] **Step 13: 改 index.html 引入 config.js**

修改 `frontend/index.html`。`config.js` 必须**在业务 bundle 之前同步加载**，否则 `runtimeConfig` 初始化时读不到 `window.__CONFIG__`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI API Platform</title>
    <!-- 运行时配置，由容器 entrypoint 生成。必须在业务 bundle 之前加载 -->
    <script src="/config.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

标题运行时改写：在 `frontend/src/main.tsx` 的最顶部（`ReactDOM.createRoot` 之前）加：

```ts
import { runtimeConfig } from './runtimeConfig'

document.title = runtimeConfig.siteName
```

本地 dev 时 `/config.js` 会 404，浏览器控制台报一条无害的资源加载失败，`runtimeConfig` 自动回落到 Vite env。为消除这条噪音，在 `frontend/public/` 下放一个空的 `config.js`（内容一行注释即可）：

```js
// 本地开发占位。生产环境由容器 entrypoint 覆盖此文件。
```

- [ ] **Step 14: 写 Dockerfile**

创建 `frontend/Dockerfile`：

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# 构建产物放在 /opt/dist，由 entrypoint 拷进共享卷。
# 不能直接 COPY 到 /usr/share/nginx/html：那里挂着 named volume，
# 卷只在首次创建时从镜像填充，之后即使镜像更新了内容也不会重新填充——
# 结果是部署了新版前端但用户永远看到旧版。
COPY --from=builder /app/dist /opt/dist
COPY docker-entrypoint.sh /docker-entrypoint.d/40-generate-config.sh
RUN chmod +x /docker-entrypoint.d/40-generate-config.sh
```

说明：nginx:alpine 官方镜像会在启动前自动执行 `/docker-entrypoint.d/` 下的可执行脚本，所以不需要自定义 ENTRYPOINT。

- [ ] **Step 15: 写 entrypoint**

创建 `frontend/docker-entrypoint.sh`：

```sh
#!/bin/sh
# 1) 把镜像内的构建产物同步进共享卷（卷不会随镜像更新自动刷新，必须每次覆盖）
# 2) 由环境变量生成运行时配置
# 每次容器启动都重新执行——这就是"改 .env + up -d 即可换品牌，无需重新 build"的实现。
set -e

WEB_ROOT=/usr/share/nginx/html

rm -rf "$WEB_ROOT"/*
cp -r /opt/dist/. "$WEB_ROOT"/
echo "[entrypoint] 已同步构建产物到 $WEB_ROOT"

CONFIG_PATH="$WEB_ROOT/config.js"

cat > "$CONFIG_PATH" <<EOF
window.__CONFIG__ = {
  apiBaseUrl: "${PUBLIC_API_BASE_URL:-}",
  siteName: "${SITE_NAME:-AI API Platform}",
  logoUrl: "${BRAND_LOGO_URL:-}",
  primaryColor: "${BRAND_PRIMARY_COLOR:-#2ECC71}",
  footerText: "${BRAND_FOOTER_TEXT:-}",
  icpNumber: "${BRAND_ICP_NUMBER:-}",
  contactUrl: "${BRAND_CONTACT_URL:-}"
};
EOF

echo "[entrypoint] 已生成 $CONFIG_PATH (siteName=${SITE_NAME:-AI API Platform})"
```

- [ ] **Step 16: 单独构建并验证 config.js 生成正确**

```bash
cd /Users/lizhishaoniange/lingjing-ai
docker build -t test-frontend ./frontend
docker run --rm -e SITE_NAME="测试站" -e PUBLIC_API_BASE_URL="https://api.test.com" \
  test-frontend sh -c "/docker-entrypoint.d/40-generate-config.sh && cat /usr/share/nginx/html/config.js"
```

Expected: 输出中 `siteName: "测试站"` 且 `apiBaseUrl: "https://api.test.com"`。

- [ ] **Step 17: 提交**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add frontend/
git commit -m "feat(frontend): 容器化并改用运行时品牌配置，去除硬编码域名"
```

---

## Task 5: admin 运行时配置

**Files:**
- Create: `admin/src/runtimeConfig.ts`, `admin/Dockerfile`, `admin/docker-entrypoint.sh`, `admin/public/config.js`
- Modify: `admin/index.html`, `admin/src/api/index.ts:3`, `admin/src/main.tsx`
- Modify: `admin/src/pages/Login.tsx:27`, `admin/src/pages/PaymentSettings.tsx:188`, `admin/src/pages/Settings.tsx:187,300`

**Interfaces:**
- Consumes: Task 4 的 `RuntimeConfig` 类型契约（字段名必须完全一致）与 `config.js` 生成约定
- Produces: admin 容器镜像；`admin/src/runtimeConfig.ts` 导出同名 `runtimeConfig`

- [ ] **Step 1: 复制 runtimeConfig**

admin 目前没有测试框架，且这份文件与 frontend 逐字相同、已在 Task 4 被测试覆盖，直接复制，不重复搭测试环境：

```bash
cd /Users/lizhishaoniange/lingjing-ai
cp frontend/src/runtimeConfig.ts admin/src/runtimeConfig.ts
```

在 `admin/src/runtimeConfig.ts` 文件顶部补一行注释，说明同步关系：

```ts
// 注意：本文件与 frontend/src/runtimeConfig.ts 保持逐字一致。
// 修改时两边同步，字段名必须相同（两个容器共用同一套 config.js 生成约定）。
```

- [ ] **Step 2: 改 admin/src/api/index.ts**

修改第 1-3 行：

```ts
import axios from 'axios'
import { runtimeConfig } from '../runtimeConfig'

const http = axios.create({ baseURL: runtimeConfig.apiBaseUrl, withCredentials: true, timeout: 15000 })
```

原本是 `baseURL: ''`（同源）。改后默认行为不变（`apiBaseUrl` 默认空），但支持独立 API 域名部署。`ADMIN_MIN_ROLE` / `ADMIN_PAGE_MIN_ROLE` 两个常量及其注释保持不动。

- [ ] **Step 3: 改 Login.tsx 提示文案**

`admin/src/pages/Login.tsx` 第 27 行原文案写死了域名。改为：

```ts
        setError('该账号无后台权限，请前往用户前台登录')
```

- [ ] **Step 4: 改 PaymentSettings.tsx 回调地址展示**

`admin/src/pages/PaymentSettings.tsx` 第 188 行原本硬编码展示回调 URL。改为动态拼接。

先在文件顶部加 `import { runtimeConfig } from '../runtimeConfig'`，然后把该行替换为：

```tsx
              {(runtimeConfig.apiBaseUrl || window.location.origin) + '/api/lingjing/pay/notify/hupijiao'}
```

**注意**：这里必须保持旧路径 `/notify/hupijiao`，因为商户后台已配置该 URL（见 Global Constraints）。

- [ ] **Step 5: 改 Settings.tsx 的 placeholder**

`admin/src/pages/Settings.tsx` 第 187 行：`placeholder="https://aitoken.homes"` → `placeholder="https://example.com"`

第 300 行：`placeholder="noreply@aitoken.homes"` → `placeholder="noreply@example.com"`

- [ ] **Step 6: 改 index.html 与 main.tsx**

`admin/index.html` 与 Task 4 Step 13 同构：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>管理控制台</title>
    <!-- 运行时配置，由容器 entrypoint 生成。必须在业务 bundle 之前加载 -->
    <script src="/config.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`admin/src/main.tsx` 顶部加：

```ts
import { runtimeConfig } from './runtimeConfig'

document.title = runtimeConfig.siteName + ' - 管理控制台'
```

创建 `admin/public/config.js`：

```js
// 本地开发占位。生产环境由容器 entrypoint 覆盖此文件。
```

- [ ] **Step 7: 写 Dockerfile 与 entrypoint**

创建 `admin/Dockerfile`，内容与 `frontend/Dockerfile` 完全相同：

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# 产物放 /opt/dist 由 entrypoint 拷进卷，原因见 frontend/Dockerfile 注释
COPY --from=builder /app/dist /opt/dist
COPY docker-entrypoint.sh /docker-entrypoint.d/40-generate-config.sh
RUN chmod +x /docker-entrypoint.d/40-generate-config.sh
```

创建 `admin/docker-entrypoint.sh`，内容与 `frontend/docker-entrypoint.sh` 完全相同：

```sh
#!/bin/sh
# 1) 把镜像内的构建产物同步进共享卷（卷不会随镜像更新自动刷新，必须每次覆盖）
# 2) 由环境变量生成运行时配置
set -e

WEB_ROOT=/usr/share/nginx/html

rm -rf "$WEB_ROOT"/*
cp -r /opt/dist/. "$WEB_ROOT"/
echo "[entrypoint] 已同步构建产物到 $WEB_ROOT"

CONFIG_PATH="$WEB_ROOT/config.js"

cat > "$CONFIG_PATH" <<EOF
window.__CONFIG__ = {
  apiBaseUrl: "${PUBLIC_API_BASE_URL:-}",
  siteName: "${SITE_NAME:-AI API Platform}",
  logoUrl: "${BRAND_LOGO_URL:-}",
  primaryColor: "${BRAND_PRIMARY_COLOR:-#2ECC71}",
  footerText: "${BRAND_FOOTER_TEXT:-}",
  icpNumber: "${BRAND_ICP_NUMBER:-}",
  contactUrl: "${BRAND_CONTACT_URL:-}"
};
EOF

echo "[entrypoint] 已生成 $CONFIG_PATH (siteName=${SITE_NAME:-AI API Platform})"
```

- [ ] **Step 8: 构建验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/admin && npm run build
cd /Users/lizhishaoniange/lingjing-ai && docker build -t test-admin ./admin
```

Expected: 两步均成功。

- [ ] **Step 9: 确认 admin 已无硬编码域名**

```bash
cd /Users/lizhishaoniange/lingjing-ai && grep -rn "aitoken.homes" admin/src/
```

Expected: 无输出。

- [ ] **Step 10: 提交**

```bash
git add admin/
git commit -m "feat(admin): 容器化并接入运行时配置，去除硬编码域名"
```

---

## Task 6: nginx 容器化与模板

**Files:**
- Create: `nginx/Dockerfile`, `nginx/templates/site.conf.template`, `nginx/docker-entrypoint.sh`
- Modify: `docker-compose.yml`（新增 nginx / frontend / admin 三个服务）
- Keep: `nginx/api-platform.conf`（生产站现役配置，本 Task 不删，留作迁移对照）

**Interfaces:**
- Consumes: Task 3 的 `docker-compose.yml`、`HTTP_PORT` / `HTTPS_PORT` / `MAX_UPLOAD_SIZE` / `NGINX_PROXY_READ_TIMEOUT` / `SSL_MODE`；Task 4/5 的 frontend / admin 镜像
- Produces: 单一对外入口。路由规则：
  - `admin.<主域名>` → admin 静态站
  - 其他 Host → frontend 静态站
  - 两者的 `/api/`、`/v1/` 均反代到 `backend:3000`

- [ ] **Step 1: 写 nginx 模板**

创建 `nginx/templates/site.conf.template`。nginx 官方镜像会自动对 `/etc/nginx/templates/*.template` 做 envsubst 并输出到 `/etc/nginx/conf.d/`：

```nginx
# 由 envsubst 从 nginx/templates/site.conf.template 生成，勿直接编辑容器内文件。

upstream backend_upstream {
    server backend:3000;
}

# --- 公共反代配置片段 ---
# 注意：SSE 流式对话要求关闭 proxy_buffering，否则前端拿不到增量 token

# 管理后台
server {
    listen 80;
    server_name admin.${BASE_DOMAIN};

    root /var/www/admin;
    index index.html;

    client_max_body_size ${MAX_UPLOAD_SIZE};

    location / {
        try_files $uri $uri/ /index.html;
    }

    # index.html 与 config.js 必须每次问最新：
    # 否则用户拿到的旧 index.html 会引用旧 hash 的 JS，永远拉不到新版前端
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires off;
    }
    location = /config.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires off;
    }
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout ${NGINX_PROXY_READ_TIMEOUT}s;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}

# 用户前台（兜底 default_server，未匹配的 Host 都走这里）
server {
    listen 80 default_server;
    server_name _;

    root /var/www/frontend;
    index index.html;

    # 图生图 multipart 上传体积可达 20+ MB；nginx 默认 1M 会返回 413
    client_max_body_size ${MAX_UPLOAD_SIZE};

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires off;
    }
    location = /config.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires off;
    }
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout ${NGINX_PROXY_READ_TIMEOUT}s;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }

    # OpenAI 兼容接口。图像生成 sync 模式单次请求可能跑数分钟，
    # 超时必须与后端 TASK_SYNC_WAIT_SECONDS 匹配
    location /v1/ {
        proxy_pass http://backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout ${NGINX_PROXY_READ_TIMEOUT}s;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}
```

- [ ] **Step 2: 写 nginx Dockerfile**

创建 `nginx/Dockerfile`：

```dockerfile
FROM nginx:alpine
# 官方镜像自带的 default.conf 也声明了 listen 80 default_server，
# 不删会与我们模板生成的 default_server 冲突，nginx 直接启动失败
RUN rm -f /etc/nginx/conf.d/default.conf
COPY templates/ /etc/nginx/templates/
```

无需额外 entrypoint —— nginx 官方镜像自带的 `20-envsubst-on-templates.sh` 会处理模板渲染。

**注意**：官方 envsubst 脚本默认替换模板中**所有** `${VAR}`，包括 nginx 自身的 `$uri`、`$host` 这类变量（它们是 `$var` 不带花括号，不会被误替换）。模板中所有 nginx 内置变量都写成 `$uri` 形式，不要写 `${uri}`。

- [ ] **Step 3: compose 中加入三个服务**

在 `docker-compose.yml` 的 `services:` 下追加（`backend` / `mysql` / `redis` 保持不变）：

```yaml
  frontend:
    build:
      context: ./frontend
    image: ai-platform-frontend:latest
    container_name: ai-platform-frontend
    restart: always
    environment:
      - PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL:-}
      - SITE_NAME=${SITE_NAME:-AI API Platform}
      - BRAND_LOGO_URL=${BRAND_LOGO_URL:-}
      - BRAND_PRIMARY_COLOR=${BRAND_PRIMARY_COLOR:-#2ECC71}
      - BRAND_FOOTER_TEXT=${BRAND_FOOTER_TEXT:-}
      - BRAND_ICP_NUMBER=${BRAND_ICP_NUMBER:-}
      - BRAND_CONTACT_URL=${BRAND_CONTACT_URL:-}
    volumes:
      - frontend-dist:/usr/share/nginx/html
    networks:
      - api-net

  admin:
    build:
      context: ./admin
    image: ai-platform-admin:latest
    container_name: ai-platform-admin
    restart: always
    environment:
      - PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL:-}
      - SITE_NAME=${SITE_NAME:-AI API Platform}
      - BRAND_LOGO_URL=${BRAND_LOGO_URL:-}
      - BRAND_PRIMARY_COLOR=${BRAND_PRIMARY_COLOR:-#2ECC71}
      - BRAND_FOOTER_TEXT=${BRAND_FOOTER_TEXT:-}
      - BRAND_ICP_NUMBER=${BRAND_ICP_NUMBER:-}
      - BRAND_CONTACT_URL=${BRAND_CONTACT_URL:-}
    volumes:
      - admin-dist:/usr/share/nginx/html
    networks:
      - api-net

  nginx:
    build:
      context: ./nginx
    image: ai-platform-nginx:latest
    container_name: ai-platform-nginx
    restart: always
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    environment:
      - BASE_DOMAIN=${BASE_DOMAIN:-localhost}
      - MAX_UPLOAD_SIZE=${MAX_UPLOAD_SIZE:-30M}
      - NGINX_PROXY_READ_TIMEOUT=${NGINX_PROXY_READ_TIMEOUT:-320}
    volumes:
      - frontend-dist:/var/www/frontend:ro
      - admin-dist:/var/www/admin:ro
      - certbot-www:/var/www/certbot
      - certbot-conf:/etc/letsencrypt
    depends_on:
      - backend
      - frontend
      - admin
    networks:
      - api-net
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"
```

在 `volumes:` 段追加：

```yaml
  frontend-dist:
  admin-dist:
  certbot-www:
  certbot-conf:
```

**共享卷的时序问题**：frontend / admin 容器把构建产物写进卷，nginx 只读挂载。frontend / admin 容器本身也跑着 nginx（镜像基底就是 nginx:alpine），它们不对外暴露端口，作用是"持有产物 + 每次启动重新生成 config.js"。`depends_on` 保证 nginx 在它们之后启动。

- [ ] **Step 4: `.env.example` 补 BASE_DOMAIN**

Step 3 引入了新变量。在 `.env.example` 的「网络与 API 地址」段落顶部插入：

```bash
# 主域名（不含协议）。admin.<BASE_DOMAIN> 会路由到管理后台。
# 本地试跑填 localhost
BASE_DOMAIN=localhost
```

- [ ] **Step 5: 起全栈验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai
docker compose down -v
docker compose up -d --build
sleep 60
docker compose ps
```

Expected: 六个服务全部 `Up`（mysql 显示 `healthy`）。

- [ ] **Step 6: 验证前台可达且 config.js 正确**

```bash
curl -sf http://localhost/ | head -c 200
echo ""
curl -sf http://localhost/config.js
```

Expected: 第一条返回 HTML（含 `<div id="root">`）；第二条返回 `window.__CONFIG__ = {...}`，其中 `siteName` 是 `.env` 里 `SITE_NAME` 的值。

- [ ] **Step 7: 验证 API 反代**

```bash
curl -sf http://localhost/api/status
```

Expected: 返回 JSON，含 `"success":true`。

- [ ] **Step 8: 验证 admin 路由**

```bash
curl -sf -H "Host: admin.localhost" http://localhost/ | grep -o "<title>[^<]*</title>"
```

Expected: 输出 `<title>管理控制台</title>`（与前台的 `<title>AI API Platform</title>` 不同，说明 Host 分流生效）。

- [ ] **Step 9: 提交**

```bash
git add nginx/ docker-compose.yml .env.example
git commit -m "feat(deploy): nginx 容器化并接入 compose，前台/后台/API 单入口分流"
```

---

## Task 7: HTTPS 三档模式

**Files:**
- Modify: `nginx/templates/site.conf.template`（拆成三个模板）
- Create: `nginx/templates-ssl/site.conf.template`
- Create: `nginx/docker-entrypoint-ssl.sh`
- Modify: `docker-compose.yml`（新增 certbot 服务与 profile）
- Modify: `nginx/Dockerfile`

**Interfaces:**
- Consumes: Task 6 的 nginx 服务与 `SSL_MODE` / `CERTBOT_EMAIL` / `BASE_DOMAIN`
- Produces: `SSL_MODE` 三档行为；`certbot` 服务（仅 `letsencrypt` 档启用）

- [ ] **Step 1: 拆 SSL 模板**

Task 6 的模板作为 `none` 与 `external` 两档共用（都只监听 80，external 档由外层终结 TLS）。新增 `letsencrypt` 档模板。

创建 `nginx/templates-ssl/site.conf.template`。内容 = Task 6 模板 + 以下改动：

- 两个 server 块的 `listen 80` 改为 `listen 443 ssl; http2 on;`
- 每个 server 块内加证书配置：

```nginx
    ssl_certificate     /etc/letsencrypt/live/${BASE_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${BASE_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
```

- 追加一个 80 端口的 server 块，负责 ACME 挑战与跳转 HTTPS：

```nginx
server {
    listen 80 default_server;
    server_name _;

    # ACME HTTP-01 挑战必须走 80 且不能被跳转拦截
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

- [ ] **Step 2: 写模板选择 entrypoint**

创建 `nginx/docker-entrypoint-ssl.sh`：

```sh
#!/bin/sh
# 按 SSL_MODE 决定用哪套模板。必须在官方的 envsubst 脚本（20-）之前跑，
# 所以文件名编号取 15-。
set -e

case "${SSL_MODE:-none}" in
  letsencrypt)
    CERT_DIR="/etc/letsencrypt/live/${BASE_DOMAIN}"
    if [ -f "$CERT_DIR/fullchain.pem" ]; then
      echo "[entrypoint] SSL_MODE=letsencrypt，已找到证书，启用 HTTPS 模板"
      cp /etc/nginx/templates-ssl/*.template /etc/nginx/templates/
    else
      # 首次启动证书还没签发，此时用 HTTP 模板让 ACME 挑战能走通。
      # certbot 签发成功后重启 nginx 容器即切换到 HTTPS。
      echo "[entrypoint] SSL_MODE=letsencrypt，但 $CERT_DIR 无证书。"
      echo "[entrypoint] 先以 HTTP 模式启动供 ACME 挑战使用。签发完成后请执行："
      echo "[entrypoint]   docker compose restart nginx"
    fi
    ;;
  external|none)
    echo "[entrypoint] SSL_MODE=${SSL_MODE:-none}，使用 HTTP 模板（TLS 由外部终结或不启用）"
    ;;
  *)
    echo "[entrypoint] 错误：SSL_MODE 取值非法：'${SSL_MODE}'，必须是 none / letsencrypt / external 之一" >&2
    exit 1
    ;;
esac
```

- [ ] **Step 3: 改 nginx Dockerfile**

```dockerfile
FROM nginx:alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY templates/ /etc/nginx/templates/
COPY templates-ssl/ /etc/nginx/templates-ssl/
COPY docker-entrypoint-ssl.sh /docker-entrypoint.d/15-select-ssl-template.sh
RUN chmod +x /docker-entrypoint.d/15-select-ssl-template.sh
```

- [ ] **Step 4: compose 中给 nginx 补 SSL 环境变量，新增 certbot 服务**

nginx 服务的 `environment:` 段追加：

```yaml
      - SSL_MODE=${SSL_MODE:-none}
```

在 `services:` 下追加 certbot（用 profile 控制，只有显式启用时才跑）：

```yaml
  certbot:
    image: certbot/certbot:latest
    container_name: ai-platform-certbot
    profiles: ["letsencrypt"]
    volumes:
      - certbot-www:/var/www/certbot
      - certbot-conf:/etc/letsencrypt
    # 每 12 小时检查一次续期。首次签发需手动执行 docker compose run 命令，
    # 见 docs/deployment.md
    entrypoint: >
      sh -c "trap exit TERM;
      while :; do certbot renew --webroot -w /var/www/certbot --quiet; sleep 12h & wait $${!}; done"
    networks:
      - api-net
```

- [ ] **Step 5: 验证 SSL_MODE=none 仍正常**

```bash
cd /Users/lizhishaoniange/lingjing-ai
docker compose up -d --build nginx
sleep 10
docker compose logs nginx | grep entrypoint
curl -sf http://localhost/api/status | head -c 80
```

Expected: 日志含 `SSL_MODE=none，使用 HTTP 模板`；curl 返回 JSON。

- [ ] **Step 6: 验证非法 SSL_MODE 被拒**

```bash
cd /Users/lizhishaoniange/lingjing-ai
SSL_MODE=bogus docker compose up nginx 2>&1 | grep "SSL_MODE 取值非法"
```

Expected: 匹配到该行，容器退出。

- [ ] **Step 7: 恢复并提交**

```bash
cd /Users/lizhishaoniange/lingjing-ai
docker compose up -d nginx
git add nginx/ docker-compose.yml
git commit -m "feat(deploy): HTTPS 三档模式 none/letsencrypt/external，内置 certbot 续期"
```

---

## Task 8: 支付 Provider 抽象

**Files:**
- Create: `backend/payment/provider.go`, `backend/payment/registry.go`
- Create: `backend/payment/hupijiao/hupijiao.go`, `backend/payment/hupijiao/sign.go`, `backend/payment/hupijiao/sign_test.go`
- Modify: `backend/controller/lingjing_pay.go`
- Modify: `backend/router/lingjing-router.go:21-22`

**Interfaces:**
- Consumes: Task 2 的 `config.SystemName` / `config.ServerAddress`
- Produces:
  - `payment.Provider` 接口
  - `payment.NotifyResult` 结构体
  - `payment.Get(name string) (Provider, bool)`
  - `payment.AnyConfigured() bool`
  - 路由 `POST/GET /api/lingjing/pay/notify/:provider`（旧路径 `/notify/hupijiao` 保留）

- [ ] **Step 1: 先跑一遍现有支付相关测试，建立基线**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go test ./controller/ 2>&1 | tail -20
```

记录当前结果。重构后必须不比这个差。

- [ ] **Step 2: 写签名单测（迁移前先固定行为）**

创建 `backend/payment/hupijiao/sign_test.go`。这个测试锁定现有 `hupijiaoSign` 的行为，保证迁移过程中签名算法一个字节都没变：

```go
package hupijiao

import "testing"

func TestSign(t *testing.T) {
	// 虎皮椒签名规则：参数按 key 字典序拼成 k=v&k=v，末尾拼 secret 后 md5。
	// hash 字段本身不参与签名；空值参数跳过。
	params := map[string]string{
		"version":        "1.1",
		"appid":          "test_appid",
		"trade_order_id": "LJ1700000000123456",
		"total_fee":      "10.00",
		"hash":           "should_be_ignored",
		"empty_field":    "",
	}
	got := Sign(params, "test_secret")

	if len(got) != 32 {
		t.Fatalf("md5 结果应为 32 位十六进制，实际 %d 位: %q", len(got), got)
	}
	// hash 字段必须不参与签名：改掉它签名不应变化
	params["hash"] = "different_value"
	if again := Sign(params, "test_secret"); again != got {
		t.Error("hash 字段不应参与签名计算")
	}
	// 空值字段必须跳过：删掉空值字段签名不应变化
	delete(params, "empty_field")
	if again := Sign(params, "test_secret"); again != got {
		t.Error("空值参数不应参与签名计算")
	}
	// 换 secret 签名必须变
	if other := Sign(params, "other_secret"); other == got {
		t.Error("不同 secret 应产生不同签名")
	}
}
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go test ./payment/hupijiao/ -v
```

Expected: FAIL，包不存在。

- [ ] **Step 4: 迁移签名实现**

创建 `backend/payment/hupijiao/sign.go`。把 `backend/controller/lingjing_pay.go` 第 36-66 行的 `hupijiaoSign` 与 `hupijiaoNonce` **原样搬过来**（只改包名与导出名，算法逻辑一个字符都不要动）：

```go
package hupijiao

// Sign 由 controller.hupijiaoSign 迁入，算法未做任何改动。
// 迁移时若发现此处与原实现有差异，以原实现为准——线上验签依赖它。
func Sign(params map[string]string, secret string) string {
	// ↓ 此处粘贴 lingjing_pay.go:36-53 的函数体，原样不动
}

// Nonce 由 controller.hupijiaoNonce 迁入。
func Nonce() string {
	// ↓ 此处粘贴 lingjing_pay.go:55-66 的函数体，原样不动
}
```

**执行时先 `sed -n '36,66p' backend/controller/lingjing_pay.go` 把原文取出来粘贴，不要凭记忆重写签名算法。**

- [ ] **Step 5: 运行测试确认通过**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go test ./payment/hupijiao/ -v
```

Expected: PASS。

- [ ] **Step 6: 定义 Provider 接口**

创建 `backend/payment/provider.go`：

```go
package payment

import "github.com/gin-gonic/gin"

// NotifyResult 是回调解析并**验签通过**后的结果。
// 注意：返回非 nil 的 NotifyResult 即表示签名已验证通过——
// 实现者不得在验签失败时返回结果，必须返回 error。
type NotifyResult struct {
	// OrderNo 商户订单号
	OrderNo string
	// TradeNo 支付平台流水号
	TradeNo string
	// PaidAmount 实付金额（元）。controller 会与订单金额比对，防篡改。
	PaidAmount float64
	// Paid 是否为"支付成功"终态。非成功终态（如待支付、已关闭）时为 false，
	// controller 会直接回 SuccessResponse 让平台停止重推，但不加余额。
	Paid bool
}

// CreateRequest 是发起支付所需的信息。
type CreateRequest struct {
	OrderNo   string
	Amount    float64
	OrderName string
	PayType   string // alipay / wxpay
	NotifyURL string
	ReturnURL string
}

// Provider 是支付渠道的接入点。
//
// 设计意图：把**验签**放在接口的必经路径上（VerifyNotify），
// 而订单幂等、金额比对、加余额、佣金分发、站内通知全部留在 controller 统一处理。
// 这样新增一个支付渠道时，实现者不可能"忘记验签"，也不可能绕过金额校验。
type Provider interface {
	// Name 返回渠道标识，用于路由 /pay/notify/:provider
	Name() string

	// Configured 报告指定支付类型的商户参数是否齐备。
	// payType 为空字符串时表示"任意类型是否可用"。
	Configured(payType string) bool

	// CreatePayment 向支付平台下单，返回供前端跳转的支付链接或二维码地址。
	CreatePayment(req CreateRequest) (payURL string, err error)

	// VerifyNotify 解析回调并验签。验签失败必须返回 error，不得返回结果。
	VerifyNotify(c *gin.Context) (*NotifyResult, error)

	// SuccessResponse 是回调成功时应返回给支付平台的响应体。
	// 各家要求不同：虎皮椒要求纯文本 "success"，返回 JSON 会被判定失败并无限重推。
	SuccessResponse() string

	// FailResponse 是回调处理失败时的响应体。
	FailResponse() string
}
```

- [ ] **Step 7: 写 registry**

创建 `backend/payment/registry.go`：

```go
package payment

import "sync"

var (
	mu        sync.RWMutex
	providers = map[string]Provider{}
)

// Register 注册一个支付渠道。在各 provider 包的 init() 中调用。
func Register(p Provider) {
	mu.Lock()
	defer mu.Unlock()
	providers[p.Name()] = p
}

// Get 按名取渠道。
func Get(name string) (Provider, bool) {
	mu.RLock()
	defer mu.RUnlock()
	p, ok := providers[name]
	return p, ok
}

// All 返回所有已注册渠道。
func All() []Provider {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]Provider, 0, len(providers))
	for _, p := range providers {
		out = append(out, p)
	}
	return out
}

// AnyConfigured 是否有任一渠道已配置好商户参数。
// 全部未配置时，前台应隐藏在线充值入口，只保留兑换码充值。
// 这是新部署的开箱默认状态——没有支付账号的人也能正常用起来。
func AnyConfigured() bool {
	for _, p := range All() {
		if p.Configured("") {
			return true
		}
	}
	return false
}
```

- [ ] **Step 8: 实现 hupijiao Provider**

创建 `backend/payment/hupijiao/hupijiao.go`。把 `lingjing_pay.go` 中的下单请求逻辑（约 176-320 行的 HTTP 请求部分）与回调解析验签逻辑（约 360-415 行）迁入：

```go
package hupijiao

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/payment"
)

// 虎皮椒下单接口默认网关（管理员没填时使用）
const defaultGateway = "https://api.xunhupay.com"

// 独立 http client，10s 超时防挂住支付创建接口
var httpClient = &http.Client{Timeout: 10 * time.Second}

type Provider struct{}

func init() {
	payment.Register(&Provider{})
}

func (p *Provider) Name() string { return "hupijiao" }

func (p *Provider) Configured(payType string) bool {
	if payType != "" {
		_, appid, secret, enabled := model.GetHupijiaoChannel(payType)
		return enabled && appid != "" && secret != ""
	}
	for _, t := range []string{"alipay", "wxpay"} {
		if p.Configured(t) {
			return true
		}
	}
	return false
}

func (p *Provider) SuccessResponse() string { return "success" }
func (p *Provider) FailResponse() string    { return "fail" }

// CreatePayment 下单：POST 到 {gateway}/payment/do.html，取 JSON 里的 url 或 url_qrcode。
// 一个 appid/appsecret 对应商户后台配置的单一渠道（微信 or 支付宝），
// req.PayType 用于选取对应的商户配置。
func (p *Provider) CreatePayment(req payment.CreateRequest) (string, error) {
	// ↓ 迁入 lingjing_pay.go 中构造参数、Sign、POST、解析响应的逻辑，行为不变
}

// VerifyNotify 解析并验签回调。
// 验签 key 按订单的 payment_method 选取——支付宝与微信在虎皮椒后台是
// 两个独立应用，AppSecret 不同。
func (p *Provider) VerifyNotify(c *gin.Context) (*payment.NotifyResult, error) {
	// ↓ 迁入 lingjing_pay.go:360-415 的参数收集、选 key、恒时比较验签逻辑
	// 验签通过后返回 &payment.NotifyResult{
	//     OrderNo: ..., TradeNo: ..., PaidAmount: ..., Paid: status == "OD",
	// }
	// 虎皮椒支付成功状态码为 "OD"
}
```

**执行时逐段从 `lingjing_pay.go` 取原文迁移，不要重写。** 特别注意保留：

- `subtle.ConstantTimeCompare` 恒时比较（防 timing attack）
- `strings.ToLower` 容忍大小写差异
- form 优先、query 兜底的参数收集顺序
- `transaction_id` 取不到时回落 `open_order_id`

- [ ] **Step 9: 改造 controller 的 notify handler**

修改 `backend/controller/lingjing_pay.go`，把 `HupijiaoNotify` 改造为通用的 `PayNotify`：

```go
// PayNotify 处理支付回调。provider 特有的解析与验签委托给 Provider 实现，
// 订单幂等、金额校验、加余额、佣金、通知统一在此处理——
// 这样新增支付渠道时不可能绕过这些校验。
func PayNotify(c *gin.Context) {
	name := c.Param("provider")
	if name == "" {
		name = "hupijiao" // 旧路径 /notify/hupijiao 兼容
	}
	p, ok := payment.Get(name)
	if !ok {
		logger.SysError("pay notify: unknown provider " + name)
		c.String(http.StatusOK, "fail")
		return
	}

	res, err := p.VerifyNotify(c)
	if err != nil {
		logger.SysError("pay notify: verify failed provider=" + name + " err=" + err.Error())
		c.String(http.StatusOK, p.FailResponse())
		return
	}

	// 非成功终态：回 success 让平台停止重推，但不动订单
	if !res.Paid {
		c.String(http.StatusOK, p.SuccessResponse())
		return
	}

	// ↓ 以下为原 HupijiaoNotify 第 421 行起的全部逻辑，原样保留：
	//   订单查询 → 金额校验（res.PaidAmount vs order.Amount）
	//   → 事务内条件 UPDATE 幂等 → status=2 救回 → 加 quota
	//   → DistributeCommission → CreateUserNotification
	// 只把原来的局部变量替换为 res.OrderNo / res.TradeNo / res.PaidAmount，
	// 并把 c.String(http.StatusOK, "success") 换成 p.SuccessResponse()。
}
```

**迁移时必须原样保留的逻辑**（这些都是踩坑后加的，删掉会重现事故）：

- 金额校验 `paidAmount < order.Amount-0.01` —— 防篡改 `total_fee` 伪造小额支付
- 事务内条件 UPDATE `WHERE order_no = ? AND status = 0` —— 防并发双倍加额度
- `status=2` 救回分支 —— 孤儿清理任务误取消后晚到回调的补偿
- `errOrderAlreadyPaid` 时返回 success —— 幂等，让平台停止重推
- 验签失败时往 `remark` 追加记录

- [ ] **Step 10: 改路由**

修改 `backend/router/lingjing-router.go` 第 21-22 行：

```go
		// 旧路径保留：虎皮椒商户后台已配置该 URL，变更会导致线上掉单
		public.POST("/pay/notify/hupijiao", controller.PayNotify)
		public.GET("/pay/notify/hupijiao", controller.PayNotify)
		// 新路径：支持多支付渠道
		public.POST("/pay/notify/:provider", controller.PayNotify)
		public.GET("/pay/notify/:provider", controller.PayNotify)
```

**注意**：gin 的路由树不允许同层级同时存在静态段 `hupijiao` 和通配段 `:provider`，会 panic。所以只能保留通配路由，靠 `c.Param("provider")` 拿到 `hupijiao` —— 旧 URL 天然命中通配路由，行为完全一致。改为：

```go
		// 通配路由。旧 URL /pay/notify/hupijiao 命中此路由且 provider="hupijiao"，
		// 与改造前行为一致——虎皮椒商户后台无需改配置。
		public.POST("/pay/notify/:provider", controller.PayNotify)
		public.GET("/pay/notify/:provider", controller.PayNotify)
```

- [ ] **Step 11: 未配置支付时降级**

修改 `backend/controller/lingjing_pay_config.go` 中的 `GetPublicPaymentConfig`，在返回体中加入 `enabled` 字段：

```go
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"enabled": payment.AnyConfigured(),
			// ↓ 保留原有字段不变
		},
	})
```

**执行前先 `cat backend/controller/lingjing_pay_config.go` 看清现有返回结构，只加字段，不改原有字段名。**

- [ ] **Step 12: 编译与测试**

```bash
cd /Users/lizhishaoniange/lingjing-ai/backend && go build ./... && go test ./payment/... ./controller/ -v 2>&1 | tail -30
```

Expected: 编译通过；payment 包测试 PASS；controller 测试结果不差于 Step 1 记录的基线。

- [ ] **Step 13: 验证旧回调路径仍可达**

```bash
cd /Users/lizhishaoniange/lingjing-ai
docker compose up -d --build backend
sleep 20
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost/api/lingjing/pay/notify/hupijiao
```

Expected: `200`（内容会是 `fail`，因为没有合法签名——但**路由必须可达，不能是 404**）。

若返回 404，说明路由改错了，回 Step 10。

- [ ] **Step 14: 提交**

```bash
git add backend/
git commit -m "refactor(payment): 抽出可插拔 Provider 接口，虎皮椒迁入 payment/hupijiao

验签进入接口必经路径；订单幂等、金额校验、加余额统一留在 controller。
旧回调路径 /pay/notify/hupijiao 由通配路由承接，商户后台无需改配置。"
```

---

## Task 9: 前台支付入口按配置降级

**Files:**
- Modify: `frontend/src/pages/Topup.tsx`

**Interfaces:**
- Consumes: Task 8 的 `/api/lingjing/pay/config` 返回体中新增的 `enabled` 字段；`frontend/src/api/index.ts` 已有的 `payApi.getConfig()`

- [ ] **Step 1: 看清现有充值页结构**

```bash
cd /Users/lizhishaoniange/lingjing-ai && cat frontend/src/pages/Topup.tsx
```

记下：支付方式选择区、套餐区、兑换码区分别是哪几个 JSX 块，以及 `payApi.getConfig()` 的返回值存在哪个 state 里。

- [ ] **Step 2: 按 enabled 隐藏在线支付区**

在 Topup.tsx 中，把从 `payApi.getConfig()` 拿到的 `enabled` 存入 state（若已有 config state 则复用），然后：

- 在线支付相关的 JSX（支付方式选择、套餐购买按钮、金额输入）包进 `{payEnabled && ( ... )}`
- 兑换码区块**不加条件**，始终显示
- `payEnabled === false` 时，在兑换码区上方显示一段说明：

```tsx
      {!payEnabled && (
        <div style={{ padding: 16, background: '#f5f5f5', borderRadius: 8, marginBottom: 16, color: '#666' }}>
          本站尚未开通在线支付。如需充值，请联系管理员获取兑换码。
        </div>
      )}
```

- [ ] **Step 3: 构建验证**

```bash
cd /Users/lizhishaoniange/lingjing-ai/frontend && npm run build
```

Expected: 构建成功。

- [ ] **Step 4: 运行时验证（未配置支付的全新实例）**

```bash
cd /Users/lizhishaoniange/lingjing-ai
docker compose up -d --build frontend backend
sleep 30
curl -sf http://localhost/api/lingjing/pay/config
```

Expected: 返回 JSON 含 `"enabled":false`（全新实例未配置任何商户参数）。

浏览器打开 `http://localhost`，注册账号后进入充值页，确认：看不到在线支付选项，能看到兑换码输入框和上述说明文案。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/Topup.tsx
git commit -m "feat(frontend): 未配置支付渠道时隐藏在线充值入口，保留兑换码"
```

---

## Task 10: 部署脚本重写

**Files:**
- Modify: `deploy.sh`, `push.sh`
- Create: `docker-compose.override.yml.example`
- Delete: `docker-compose.build.yml`（已被前端 Dockerfile 取代）
- Keep: `one-api/docker-compose.yml`（生产站现役，Task 13 迁移完成前不删）

**Interfaces:**
- Consumes: Task 3-7 的 `docker-compose.yml` 与 `.env`

- [ ] **Step 1: 重写 deploy.sh**

替换 `deploy.sh` 全部内容：

```bash
#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# 部署目录 = 本脚本所在目录，不再写死路径
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

echo ""
echo "🚀 一键部署"
echo "================================"

[ -f .env ] || err ".env 不存在。请先执行：cp .env.example .env 并按注释填写"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

if grep -q "CHANGE_ME_" .env; then
  err ".env 中仍有 CHANGE_ME_ 占位符未填写：$(grep -n 'CHANGE_ME_' .env | cut -d: -f1 | tr '\n' ' ')行"
fi

log "Step 1/4: 拉取最新代码"
if [ -d .git ]; then
  git pull --ff-only || warn "git pull 失败（本地有改动？），继续用当前代码部署"
else
  warn "非 git 仓库，跳过拉取"
fi

log "Step 2/4: 构建镜像"
docker compose build || err "镜像构建失败"

log "Step 3/4: 启动服务"
docker compose up -d --remove-orphans || err "服务启动失败"

log "Step 4/4: 健康检查"
PORT="${HTTP_PORT:-80}"
for i in $(seq 1 30); do
  if curl -sf --max-time 5 "http://localhost:${PORT}/api/status" > /dev/null 2>&1; then
    break
  fi
  sleep 3
done

check() {
  printf "  %-14s" "$1:"
  if curl -sf --max-time 10 "$2" > /dev/null 2>&1; then
    echo -e "${GREEN}正常${NC}"
  else
    echo -e "${RED}异常${NC}"
    FAILED=1
  fi
}

FAILED=0
check "后端 API"  "http://localhost:${PORT}/api/status"
check "站点前台"  "http://localhost:${PORT}/"
check "运行时配置" "http://localhost:${PORT}/config.js"

echo ""
if [ "$FAILED" = "1" ]; then
  echo -e "${RED}部分服务异常，请查看日志：docker compose logs --tail=100${NC}"
  exit 1
fi

echo -e "${GREEN}🎉 部署完成${NC}"
echo "  前台: ${SITE_URL}"
echo "  后台: ${SITE_URL/:\/\//://admin.}"
```

- [ ] **Step 2: 改 push.sh 的引导文案**

`push.sh` 末尾提到"登录阿里云 Workbench"，改为通用表述：

```bash
echo ""
echo "下一步：登录你的服务器，执行："
echo ""
echo "  cd <项目目录> && ./deploy.sh"
echo ""
```

- [ ] **Step 3: 写本地开发 override 示例**

创建 `docker-compose.override.yml.example`：

```yaml
# 本地开发用。启用方式：
#   cp docker-compose.override.yml.example docker-compose.override.yml
# compose 会自动合并此文件，无需额外 -f 参数。
#
# 作用：暴露数据库与后端端口供本机直连调试；前端 / admin 建议直接跑
# npm run dev（走 vite proxy 到 localhost:3000），不用容器。

services:
  mysql:
    ports:
      - "3306:3306"

  redis:
    ports:
      - "6379:6379"

  backend:
    ports:
      - "3000:3000"
    environment:
      - GIN_MODE=debug
```

在 `.gitignore` 中追加 `docker-compose.override.yml`。

- [ ] **Step 4: 删除已被取代的构建 compose**

`docker-compose.build.yml` 的作用（用 node 容器构建前端）已被 `frontend/Dockerfile` 与 `admin/Dockerfile` 取代。

```bash
cd /Users/lizhishaoniange/lingjing-ai && git rm docker-compose.build.yml
```

- [ ] **Step 5: 端到端跑一遍 deploy.sh**

```bash
cd /Users/lizhishaoniange/lingjing-ai
chmod +x deploy.sh
./deploy.sh
```

Expected: 四步全过，三项健康检查全部 `正常`，最后输出 `🎉 部署完成`。

- [ ] **Step 6: 验证占位符拦截**

```bash
cd /Users/lizhishaoniange/lingjing-ai
cp .env .env.bak
sed -i '' 's/^SESSION_SECRET=.*/SESSION_SECRET=CHANGE_ME_SESSION_SECRET/' .env
./deploy.sh; echo "exit=$?"
mv .env.bak .env
```

Expected: 脚本在第一步前就报 `.env 中仍有 CHANGE_ME_ 占位符未填写`，`exit=1`。

- [ ] **Step 7: 提交**

```bash
git add deploy.sh push.sh docker-compose.override.yml.example .gitignore
git add -u docker-compose.build.yml
git commit -m "feat(deploy): 重写 deploy.sh 去掉写死路径，新增本地开发 override 示例"
```

---

## Task 11: README 与文档

**Files:**
- Create: `README.md`, `docs/deployment.md`, `docs/configuration.md`, `docs/payment-provider.md`, `docs/upgrade.md`

**Interfaces:**
- Consumes: Task 1-10 的全部产物。文档内容必须与实际代码一致，**写之前先读对应文件确认**。

- [ ] **Step 1: 生成环境变量清单作为写文档的依据**

```bash
cd /Users/lizhishaoniange/lingjing-ai
grep -E "^[A-Z_]+=" .env.example | cut -d= -f1
echo "--- compose 中实际注入的："
grep -oE '\$\{[A-Z_]+' docker-compose.yml | sort -u | tr -d '${'
```

**两份清单必须一致。** 若 compose 用了某个变量而 `.env.example` 没有（或反之），先补齐再写文档 —— 这是 Global Constraints 中"显式 environment 白名单"约定的自检。

- [ ] **Step 2: 写 README.md**

创建 `README.md`：

````markdown
# AI API Platform

基于 [One API](https://github.com/songquanpeng/one-api) 二次开发的大模型 API 代理平台，
提供用户前台、管理后台、套餐订单、分销返利、异步任务与模型广场。

## 功能

- **OpenAI 兼容 API** —— `/v1/chat/completions`、`/v1/images/generations` 等，可直接接入现有 SDK
- **多上游渠道** —— 按模型路由、分组倍率、自动重试、渠道健康检测
- **用户前台** —— 注册登录、令牌管理、用量日志、套餐充值、兑换码、分销返利
- **管理后台** —— 用户/渠道/模型价格/订单/提现/公告管理，四档角色权限
- **异步任务系统** —— 图像生成等长耗时请求，sync 优先、超时降级为轮询
- **模型广场** —— 内置聊天与画图体验页

## 技术栈

Go + Gin + GORM · React 19 + TypeScript + Vite · MySQL 8 · Redis 7 · nginx · Docker Compose

## 快速开始

需要：一台装了 Docker 与 Docker Compose 的机器（建议 4C8G 起）。

```bash
git clone <仓库地址> && cd <目录名>
cp .env.example .env
# 编辑 .env：至少填写 MYSQL_PASSWORD 和 SESSION_SECRET
#   SESSION_SECRET 生成：openssl rand -base64 32
./deploy.sh
```

浏览器打开 `http://localhost`（或你配置的域名），**第一个注册的账号自动成为管理员**。

登录后去管理后台（`admin.<你的域名>`）添加至少一个上游渠道，然后在前台签发令牌即可调用。

## 环境变量

全部变量见 [`.env.example`](.env.example)，说明见 [docs/configuration.md](docs/configuration.md)。最少必填三项：

| 变量 | 说明 |
|---|---|
| `MYSQL_PASSWORD` | 数据库密码，不能留占位符 |
| `SESSION_SECRET` | 会话密钥，`openssl rand -base64 32` 生成 |
| `SITE_URL` | 站点地址，本地试跑填 `http://localhost` |

## 部署

- [完整部署指南](docs/deployment.md) —— HTTPS 三种模式、域名规划、反代与 CDN 注意事项
- [配置参考](docs/configuration.md) —— 全量环境变量
- [接入支付渠道](docs/payment-provider.md) —— 默认不启用在线支付，只有兑换码
- [升级](docs/upgrade.md) —— 版本升级与数据库迁移

## 换品牌

站名、logo、主色、页脚、备案号全部在 `.env` 里，改完 `docker compose up -d` 即生效，**不需要重新构建镜像**。

## 协议

MIT。基于 One API（MIT）二次开发，见 [NOTICE](NOTICE)。
````

- [ ] **Step 3: 写 docs/deployment.md**

内容必须覆盖：

1. **前置要求** —— Docker / Docker Compose 版本，机器配置建议，需开放的端口
2. **最小部署**（`SSL_MODE=none`，localhost）—— 逐条命令，含验证方法
3. **带域名部署** —— DNS 需要解析哪些记录（主域名 A 记录 + `admin` A 记录），`BASE_DOMAIN` / `SITE_URL` / `CORS_ALLOWED_ORIGINS` / `COOKIE_DOMAIN` 四者的填写关系，附一张具体例子的对照表
4. **HTTPS 三档** —— 每档的适用场景、`.env` 怎么填；`letsencrypt` 档给出首次签发的完整命令：

```bash
docker compose --profile letsencrypt run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d example.com -d admin.example.com \
  --email you@example.com --agree-tos --no-eff-email
docker compose restart nginx
```

5. **放在 CDN 或外层反代后面** —— `SSL_MODE=external`；说明为什么长耗时请求（图像生成）可能需要单独的 API 子域名直连，以及 `PUBLIC_API_BASE_URL` 怎么配
6. **上传体积与超时** —— `MAX_UPLOAD_SIZE` 与 `NGINX_PROXY_READ_TIMEOUT` 的含义；明确写出 `NGINX_PROXY_READ_TIMEOUT` 必须 ≥ `TASK_SYNC_WAIT_SECONDS + 20`，否则图像生成会被 nginx 截断
7. **从既有部署迁移** —— `MYSQL_DATA_PATH` 填原 bind mount 路径即可复用数据
8. **常见问题** —— 至少覆盖：登录后立刻掉线（`COOKIE_DOMAIN` 配错）、跨域报错（`CORS_ALLOWED_ORIGINS` 漏了）、上传 413（`MAX_UPLOAD_SIZE`）、图像生成 524/超时（`NGINX_PROXY_READ_TIMEOUT`）、"无可用渠道"（渠道未启用或模型未勾选）

- [ ] **Step 4: 写 docs/configuration.md**

按 `.env.example` 的分组逐项列表，每项四列：变量名、是否必填、默认值、说明。

必须额外说明的两点：

- `SYSTEM_NAME` / `SERVER_ADDRESS` / `ROOT_USER_EMAIL` 三项：**若 options 表中已有同名记录，运行时以数据库值为准**，env 只提供首次启动的默认值。要改已有站点的这三项，请去管理后台的系统设置改。
- 新增环境变量时必须同时改 `.env.example` 和 `docker-compose.yml` 的 `environment:` 白名单，**只加 `.env` 不加 compose 的话容器内拿不到值**。

- [ ] **Step 5: 写 docs/payment-provider.md**

内容：

1. 默认状态说明 —— 未配置任何渠道时，前台只有兑换码充值；管理员可在后台手动为用户充值
2. 启用虎皮椒 —— 后台「支付设置」填什么、回调 URL 填什么（明确写出 `<你的站点>/api/lingjing/pay/notify/hupijiao`）
3. **接入新渠道** —— 贴出 `payment.Provider` 接口全文，逐个方法说明契约，特别强调：
   - `VerifyNotify` **必须验签**，验签失败必须返回 error，不得返回 `NotifyResult`
   - `SuccessResponse()` 的返回值各家要求不同，返回错了会导致平台无限重推
   - 订单幂等、金额比对、加余额由 controller 统一处理，实现者不需要也不应该自己做
4. 注册方式 —— 在自己的 provider 包 `init()` 里调 `payment.Register(&Provider{})`，并在 `backend/main.go` 或 router 处加一行空导入 `_ "github.com/songquanpeng/one-api/payment/yourprovider"`
5. 回调路由 —— 新渠道自动获得 `/api/lingjing/pay/notify/<你的 Name()>`

- [ ] **Step 6: 写 docs/upgrade.md**

内容：常规升级流程（`git pull` → `./deploy.sh`）；升级前备份（`scripts/backup-mysql.sh`）；数据库 schema 由 GORM AutoMigrate 处理，无需手工执行 SQL；回滚方法（`git checkout <上个 tag>` → `./deploy.sh`）；**明确警告**：直接用 SQL 插入 `channels` 表后必须同步 `abilities` 表，否则模型路由不到渠道（One API 的路由依赖 `abilities`）。

- [ ] **Step 7: 校验文档中的命令真的能跑**

逐条执行 README「快速开始」与 deployment.md 中的命令（在临时目录用 `git clone` 本地仓库模拟新用户）：

```bash
cd /tmp && rm -rf oss-test && git clone /Users/lizhishaoniange/lingjing-ai oss-test
cd oss-test && git checkout feature/deployable
cp .env.example .env
sed -i '' "s/^MYSQL_PASSWORD=.*/MYSQL_PASSWORD=testpw$(date +%s)/" .env
sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 32)|" .env
sed -i '' 's/^HTTP_PORT=.*/HTTP_PORT=8080/' .env
./deploy.sh
```

Expected: 部署成功，健康检查全绿。

**任何一条命令报错或与文档描述不符，都要改文档或改代码，不能"文档写着理想情况"。**

- [ ] **Step 8: 清理测试实例**

```bash
cd /tmp/oss-test && docker compose down -v && cd /tmp && rm -rf oss-test
```

- [ ] **Step 9: 提交**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add README.md docs/
git commit -m "docs: 新增 README 与部署/配置/支付接入/升级四篇文档"
```

---

## Task 12: 全新实例端到端开箱验收

这是**一期完成的判定标准**。前面每个 Task 只验证了自己那部分，这里验证"一个陌生人能否真的把它跑起来并用起来"。

**Files:** 无代码改动。产出 `docs/superpowers/plans/2026-07-23-acceptance-log.md` 记录结果。

**Interfaces:**
- Consumes: Task 1-11 的全部产物

- [ ] **Step 1: 从零克隆**

模拟新用户，不复用任何本地状态：

```bash
cd /tmp && rm -rf accept && git clone /Users/lizhishaoniange/lingjing-ai accept
cd /tmp/accept && git checkout feature/deployable
docker compose down -v 2>/dev/null || true
```

- [ ] **Step 2: 只按 README 操作起站**

**严格只执行 README「快速开始」里写的命令**，不许用任何 README 里没写的知识。若卡住，说明 README 有缺失 —— 记下来，回 Task 11 补。

```bash
cd /tmp/accept
cp .env.example .env
sed -i '' "s/^MYSQL_PASSWORD=.*/MYSQL_PASSWORD=acceptpw123456/" .env
sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 32)|" .env
sed -i '' 's/^HTTP_PORT=.*/HTTP_PORT=8080/' .env
./deploy.sh
```

Expected: `🎉 部署完成`，三项健康检查全绿。

- [ ] **Step 3: 验证首个注册用户成为管理员**

浏览器打开 `http://localhost:8080`，注册一个账号（用户名 `acceptadmin`）。

```bash
docker compose exec mysql mysql -uroot -pacceptpw123456 oneapi \
  -e "SELECT id, username, role FROM users;"
```

Expected: 该用户 `role` 为 `100`（One API 中 root 用户角色值）。若不是，检查是否有残留数据导致它不是"首个用户"。

- [ ] **Step 4: 验证管理后台可登录**

浏览器打开 `http://admin.localhost:8080`（若本机 hosts 未解析 `admin.localhost`，用 `curl -H "Host: admin.localhost"` 验证路由，界面验证改用 `/etc/hosts` 加一条）。

用 Step 3 的账号登录，确认能进入后台并看到「渠道」「用户」等菜单。

- [ ] **Step 5: 添加一个上游渠道并调通 API**

在后台「渠道」页添加一个真实可用的上游（类型、Base URL、API Key、支持的模型）。

然后在前台签发一个令牌，用它调用：

```bash
curl -s http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer <前台签发的令牌>" \
  -H "Content-Type: application/json" \
  -d '{"model":"<渠道支持的模型>","messages":[{"role":"user","content":"说一个字"}]}' | head -c 400
```

Expected: 返回正常的 chat completion JSON，含 `choices[0].message.content`。

**这一步是整个一期的核心验收点。** 跑不通说明"别人部署完能用"这个目标没达成。

- [ ] **Step 6: 验证品牌配置改完即生效、无需重新构建**

```bash
cd /tmp/accept
sed -i '' 's/^SITE_NAME=.*/SITE_NAME=验收测试站/' .env
docker compose up -d frontend admin
sleep 10
curl -sf http://localhost:8080/config.js
```

Expected: 输出中 `siteName: "验收测试站"`。**注意确认过程中没有触发镜像重新构建**（`docker compose up -d` 不带 `--build`，日志里不应出现 `Building`）。

浏览器刷新前台，确认页面标题变为「验收测试站」。

- [ ] **Step 7: 验证充值页降级**

前台进入充值页，确认：无在线支付选项，有兑换码输入框和「本站尚未开通在线支付」提示。

在后台生成一个兑换码，前台兑换，确认余额增加。

- [ ] **Step 8: 验证流式对话**

前台模型广场发起一次对话，确认**文字是逐字出现的**（SSE 流式生效），不是等几秒后整段蹦出来。

若是整段蹦出，检查 nginx 模板中 `proxy_buffering off` 是否生效。

- [ ] **Step 9: 记录验收结果**

创建 `docs/superpowers/plans/2026-07-23-acceptance-log.md`，逐条记录 Step 2-8 的实际结果（通过 / 失败 + 现象）。失败项必须回到对应 Task 修复后重跑，不能带着已知失败项进 Task 13。

- [ ] **Step 10: 清理并提交**

```bash
cd /tmp/accept && docker compose down -v && cd /tmp && rm -rf accept
cd /Users/lizhishaoniange/lingjing-ai
git add docs/superpowers/plans/2026-07-23-acceptance-log.md
git commit -m "test: 全新实例开箱验收记录"
```

---

## Task 13: 生产站迁移 runbook

**Files:**
- Create: `docs/production-migration-runbook.md`

**Interfaces:**
- Consumes: Task 12 验收通过的全栈

**本 Task 只产出 runbook 文档，不执行实际切换。** 实际切换需要停机窗口，由用户择时执行。

- [ ] **Step 1: 导出生产站现有配置作为对照基准**

在**生产服务器**上执行，把结果贴进 runbook：

```bash
cd /root/lingjing-ai
docker compose config | grep -A100 "one-api:" | grep -E "^\s+-\s[A-Z_]+="
cat /etc/nginx/conf.d/api-platform.conf
ls -la /etc/letsencrypt/live/
docker inspect one-api-mysql --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

- [ ] **Step 2: 写生产 .env 对照表**

在 runbook 中给出生产站 `.env` 的完整取值，逐项标注来源：

| 变量 | 生产取值 | 来源 |
|---|---|---|
| `SITE_URL` | `https://aitoken.homes` | 现有 ServerAddress |
| `BASE_DOMAIN` | `aitoken.homes` | — |
| `SITE_NAME` | `灵镜AI` | 现有 config.SystemName |
| `COOKIE_DOMAIN` | `.aitoken.homes` | 现 compose 内联值 |
| `CORS_ALLOWED_ORIGINS` | `https://aitoken.homes,*.aitoken.homes` | 原 cors.go 硬编码逻辑等价物 |
| `PUBLIC_API_BASE_URL` | `https://api.aitoken.homes` | 现 frontend/.env.production |
| `SSL_MODE` | `external` | 证书由现有 certbot 管理 |
| `MYSQL_DATA_PATH` | `/root/lingjing-ai/one-api/mysql-data` | Step 1 的 inspect 结果，**零迁移** |
| `REDIS_DATA_PATH` | `/root/lingjing-ai/one-api/redis-data` | 同上 |
| `MYSQL_PASSWORD` / `SESSION_SECRET` | 沿用 `one-api/.env` 现值 | **必须沿用，改了会导致全员掉线** |
| `MAX_UPLOAD_SIZE` | `30M` | 现 nginx conf |
| `NGINX_PROXY_READ_TIMEOUT` | `320` | ≥ TASK_SYNC_WAIT_SECONDS(300) + 20 |
| 全部 `TASK_*` | 沿用 `one-api/docker-compose.yml` 现值 | 逐项抄，勿用默认值 |

**`SESSION_SECRET` 必须沿用旧值** —— 换了等于让所有在线用户瞬间掉线。

- [ ] **Step 3: 写 nginx 迁移方案**

生产站现有三个域名分工（主域 CF 橙云、api 与 admin 灰云直连），而新模板是「admin 子域 + 兜底」两块。runbook 中必须给出：

- 生产站需要在 `nginx/templates/` 基础上额外增加 `api.${BASE_DOMAIN}` 的 server 块（现有 `nginx/api-platform.conf` 里有，照搬）
- CF 真实 IP 透传配置段（`set_real_ip_from` 那 15 行）如何挂进容器：新建 `nginx/conf.d-extra/cloudflare-realip.conf`，在 compose 中挂载到 `/etc/nginx/conf.d/`
- 证书目录 `/etc/letsencrypt` 以只读方式挂进 nginx 容器

- [ ] **Step 4: 写切换步骤**

按顺序列出，每步带命令和验证方法：

1. 低峰期开始（凌晨）。公告提前挂出
2. `scripts/backup-mysql.sh` 备份，确认备份文件大小合理
3. `git fetch && git checkout feature/deployable`
4. 按 Step 2 表格写好 `.env`
5. `docker compose build`（先构建，缩短停机时间）
6. **停机开始**：`systemctl stop nginx`（宿主机 nginx）
7. `cd one-api && docker compose down`（停旧栈，**不加 `-v`**，数据卷必须保留）
8. `cd .. && docker compose up -d`
9. 按 Step 5 清单逐项验证
10. **停机结束**：撤下公告

- [ ] **Step 5: 写切换后验证清单**

逐条可勾选，每条带具体验证命令或操作：

- [ ] 主域名前台可访问，站名显示为「灵镜AI」
- [ ] `admin.aitoken.homes` 可登录，且登录态与主域名互通（跨子域 cookie 生效）
- [ ] `api.aitoken.homes/v1/chat/completions` 用真实令牌调通
- [ ] SSE 流式对话逐字输出
- [ ] 图生图上传 25MB 文件不返回 413
- [ ] 异步任务出图正常，长耗时请求不被 nginx 截断
- [ ] 支付回调路径 `POST https://aitoken.homes/api/lingjing/pay/notify/hupijiao` 返回 200（非 404）
- [ ] 真实小额支付走通全流程（下单 → 支付 → 回调 → 余额到账 → 站内通知）
- [ ] 已有用户登录后余额、订单、日志数据完整
- [ ] `abilities` 表路由正常，各模型能匹配到渠道
- [ ] CF 真实 IP 透传生效（日志中 IP 不是 CF 网段）

- [ ] **Step 6: 写回滚方案**

```bash
# 5 分钟回滚
cd /root/lingjing-ai
docker compose down
cd one-api && docker compose up -d
systemctl start nginx
curl -sf https://aitoken.homes/api/status
```

明确写出：回滚不涉及数据恢复（数据卷路径未变，新旧栈用的是同一份数据）；仅当 MySQL 数据确实损坏时才需要用 Step 4 的备份恢复。

- [ ] **Step 7: 提交**

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add docs/production-migration-runbook.md
git commit -m "docs: 生产站切换 runbook（配置对照表 / 切换步骤 / 验证清单 / 回滚）"
```

---

## 收尾

全部 Task 完成后：

- [ ] 跑完整测试：`cd backend && go test ./... 2>&1 | grep -v "^ok" | head -30`
- [ ] 跑前端测试与构建：`cd frontend && npm test && npm run build && cd ../admin && npm run build`
- [ ] 再次全历史 gitleaks 扫描（Task 1 之后新增了很多文件）
- [ ] 确认 `git status` 干净，`.env` / `docker-compose.override.yml` 未被跟踪
- [ ] 使用 superpowers:finishing-a-development-branch 决定合并方式

**已知遗留（不在一期范围，记录备查）：**

- `backend/web/` 2.5MB One API 原版前端仍在，经 `go:embed` 挂载（用户已确认保留）
- `one-api/docker-compose.yml` 与 `nginx/api-platform.conf` 保留至生产站切换完成后再删
- `lingjing_*` 标识符未改名（用户已确认保留为项目代号）
- 前端 2062 行 / 后端 915 行中文字面量未抽取 —— 二期、三期处理
- `lingjing_pay.go` 中 `quota = int64(amount * 500000)` 的人民币兑换率写死，非中国区运营者无法直接使用 —— 未在一期 spec 范围内，建议作为二期前的独立小任务处理
