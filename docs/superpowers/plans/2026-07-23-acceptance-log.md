# Task 12 验收记录（Phase A —— 不需要真实上游 API key 的部分）

> Phase A 执行时间：2026-07-24。测试环境：`/tmp/accept`（compose 项目名 `accept`，容器均为 `accept-*`），
> 与本机正在运行的生产态 `lingjing-ai` / `ai-platform-*` 栈完全隔离，未做任何 down/stop/restart。
>
> **Step 5、Step 8（Phase B，2026-07-24 同日续做）：已接入真实 DeepSeek 上游渠道，全部通过，见文末章节。**

## 对 task-12-brief.md 的修正说明（写在最前）

1. **端口改为 8090（非 brief 里的 8080）**。因为本机 8080 已被另一个 Docker 服务占用，
   80/443 也被本机另一套正在跑的 `lingjing-ai` 栈占用。`.env` 里 `HTTP_PORT=8090`，
   同时（见下方"README 缺口 #1"）额外把 `HTTPS_PORT` 也改成了 `8443`。
   所有 `admin.localhost:8080` / `localhost:8080/config.js` 之类的检查项均改用 `:8090`。

2. **Step 3 预期修正**：brief 原文断言"第一个注册用户 role=100"，这个前提是错的
   （已在 README 中修复的历史 bug）。已确认的真实行为（`backend/model/main.go` `CreateRootAccountIfNeed()`，
   26-42 行区域）：首次启动、users 表为空时，后端自动创建内置管理员 `root` / `123456`，`role=100`；
   随后**正常注册**的用户走的是默认角色 `RoleCommonUser=1`。本轮验收按修正后的预期执行并通过，见 Step 3。

## 验收结果一览

| Step | 结果 | 一句话结论 |
|---|---|---|
| 2 部署 | PASS | `./deploy.sh` 按 README 快速开始跑通，3 项健康检查全绿；发现 1 处 README 缺口（HTTPS_PORT） |
| 3 角色 | PASS（按修正后预期） | root/100 开机自建；acceptuser 注册后 role=1 |
| 4 后台路由 | PASS | Host 头分流 admin vs 前台，标题/JS bundle 均不同 |
| 6 品牌热更新 | PASS | 改 `.env` 后 `up -d`（无 `--build`）即生效，config.js 立即反映新站名 |
| 7 充值降级 | PASS | 在线支付关闭确认 + 兑换码全链路（生成→兑换→余额增加）headless 验证通过 |
| 5 | PASS | 接入真实 DeepSeek 渠道后 `/v1/chat/completions` 返回正常 `choices[0].message.content` |
| 8 | PASS | 同一渠道 `stream:true` 调用，收到 22+ 条渐进 SSE `data:` chunk，以 `data: [DONE]` 收尾 |

---

## Step 2：只按 README 操作起站 —— PASS

命令：
```bash
cd /tmp/accept
cp .env.example .env
sed -i '' "s/^MYSQL_PASSWORD=.*/MYSQL_PASSWORD=acceptpw123456/" .env
sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 32)|" .env
sed -i '' 's/^HTTP_PORT=.*/HTTP_PORT=8090/' .env
./deploy.sh
```

**第一次跑 `./deploy.sh` 失败**：
```
Error response from daemon: failed to set up container networking: driver failed programming
external connectivity on endpoint accept-nginx-1: Bind for 0.0.0.0:443 failed: port is already allocated
[✗] 服务启动失败
```

**README 缺口 #1（记录，未回改 Task 11 文档，仅记录供后续修复）**：
`docker-compose.yml` 里 nginx 服务同时映射了 `HTTP_PORT` 和 `HTTPS_PORT`
（`"${HTTP_PORT:-80}:80"` 和 `"${HTTPS_PORT:-443}:443"`），**即便 `SSL_MODE=none`，443 端口也会被占用**。
但 README「快速开始」和 `.env.example` 的注释都只提示改 `HTTP_PORT`，没有提示"如果 443 也被占用需要同步改 `HTTPS_PORT`"。
本地试跑网络里，凡是宿主机 443 已被其他服务占用（很常见），单改 `HTTP_PORT` 无法让 `docker compose up` 成功。
**建议 Task 11 回补**：要么 README 提醒"如果 443 被占用需一并设置 `HTTPS_PORT`"，要么 `SSL_MODE=none` 时
compose 逻辑上不再发布 443（后者改动更大，做法上先记录，不在本次验收范围内修改代码）。

