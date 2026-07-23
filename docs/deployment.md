# 部署指南

## 1. 前置要求

- Docker（本文档基于 Docker 29.x 验证；官方要求 20.10+）
- Docker Compose v2（即 `docker compose`，不是老的 `docker-compose` 独立二进制；本文档基于 v5.1.1 验证）
- 机器配置：建议 **4C8G** 起。各容器设有资源上限（`docker-compose.yml` 里的 `mem_limit`/`cpus`）：
  backend 4G/2 核、mysql 3G/1.5 核、redis 512M/0.5 核，合计上限约 7.5G/4 核，
  8G 内存留出系统与构建阶段的余量。
- 需要开放的端口：`HTTP_PORT`（默认 80）、`HTTPS_PORT`（默认 443，仅在启用 HTTPS 时需要）。
  两者均可在 `.env` 里改成非特权端口，供反代在前面接管。

## 2. 最小部署（本地 / 内网试跑）

`SSL_MODE=none`，用 `localhost` 访问，不需要域名和证书。

```bash
git clone <仓库地址> && cd <目录名>
cp .env.example .env

# 必填三项：MYSQL_PASSWORD、SESSION_SECRET、SITE_URL（本地填 http://localhost 即可，模板默认值就是它）
sed -i '' "s/^MYSQL_PASSWORD=.*/MYSQL_PASSWORD=$(openssl rand -hex 16)/" .env
sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 32)|" .env

./deploy.sh
```

`deploy.sh` 会依次：检查 `.env` 里没有残留的 `CHANGE_ME_` 占位符 → `git pull`（非 git 仓库会跳过）→
`docker compose build` → `docker compose up -d` → 轮询 `/api/status` 做健康检查。

**验证部署是否成功：**

```bash
curl -s http://localhost/api/status        # 后端 API，应返回 JSON 且 success:true
curl -s http://localhost/ -o /dev/null -w '%{http_code}\n'   # 站点前台，应为 200
curl -s http://localhost/config.js         # 运行时配置，应能看到 siteName 等字段
docker compose ps                          # 6 个服务应全部 running（certbot 未启用 profile 时不会出现）
```

浏览器打开 `http://localhost`：首次启动、数据库里还没有任何用户时会自动创建内置管理员账号
**`root` / `123456`**，登录管理后台（`http://admin.localhost` 或 `http://localhost` 加 `Host: admin.localhost` 头）后
**请立刻在「个人设置」里修改密码**。

## 3. 带域名部署

### DNS 需要解析的记录

假设你的域名是 `example.com`：

| 记录类型 | 主机名 | 指向 |
|---|---|---|
| A | `@`（即 `example.com`） | 服务器公网 IP |
| A | `admin`（即 `admin.example.com`） | 服务器公网 IP |

nginx 按 `Host` 头分流：`admin.<BASE_DOMAIN>` 命中管理后台，其余 Host（包括裸域名）落到用户前台的 `default_server`。

### 四个变量的填写关系

| 变量 | 含义 | 与 `BASE_DOMAIN` 的关系 |
|---|---|---|
| `BASE_DOMAIN` | 主域名（不含协议），nginx 用它匹配 `admin.${BASE_DOMAIN}` | 基准值 |
| `SITE_URL` | 站点地址（含协议），写入后端 `SERVER_ADDRESS`，用于邮件链接、支付跳转等 | `http(s)://` + `BASE_DOMAIN` |
| `CORS_ALLOWED_ORIGINS` | 后端 CORS 白名单，逗号分隔，支持 `*.example.com` 通配 | 通常填 `https://${BASE_DOMAIN},https://admin.${BASE_DOMAIN}`，或直接用通配 `https://*.${BASE_DOMAIN}` |
| `COOKIE_DOMAIN` | 登录态 cookie 的 Domain 属性 | 单域名部署留空；主域名+`admin` 子域名共享登录态时填 `.${BASE_DOMAIN}`（**前导点不能漏**） |

**具体例子**（`example.com` + `admin.example.com`，都用 HTTPS）：

```bash
BASE_DOMAIN=example.com
SITE_URL=https://example.com
CORS_ALLOWED_ORIGINS=https://example.com,https://admin.example.com
COOKIE_DOMAIN=.example.com
```

## 4. HTTPS 三档

`SSL_MODE` 决定 nginx 用 HTTP 模板还是 HTTPS 模板（`nginx/docker-entrypoint-ssl.sh` 在官方 `envsubst`
脚本之前跑，按此变量二选一覆盖模板目录）。

| 档位 | 适用场景 | `.env` 怎么填 |
|---|---|---|
| `none` | 本地/内网试跑，或 TLS 完全由外部处理 | `SSL_MODE=none` |
| `letsencrypt` | 域名已解析到本机，希望容器自己签发和续期证书 | `SSL_MODE=letsencrypt`，`CERTBOT_EMAIL=` 填你的邮箱 |
| `external` | 站点放在 CDN 或外层反代（Nginx/Caddy/云 LB）之后，TLS 在外层终结 | `SSL_MODE=external` |

### `letsencrypt` 首次签发

容器首次以 `letsencrypt` 启动时，若还没有证书文件，会自动退回 HTTP 模板保证 ACME HTTP-01 挑战能走通
（见 `nginx/docker-entrypoint-ssl.sh`）。首次签发需要手动跑一次：

```bash
docker compose --profile letsencrypt run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d example.com -d admin.example.com \
  --email you@example.com --agree-tos --no-eff-email
docker compose restart nginx
```

