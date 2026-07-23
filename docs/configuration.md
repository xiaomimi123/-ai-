# 配置参考

全部变量定义在 [`.env.example`](../.env.example)。**新增变量时必须同时改这个文件和
`docker-compose.yml` 里对应服务的 `environment:` 白名单**——本项目不用 `env_file` 整份注入，
只加 `.env` 不加 compose 白名单的话，容器内读不到这个值（`os.Getenv` 拿到空字符串）。

下表按 `.env.example` 里的分组逐项列出。"默认值"一栏是 `.env.example` 模板里写的值，
不是"留空时后端的兜底值"（两者大多数情况一致，个别不一致的已在说明里注明）。

## 必填

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `SITE_URL` | 是 | `http://localhost` | 站点地址，含协议、不带结尾斜杠。传给后端的 `SERVER_ADDRESS`，用于邮件链接、支付跳转地址等。 |
| `MYSQL_PASSWORD` | 是 | `CHANGE_ME_MYSQL_PASSWORD` | 数据库 root 密码。`deploy.sh` 会检查 `.env` 里是否还残留 `CHANGE_ME_` 前缀，留着占位符直接拒绝启动。 |
| `SESSION_SECRET` | 是 | `CHANGE_ME_SESSION_SECRET` | 会话密钥。除了不能是占位符，后端启动时还会校验长度（至少 16 字符）；建议用 `openssl rand -base64 32` 生成。 |

## 站点信息

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `SITE_NAME` | 否 | `AI API Platform` | 站点名称，显示在浏览器标题、页面 logo 旁、订单名、站内通知中。传给后端时映射为 `SYSTEM_NAME`。 |
| `ROOT_USER_EMAIL` | 否 | `admin@example.com` | 系统告警邮件的默认收件地址。**不会**绑定给自动创建的内置管理员账号（`root`/`123456`），两者无关。 |
| `BRAND_PRIMARY_COLOR` | 否 | `#2ECC71` | 前端主题色，十六进制。 |
| `BRAND_LOGO_URL` | 否 | 空 | logo 图片 URL，留空使用内置默认 logo。 |
| `BRAND_FOOTER_TEXT` | 否 | 空 | 页脚文案，留空则不显示。 |
| `BRAND_ICP_NUMBER` | 否 | 空 | ICP 备案号（中国大陆部署需要），留空则不显示。 |
| `BRAND_CONTACT_URL` | 否 | 空 | 客服/联系方式链接，留空则隐藏入口。 |