修正方式：`sed -i '' 's/^HTTPS_PORT=.*/HTTPS_PORT=8443/' .env`，之后重跑 `./deploy.sh` 成功：

```
[✓] Step 1/4: 拉取最新代码
[✓] Step 2/4: 构建镜像
[✓] Step 3/4: 启动服务
[✓] Step 4/4: 健康检查
  后端 API:   正常
  站点前台: 正常
  运行时配置:正常

🎉 部署完成
  前台: http://localhost
  后台: http://admin.localhost
```

`docker compose ps` 最终状态（全部 healthy / running）：
```
NAME                STATUS
accept-admin-1      Up (healthy)
accept-backend-1    Up
accept-frontend-1   Up (healthy)
accept-mysql-1      Up (healthy)
accept-nginx-1      Up      0.0.0.0:8090->80/tcp, 0.0.0.0:8443->443/tcp
accept-redis-1      Up (healthy)
```

---

## Step 3（修正版）：root=100 开机自建 + 注册用户=1 —— PASS

第一次启动、注册前查询：
```bash
docker compose exec -T mysql mysql -uroot -pacceptpw123456 oneapi -e "SELECT id, username, role FROM users;"
```
```
id  username  role
1   root      100
```
（对应 `backend/model/main.go CreateRootAccountIfNeed()`：users 表为空 → 自动建 `root`/`123456`/`Role: RoleRootUser`）

注册普通用户 `acceptuser`（走 `POST /api/user/register`，默认 `TurnstileCheckEnabled=false`，headless 直接调通，未踩验证码坎）：
```bash
curl -s -X POST http://localhost:8090/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"acceptuser","password":"AcceptPW123456","password2":"AcceptPW123456"}'
# → {"message":"","success":true}
```

再次查询：
```
id  username     role
1   root         100
2   acceptuser   1
```

结论：**root=100 是开机自建的内置管理员，不是"第一个注册用户"**；`acceptuser` 是正常注册的用户，`role=1`（`RoleCommonUser`）。
这与 brief 原始预期（"第一个注册用户 role=100"）不同，与 README 已写明的行为一致，验收按修正后的预期判定 **PASS**。

---

## Step 4：管理后台 Host 路由 —— PASS

```bash
curl -s -H "Host: admin.localhost" http://localhost:8090/ | head -c 400
# <title>管理控制台</title> ... /assets/index-CtxKOSJ3.js

curl -s http://localhost:8090/ | head -c 400
# <title>AI API Platform</title> ... /assets/index-Di0ebMBi.js
```

两次返回的 `<title>` 和 JS bundle 文件名均不同，确认 nginx 按 `Host` 头把 `admin.localhost` 分流到 admin 应用、
其余分流到 frontend 应用。（浏览器实际登录后台看菜单这一步未做，属于纯 UI 交互，标记为**推迟人工目测**——
后端接口层面 Step 7 已经用 root 账号走通了登录 + 管理态操作，等价确认了后台鉴权链路可用。）

---

## Step 6：品牌热更新，无需重建镜像 —— PASS

```bash
sed -i '' 's/^SITE_NAME=.*/SITE_NAME=验收测试站/' .env
docker compose up -d frontend admin
```
输出（节选，全文无 `Building` 字样）：
```
 Container accept-frontend-1 Recreate
 Container accept-admin-1 Recreate
 Container accept-admin-1 Recreated
 Container accept-frontend-1 Recreated
 Container accept-admin-1 Starting
 Container accept-frontend-1 Starting
 Container accept-frontend-1 Started
 Container accept-admin-1 Started
```
`grep -i Building` 命中 0 行，确认没有触发镜像重新构建。