`certbot` 服务本身平时不随 `docker compose up -d` 启动（它带 `profiles: ["letsencrypt"]`，
只有显式 `--profile letsencrypt` 时才会跑），常驻的续期循环需要单独用该 profile 启动：

```bash
docker compose --profile letsencrypt up -d certbot
```

`.env` 里的 `CERTBOT_EMAIL` 目前只是给你自己留档用的备忘变量，**不会被自动代入上面的命令**——
首次签发命令里的 `--email` 需要手动填，建议就填与 `CERTBOT_EMAIL` 一致的邮箱，保持两处不脱节。

## 5. 放在 CDN 或外层反代后面

`SSL_MODE=external`：本容器组只监听 HTTP，TLS、HTTP/2、证书轮换全部交给外层（CDN 或反代）处理，
外层再把请求转发到本机的 `HTTP_PORT`。

**长耗时请求（图像生成）可能需要单独的 API 子域名直连**：多数 CDN / WAF 对单个请求有固定的最大等待时长
（常见 30–100s），而异步任务系统的 sync 模式单次调用可能等待到 `TASK_SYNC_WAIT_SECONDS`（默认 300s）
才降级为轮询——请求还没等到结果就会被 CDN 掐断，前端拿到的是 CDN 的超时页而不是真实的图片。
遇到这种情况，给 API 单独解析一个不经过 CDN（DNS 直连服务器）的子域名，例如 `api.example.com`，
再把 `PUBLIC_API_BASE_URL` 设成 `https://api.example.com`——前端会用这个地址而不是同源 `/api` 发请求。
不需要额外配置 nginx：`nginx/templates/site.conf.template` 的 `default_server` 本来就兜底所有未匹配
的 Host，`api.example.com` 只要 DNS 解析到同一台机器即可命中。

`PUBLIC_API_BASE_URL` 留空时前端走同源 `/api`（推荐，零额外 DNS 配置），只有确实需要绕开 CDN/WAF
的场景才需要填。

## 6. 上传体积与超时

- `MAX_UPLOAD_SIZE`（默认 `30M`）：nginx `client_max_body_size`，图生图 multipart 上传体积上限。
  nginx 默认只有 1M，不设置这个变量会导致图生图上传报 413。
- `NGINX_PROXY_READ_TIMEOUT`（默认 `320`，单位秒）：nginx 等待后端响应的上限（`proxy_read_timeout`）。

**必须满足 `NGINX_PROXY_READ_TIMEOUT ≥ TASK_SYNC_WAIT_SECONDS + 20`**（默认 320 ≥ 300 + 20，
两者默认值刚好贴着这条线）。异步任务系统 sync 模式会让客户端一次调用最多等到
`TASK_SYNC_WAIT_SECONDS` 秒；如果 nginx 等不了这么久就会先掐断连接，客户端收到的是网关超时而不是
真实结果——即使后端其实已经出图成功。改了 `TASK_SYNC_WAIT_SECONDS` 记得同步调大这个变量。

## 7. 从既有部署迁移

`MYSQL_DATA_PATH` / `REDIS_DATA_PATH` / `BACKEND_DATA_PATH` 留空时用 Docker 具名卷（推荐，新部署用这个）；
填绝对路径时改用宿主机 bind mount——**填原有部署的 MySQL 数据目录路径即可直接复用数据**，
不需要导出再导入。三个路径互相独立，可以只迁移其中一个。

```bash
MYSQL_DATA_PATH=/opt/old-deploy/mysql-data
```

## 8. 常见问题

**登录后立刻掉线 / 反复要求重新登录**
`COOKIE_DOMAIN` 配错。单域名部署应留空；多子域（主域名 + `admin` 子域名）部署必须填
`.example.com`（带前导点），少了点或域名对不上，浏览器不会把 cookie 带到另一个子域名，
表现就是登录后一刷新就掉线。

**前端报跨域错误（CORS）**
标准同源部署中 CORS 不会触发（前端和 API 同源）。若后端被跨域访问，检查 `CORS_ALLOWED_ORIGINS` 是否包含该来源。
它是精确匹配 + `*.example.com` 通配的白名单；localhost/127.0.0.1 仅在调试模式（`GIN_MODE=debug`）自动放行，
生产部署需显式列出。紧急情况下可临时设 `CORS_FALLBACK_OPEN=true` 退回"任意 origin + 带凭证" 恢复访问，
但这会牺牲安全性，**排查清楚后必须改回 `false`**。

**上传图片报 413**
`MAX_UPLOAD_SIZE` 太小或没设置（nginx 默认 1M）。默认值 `30M` 一般够用，参考图更多或更大时再调高。

**图像生成请求 524 / 网关超时**
`NGINX_PROXY_READ_TIMEOUT` 小于 `TASK_SYNC_WAIT_SECONDS + 20`，见第 6 节。如果站点在 CDN 后面，
CDN 自己的超时上限可能比 nginx 更短，需要参考第 5 节把长耗时请求走单独的 API 子域名绕开 CDN。

**"当前分组下没有可用的渠道" / 提示无可用渠道**
渠道未启用，或渠道上没有勾选对应模型。One API 的模型路由依赖 `abilities` 表（渠道×模型的可用关系），
去管理后台确认渠道状态为"已启用"且模型列表里包含你请求的模型名；如果是用 SQL 直接写
`channels` 表建的渠道，别忘了同步写 `abilities` 表，否则界面上渠道存在但路由不到（详见
[docs/upgrade.md](upgrade.md)）。
