# 灵镜 AI 开源化改造设计（一期：可部署）

日期：2026-07-23
状态：已确认，待实施
范围：本文档只覆盖**一期**。二期（双语前端）、三期（双语后端 + 文档）各自单独出 spec。

## 背景与目标

灵镜 AI 目前是一套只能在 `aitoken.homes` 这一台服务器上跑起来的系统：域名、路径、支付商户、nginx 拓扑全部与该部署环境耦合。目标是把它改造成**任何人 clone 后能一键部署自己站点的开源白牌产品**。

关键前提（已确认）：

- **同一仓库**。生产站 `aitoken.homes` 降级为"它自己的一个部署实例"，只是一组 `.env` 值。不开分叉仓库，不开发布分支。
- **白牌深度＝仅用户可见层**。站名 / logo / 主色 / 文案 / 页脚参数化；代码内部标识符（`lingjing_*.go`、`/api/lingjing/*` 路由前缀、DB 表名）保持不变，视作项目代号（类比 `oneapi`）。
- **部署形态＝全 docker compose**。一条 `docker compose up -d` 起全栈。
- **首次安装＝`.env` + 首个注册用户自动成 root**（沿用 One API 现有机制），不做 Web 安装向导。
- **协议＝MIT**。与上游 One API 一致。
- **`backend/web/` 保留**，不在本期删除。

### 一期完成的判定标准

一个从未接触过本项目的人，在一台干净的 Linux 服务器上：clone → 复制并填写 `.env` → `docker compose up -d` → 浏览器注册首个账号（自动成为管理员）→ 后台添加一个上游渠道 → 用签发的 token 成功调通 `/v1/chat/completions`。全程不需要修改任何源码。

### 一期不做

- i18n / 英文界面（二期、三期）
- 删除 `backend/web/`
- `lingjing_*` 标识符改名
- 多租户
- Web 安装向导

## 现状盘点

| 项 | 现状 |
|---|---|
| 硬编码 `aitoken.homes` | 22 个文件命中，其中**真实代码点** 9 处，其余为注释/文案 |
| 硬编码服务器 IP | 5 个文件 |
| `deploy.sh` | 写死 `/root/lingjing-ai`、`/var/www/api-platform`、阿里云 Workbench 流程 |
| `admin/` | 无 `.env`，API 地址写在源码 |
| nginx | 宿主机运行，conf 155 行写死三个域名 + certbot 管理 |
| MySQL / Redis | compose 内，bind mount 到 `one-api/mysql-data` |
| 前端 | 构建产物拷贝到 `/var/www`，Vite **编译期**注入 `VITE_API_BASE_URL` |
| 支付 | `lingjing_pay.go` 773 行，虎皮椒逻辑与订单生命周期耦合 |
| LICENSE | **不存在**（One API 衍生作品，需补 MIT + 原始版权声明） |
| 密钥 | `.env` 已 gitignore，`one-api/.env` 未被跟踪；`frontend/.env.production` **被跟踪且含生产域名** |
| README | **不存在** |

真实代码硬编码点清单：

- `backend/common/config/config.go:16` `ServerAddress` 默认值
- `backend/common/config/config.go:106` `RootUserEmail` 默认值
- `backend/middleware/cors.go:40-41` CORS 白名单
- `backend/controller/lingjing_pay.go:192` `serverAddr` fallback
- `backend/controller/lingjing_pay.go:253` User-Agent
- `frontend/src/pages/ModelDetail.tsx:44` BASE_URL fallback
- `frontend/src/pages/Docs.tsx:12` BASE_URL 常量（另有多处文案）
- `admin/src/pages/PaymentSettings.tsx:188` 回调地址展示
- `admin/src/pages/Login.tsx:27` 跳转提示文案
- `one-api/docker-compose.yml` `COOKIE_DOMAIN`
- `nginx/api-platform.conf` 全篇
- `deploy.sh` 全篇

## 一、配置分层

配置目前散在五处（Go 常量、Vite 编译期 env、compose 内联、nginx conf、options 表）。收敛为三层，各层职责不重叠。

### ① 部署层 —— 根目录 `.env`

唯一真源。compose、nginx 模板、后端、前端 entrypoint 全部从它读。

覆盖：域名与协议、`MYSQL_PASSWORD`、`SESSION_SECRET`、`COOKIE_DOMAIN`、对外端口、`MYSQL_DATA_PATH` / `REDIS_DATA_PATH`、`SSL_MODE`、`TZ`、全部 `TASK_*`。

配套 `.env.example`，每项带注释说明用途、默认值、是否必填。

**启动自检**：backend 启动时校验必填项。缺失或仍为 `CHANGE_ME_*` 占位符时**打印明确错误并退出**，而不是带着空值跑起来产生难以诊断的行为。`SESSION_SECRET` 额外校验最小长度，`.env.example` 中给出 `openssl rand -base64 32` 生成命令。

### ② 品牌层 —— 运行时下发