```bash
curl -sf http://localhost:8090/config.js
```
```js
window.__CONFIG__ = {
  apiBaseUrl: "",
  siteName: "验收测试站",
  ...
};
```
`siteName` 已变为 `"验收测试站"`。**浏览器刷新前台确认页面标题栏文案变化**这一步未做（纯 UI 目测），
标记为**推迟人工目测**；`config.js` 是标题栏渲染的数据源，已经过 curl 验证是正确的。

---

## Step 7：充值页降级 + 兑换码全链路 —— PASS（全程 headless）

**1) 在线支付确认关闭：**
```bash
curl -s http://localhost:8090/api/lingjing/pay/config
```
```json
{"data":{"alipay_enabled":false,"enabled":false,"epay_enabled":false,"redeem_enabled":true,"wxpay_enabled":false},"success":true}
```
`enabled:false`、`alipay_enabled:false`、`wxpay_enabled:false`、`epay_enabled:false`，仅 `redeem_enabled:true`。
（前台充值页具体文案"本站尚未开通在线支付"及兑换码输入框的渲染属于纯前端 UI，**推迟人工目测**，
后端配置层面已确认降级逻辑生效。）

**2) 用 root 登录拿 session cookie：**
```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:8090/api/user/login \
  -H "Content-Type: application/json" -d '{"username":"root","password":"123456"}'
# → success:true
```

**3) 后台生成兑换码：**
```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:8090/api/redemption/ \
  -H "Content-Type: application/json" -d '{"name":"acceptance-test","quota":50000,"count":1}'
# → {"data":["caa76333f6364203b4356aa137952869"],"success":true}
```

**4) acceptuser 登录，兑换前余额：**
```bash
curl -s -c /tmp/cookies_user.txt -X POST http://localhost:8090/api/user/login \
  -H "Content-Type: application/json" -d '{"username":"acceptuser","password":"AcceptPW123456"}'
curl -s -b /tmp/cookies_user.txt http://localhost:8090/api/user/self
# quota: 0
```

**5) 兑换：**
```bash
curl -s -b /tmp/cookies_user.txt -X POST http://localhost:8090/api/user/topup \
  -H "Content-Type: application/json" -d '{"key":"caa76333f6364203b4356aa137952869"}'
# → {"data":50000,"success":true}
```

**6) 兑换后余额（接口 + 数据库双重确认）：**
```bash
curl -s -b /tmp/cookies_user.txt http://localhost:8090/api/user/self
# quota: 50000

docker compose exec -T mysql mysql -uroot -pacceptpw123456 oneapi \
  -e "SELECT id,username,quota FROM users WHERE username='acceptuser';"
# id=2 username=acceptuser quota=50000
```

余额从 0 → 50000，接口返回与数据库记录一致。**PASS，全程 headless，无推迟项。**

---

## Phase B：Step 5 / Step 8 —— 接入真实上游渠道（2026-07-24 续做）

沿用同一套 `/tmp/accept` 栈（未重启、未 down），root 登录后新增一个真实 DeepSeek 渠道：

**渠道配置：**
```bash
curl -s -c /tmp/accept-cookies.txt -X POST http://localhost:8090/api/user/login \
  -H "Content-Type: application/json" -d '{"username":"root","password":"123456"}'
# → success:true

curl -s -L -b /tmp/accept-cookies.txt -X POST http://localhost:8090/api/channel/ \
  -H "Content-Type: application/json" \
  -d '{"name":"deepseek-accept-test","type":36,"key":"sk-6d8b…"(masked),"base_url":"https://api.deepseek.com","models":"deepseek-chat","groups":["default"],"group":"default"}'
# → {"message":"","success":true}
```
渠道 id=1，type=36（DeepSeek adaptor），group=default，models=deepseek-chat。