## 网络与 API 地址

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `BASE_DOMAIN` | 否 | `localhost` | 主域名（不含协议）。nginx 用它匹配 `admin.${BASE_DOMAIN}` 路由到管理后台，未匹配的 Host 落到用户前台。 |
| `PUBLIC_API_BASE_URL` | 否 | 空 | 前端调用后端的基址。留空 = 走同源 `/api`（推荐）。仅当把 API 放在独立子域名（例如绕开 CDN 超时限制，见 [deployment.md](deployment.md#5-放在-cdn-或外层反代后面)）时才填。 |
| `COOKIE_DOMAIN` | 否 | 空 | 跨子域共享登录态。单域名部署留空；多子域部署填 `.example.com`（**注意前导点**）。 |
| `CORS_ALLOWED_ORIGINS` | 否 | `http://localhost` | CORS 白名单，逗号分隔，支持 `*.example.com` 子域通配。在标准的单域名同源部署中，前端和 `/api` 同源，CORS 完全不会触发。但如若后端被跨域访问（如独立前端开发服务、非标准端口等），localhost/127.0.0.1 仅在 `GIN_MODE=debug` 时自动放行；生产环境需显式加入本环境变量。只影响非 `/v1/*` 路径——`/v1/*`（OpenAI 兼容接口）对所有 origin 开放，因为它靠 Bearer token 鉴权，不依赖 cookie。 |
| `HTTP_PORT` | 否 | `80` | nginx 对外 HTTP 端口。 |
| `HTTPS_PORT` | 否 | `443` | nginx 对外 HTTPS 端口。仅 `SSL_MODE=letsencrypt` 时有实际监听。 |

## HTTPS

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `SSL_MODE` | 否 | `none` | `none` 仅 HTTP；`letsencrypt` 内置 certbot 自动签发；`external` TLS 由外部终结（CDN/反代/已有证书）。三者之外的值会导致 nginx 启动失败并报错。 |
| `CERTBOT_EMAIL` | `SSL_MODE=letsencrypt` 时建议填 | 空 | 备忘用：建议记录你签发证书时用的邮箱。**当前不会被自动读取代入 certbot 命令**，首次签发命令里的 `--email` 参数需要手动填一致的值，见 [deployment.md](deployment.md#4-https-三档)。 |

## 数据持久化

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `MYSQL_DATA_PATH` | 否 | 空 | 留空 = 用 Docker 具名卷（推荐）；填绝对路径 = 用宿主机 bind mount，填原有部署的数据目录路径即可复用数据。 |
| `REDIS_DATA_PATH` | 否 | 空 | 同上，Redis 的持久化目录（AOF）。 |
| `BACKEND_DATA_PATH` | 否 | 空 | 同上，后端 `/data` 目录（日志等）。 |

## 上传与超时

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `MAX_UPLOAD_SIZE` | 否 | `30M` | nginx `client_max_body_size`。图生图 multipart 上传体积上限，nginx 原生默认仅 1M，不设会 413。 |
| `NGINX_PROXY_READ_TIMEOUT` | 否 | `320` | nginx `proxy_read_timeout`（秒）。**必须 ≥ `TASK_SYNC_WAIT_SECONDS + 20`**，否则图像生成请求会被 nginx 提前截断。 |

## 时区

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `TZ` | 否 | `Asia/Shanghai` | 容器时区，影响日志时间戳等。 |

## 异步任务系统

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `ENABLE_TASK_SYSTEM` | 否 | `false` | 是否启用异步任务系统（图像生成等长耗时请求走任务表 + worker 轮询）。 |
| `TASK_WORKER_INTERVAL` | 否 | `5s` | worker 轮询待处理任务的间隔。 |
| `TASK_WORKER_BATCH_SIZE` | 否 | `50` | worker 每轮最多取多少条任务处理。 |
| `TASK_TIMEOUT_MINUTES` | 否 | `20` | 任务超时判定（分钟）。多参考图 img2img 实测 p95 超过 10 分钟，默认给到 20 分钟余量。 |
| `TASK_RETENTION_DAYS` | 否 | `30` | 任务记录保留天数，超期清理。 |
| `TASK_UPSTREAM_HTTP_TIMEOUT` | 否 | `180s` | 请求上游模型 API 的 HTTP 超时。部分上游（如 apimart gpt-image 系列）单次调用要跑 30–450s，默认 30s 会直接超时失败。 |
| `TASK_MAX_FETCH_ERRORS` | 否 | `5` | worker 拉取上游任务结果连续失败次数上限，超过后判定任务失败。 |
| `TASK_SYNC_WAIT_SECONDS` | 否 | `300` | sync-by-default：客户端一次调用最多等这么久拿结果，超时才降级为 `202` + `task_id` 转轮询。 |
| `TASK_SYNC_POLL_INTERVAL_SECONDS` | 否 | `2` | sync 模式内部轮询上游结果的间隔。 |

## 其他

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `STREAM_NORMALIZER` | 否 | `on` | 流式响应规范化开关。 |
| `CORS_FALLBACK_OPEN` | 否 | `false` | 紧急开关：线上 CORS 配错导致接口全挂时临时设为 `true` 快速恢复（退回"任意 origin + 带凭证"）。**这会牺牲安全性，修好后必须改回 `false`**。 |

## 两个必须知道的坑

### `SITE_NAME` / `SITE_URL` 首次生效后，改 `.env` 不一定有用

后端把这两项分别映射为内部的 `SYSTEM_NAME`、`SERVER_ADDRESS`，它们的运行时值来自
`options` 表 + 环境变量兜底：启动时先把环境变量值写进内存里的默认值，再用数据库 `options` 表里的同名
记录覆盖（如果存在）。也就是说 **env 只提供"首次启动、数据库里还没有这条记录"时的默认值**——
一旦管理后台的系统设置里保存过一次这些字段（或它们已被写入 `options` 表），之后改 `.env` 并
`docker compose up -d` 不会再生效。要改一个已经跑起来的站点的这两项，请去管理后台的系统设置里改，
不要指望改 `.env` 就能覆盖。

### `ROOT_USER_EMAIL` 是纯环境变量，无法通过管理后台改

与 `SYSTEM_NAME`/`SERVER_ADDRESS` 不同，`ROOT_USER_EMAIL` 不走 `options` 表，也没有管理后台设置页面。
它完全由 `.env` 文件（或容器启动时的环境变量）决定。改了 `.env` 并重启后端容器，新值立即生效，不依赖数据库。

### 新增环境变量必须同时改两处

只在 `.env.example` 里加一行注释是不够的——`docker-compose.yml` 用显式的 `environment:` 列表把变量
逐个传进每个容器（没有用 `env_file` 整份注入这种写法），漏掉 compose 那一侧，容器内 `os.Getenv`
拿到的就是空字符串，表现通常是"配置了但好像没生效"，很难第一时间联想到是白名单漏加。