**必须是运行时，不能是编译期。** compose 化后前端是预构建镜像；若站名、主色、API 地址仍靠 Vite 编译期注入，别人改一个站名就得自行 build 镜像，"一条命令起站"即失效。

机制：前端容器 entrypoint 按环境变量生成 `/config.js`，`index.html` 在业务 bundle 之前加载它，前端从 `window.__CONFIG__` 读取。改品牌 = 改 `.env` + `docker compose up -d`，无需重新构建。

字段：`apiBaseUrl`、`siteName`、`logoUrl`、`primaryColor`、`footerText`、`icpNumber`、`contactUrl`。前端与 admin 各一份 entrypoint，共用同一套字段约定。

`frontend/` 与 `admin/` 中所有读取 `import.meta.env.VITE_*` 的位置改为读 `window.__CONFIG__`，并保留开发态 fallback（`.env.development` 继续可用，走 vite proxy）。

### ③ 站点运营层 —— 沿用 options 表

SMTP、支付商户参数、公告、模型价格、分组倍率等本就在管理后台可改，逻辑不动。

### 同源 API 默认值

`frontend/src/api/index.ts` 与 `Docs.tsx` 中"必须使用 api 子域名绕开 Cloudflare"的逻辑是**生产环境特有约束**（CF 橙云 100s 硬超时导致 HTTP 524），不应成为开源默认。

- 开源默认：`apiBaseUrl` 为空 → 前端走**同源 `/api`**，由同容器 nginx 反代。零 DNS 配置即可运行。
- 生产站：`.env` 设 `PUBLIC_API_BASE_URL=https://api.aitoken.homes`，行为与今天完全一致。

`Docs.tsx` 中面向终端用户的 API 基址说明改为从 `window.__CONFIG__` 渲染；其中关于 CF 524 的排障段落改写为条件展示或泛化表述，不再写死具体域名。

## 二、部署形态

### 服务编排

单一根目录 `docker-compose.yml`：

| 服务 | 职责 |
|---|---|
| `nginx` | 唯一对外入口（80/443）。反代 `/api` → backend，静态托管前台与 admin。conf 由 `envsubst` 从模板生成 |
| `frontend` | 多阶段 Dockerfile 构建；entrypoint 生成 `config.js`；产物经共享卷交给 nginx |
| `admin` | 同上。本期补齐其缺失的 env 机制 |
| `backend` | 沿用现有 Dockerfile，env 全部来自根 `.env` |
| `mysql` | 沿用现有 8.0 及调优参数（max-connections、buffer pool、utf8mb4、慢查询日志） |
| `redis` | 沿用现有 7-alpine 及 maxmemory 策略 |

现有的资源限制（`mem_limit` / `cpus`）与日志轮转配置全部保留。

### HTTPS

`SSL_MODE` 三档：

- `none` —— 仅 80 端口。本地开发、内网部署。
- `letsencrypt` —— 内置 certbot 容器，填域名 + 邮箱自动签发与续期。新用户默认路径。
- `external` —— TLS 由外部终结（CDN、外层反代、既有 certbot）。**生产站使用此模式**。

nginx 模板按 `SSL_MODE` 生成不同 server 块。

**`client_max_body_size` 在所有 server 块中统一由 `.env` 的 `MAX_UPLOAD_SIZE` 控制，默认 30M** —— 图生图 multipart 上传会超过 nginx 默认 1M 限制。`proxy_read_timeout` 同理参数化，默认值需 ≥ `TASK_SYNC_WAIT_SECONDS` + 20s。

### 数据持久化

`MYSQL_DATA_PATH` / `REDIS_DATA_PATH` 参数化：

- 新用户默认使用 named volume
- **生产站填写现有 bind mount 路径，零数据迁移**

（此处修正了讨论早期"统一改 named volume"的说法——那会给生产站带来不必要的停机搬迁。）

### 部署脚本

`deploy.sh` 重写：`git pull` → `docker compose build` → `docker compose up -d` → 健康检查。移除写死的 `/root/lingjing-ai`、`/var/www/api-platform`，路径由脚本自身位置推导。

新增 `docker-compose.override.yml.example` 供本地开发（热重载、暴露 MySQL 端口、跳过 nginx）。

`push.sh` 中阿里云 Workbench 的引导文案改为通用表述。

## 三、支付 provider 抽象

`lingjing_pay.go` 中订单生命周期（建单、幂等、金额校验、加余额、审计）与虎皮椒特有逻辑（签名、网关请求、回调验签、纯文本 `success` 响应）耦合。拆分：

```
backend/payment/
  provider.go     # Provider 接口
  registry.go     # 按名注册 + Configured 检测
  hupijiao/       # 现有逻辑迁入，行为不变
```

接口：

| 方法 | 职责 |
|---|---|
| `Name() string` | provider 标识 |
| `Configured() bool` | 商户参数是否齐备 |
| `CreatePayment(order) (payURL, error)` | 返回支付链接 / 二维码 |
| `VerifyNotify(c) (orderNo, amount, tradeNo, error)` | **验签**并解析回调 |
| `NotifyResponse() string` | 回调响应体（虎皮椒为纯文本 `success`） |