**渠道测试（`GET /api/channel/test/1`）：**
```
{"message":"DeepSeek-R1","modelName":"","success":true,"time":1.996}
```
`success:true`，实测约 2 秒响应，判为 PASS（`message` 字段是模型对测试 prompt 的回答文本，非报错）。

**Mint 用户 token（unlimited_quota, group=default）：**
```bash
curl -s -b /tmp/accept-cookies.txt -X POST http://localhost:8090/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"name":"accept-test-token","remain_quota":500000,"expired_time":-1,"unlimited_quota":true,"group":"default"}'
# → {"data":{"id":2,...,"key":"fETz…"(masked，实际 42 位)},"success":true}
```
调用 `/v1` 时使用 `Authorization: Bearer sk-<masked>`。

### Step 5：非流式 chat completion —— **PASS**

```bash
curl -s http://localhost:8090/v1/chat/completions \
  -H "Authorization: Bearer sk-<masked>" -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"只回一个字：好"}],"max_tokens":16}'
```
返回（完整，无脱敏必要，不含密钥）：
```json
{"id":"9476119d-31c9-4752-883c-4d5d27b8e728","object":"chat.completion","created":1784878322,
 "model":"deepseek-v4-flash","choices":[{"index":0,"message":{"role":"assistant","content":"好"},
 "logprobs":null,"finish_reason":"stop"}],
 "usage":{"prompt_tokens":9,"completion_tokens":1,"total_tokens":10, ...}}
```
`choices[0].message.content` = "好"，有效 JSON，一次性调通真实 DeepSeek 上游。**PASS。**

### Step 8：流式 chat completion（SSE） —— **PASS**

同一 token，`"stream":true`，`curl -N` 直连（无缓冲）：
```bash
curl -s -N http://localhost:8090/v1/chat/completions \
  -H "Authorization: Bearer sk-<masked>" -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"用中文数数从1数到10，每个数字之间加逗号"}],"stream":true,"max_tokens":100}'
```
证据：
- `grep -c '^data:'` → **22** 条独立 `data:` chunk（非单一大 blob）。
- 最后一行为 `data: [DONE]`，符合 SSE 收尾规范。
- 逐行加时间戳复测（另一条 prompt）显示渐进到达：第 1 个 `data:` chunk 在 `15:32:19.3xx`，
  第 2 个在 `15:32:20.3xx`（约 1 秒后），后续多个 chunk 陆续在同一秒内到达，
  且每个 chunk 的 `delta.content` 只含 1~2 个字符（如 "杭州"、"，"、"人间"…），
  与非流式一次性返回完整句子的行为明显不同，证明是真实分片流式传输而非伪装。

结论：Step 5、Step 8 均为 **PASS**，是本轮验收唯一使用真实上游 API Key 完成的两步。

**密钥卫生确认：** 上游 key（`sk-6d8b…`(masked)）与 mint 出的用户 token
均只在 curl 命令的执行环境中使用，本文件中全部替换为脱敏形式（`sk-6d8b…`(masked) /
`fETz…`(masked)），未写入任何真实密钥或完整 token 字符串。

---

## 遗留状态（Phase B 完成后）

- 目录：`/tmp/accept`，compose 项目名 `accept`，容器 `accept-*`，**保持运行中**（未 down/stop）。
- 端口：`HTTP_PORT=8090`，`HTTPS_PORT=8443`（均已写入 `/tmp/accept/.env`）。
- 数据库密码：`acceptpw123456`。
- root 账号：`root` / `123456`。
- 已注册普通用户：`acceptuser` / `AcceptPW123456`（role=1，quota=50000）。
- 新增渠道：id=1，`deepseek-accept-test`，type=36，group=default，models=deepseek-chat（真实可用）。
- 新增 token：id=2，`accept-test-token`，group=default，unlimited_quota（真实 key 未写入本文件）。
- 临时 cookie 文件 `/tmp/accept-cookies.txt` 已在本轮结束时删除。
- **本文件未提交（`git status` 会显示为 untracked），按控制器要求不 commit。**