设计意图：把**验签**放进接口的必经路径，而非依赖实现者自觉。订单幂等、金额比对、加余额、审计留在 controller 统一强制，新 provider 无法绕过。

路由：

- 新增 `/api/lingjing/pay/notify/:provider`
- **保留 `/api/lingjing/pay/notify/hupijiao` 旧路径**。虎皮椒商户后台配置的回调 URL 指向旧路径，变更会导致线上掉单。

未配置任何 provider 时 `/pay/config` 返回 `enabled: false`，前台隐藏充值入口，仅保留兑换码充值与管理员手动充值 —— 这是新部署的开箱默认状态。

本期仅内置 hupijiao 一个实现。`docs/payment-provider.md` 说明如何接入其他支付。

## 四、发布前清理

### LICENSE

新增根目录 `LICENSE`（MIT）与 `NOTICE`。`NOTICE` 中保留 One API 原始版权声明，声明本项目为其衍生作品。

### 密钥与敏感信息

- 用 gitleaks 扫描**全量 git 历史**，确认无真实密钥曾被提交。若发现，评估改写历史或轮换密钥。
- `frontend/.env.production` 当前被 git 跟踪且含生产域名 → `git rm --cached`，加入 `.gitignore`，改为提供 `.env.production.example`。
- 所有示例值使用显眼占位符 `CHANGE_ME_*`，由启动自检拒绝。

### 保留项

`backend/web/`（One API 原版前端，2.5MB，经 `go:embed` 挂载）本期**保留不动**。删除需同步改 `main.go` 的 embed 指令与 `router/web.go`，回归风险不值得在本期承担。记录为后续 issue。

## 五、文档

`README.md`（本期中文，二期补英文）：项目简介 → 功能截图 → 技术栈 → 三步快速开始 → 环境变量表 → 常见问题。

`docs/` 新增四篇：

- `deployment.md` —— 完整部署流程、HTTPS 三种模式、反代 / CDN 注意事项
- `configuration.md` —— 全量环境变量参考
- `payment-provider.md` —— 接入自有支付
- `upgrade.md` —— 版本升级与数据库迁移

`CHANGELOG.md` 已存在，继续维护。

## 六、生产站迁移与验证

### 开发与验证流程

全程在 `feature/deployable` 分支进行。

**核心验证**（也是一期完成的判定标准）：在本地用**全新空库**完整走一遍开箱流程 —— clone → 填 `.env` → `docker compose up -d` → 注册首个账号成 root → 后台加渠道 → 调通 `/v1/chat/completions`。这是"别人能否部署"的唯一真实验证，不可用生产环境代替。

### 生产站切换

唯一需要停机的动作是 **nginx 从宿主机迁入容器**：停宿主机 nginx，将 certbot 证书路径挂载进容器。预计停机 10–15 分钟，安排在凌晨低峰。

步骤：

1. 切换前执行 `scripts/backup-mysql.sh`
2. 旧 `one-api/docker-compose.yml` 与宿主机 nginx conf 原地保留，不删除
3. 生产 `.env` 中 `SSL_MODE=external`、`MYSQL_DATA_PATH` 指向现有 bind mount 路径、`PUBLIC_API_BASE_URL=https://api.aitoken.homes`
4. 切换后按验证清单逐项确认
5. 任一项失败 → 停新 compose、恢复宿主机 nginx 与旧 compose，回滚窗口 5 分钟

### 切换后验证清单

- 跨子域 cookie 登录（主域 / api / admin 三域共享 session）
- CORS 白名单对新配置生效，且 `AllowAllOrigins` 与 `AllowCredentials` 未同时开启
- SSE 流式对话不中断
- 图生图 30MB multipart 上传不返回 413
- 支付回调（旧路径 `/pay/notify/hupijiao`）可达并验签通过
- 异步任务系统正常出图，长耗时请求不被 nginx `proxy_read_timeout` 截断
- `abilities` 表路由正常，模型可正确匹配渠道
- MySQL DSN 保持 `charset=utf8mb4&parseTime=True&loc=Local`

## 风险

| 风险 | 缓解 |
|---|---|
| nginx 入容器导致证书 / 真实 IP 透传失效 | 证书目录挂载 + 保留 CF real_ip 配置段；切换前在测试域名验证 |
| 前端改运行时配置引入加载时序 bug（`config.js` 未就绪即读取） | `config.js` 在业务 bundle 之前同步加载；前端加 fallback 与显式报错 |
| 支付重构影响线上交易 | 旧回调路径保留；重构保持行为不变，先在测试商户号验证；订单幂等与金额校验逻辑不改动 |
| 生产 `.env` 迁移遗漏某个变量导致容器内取不到值 | compose 采用显式 `environment:` 白名单（项目既有约定），逐项与现有 compose 对照核验 |
| git 历史中存在未发现的密钥 | 发布前 gitleaks 全历史扫描，作为发布卡点 |
