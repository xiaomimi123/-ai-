# 生产站迁移 Runbook：旧 one-api 裸机栈 → 新 docker-compose 全栈

**本文档只是操作手册，不代表迁移已经执行。** 实际切换需要停机窗口，由运维人员择时在生产服务器
（`8.218.203.189`，香港）上手动执行本文档中的命令。任何一步失败都应停下来按 Step 6 回滚，而不是
强行继续。

## 0. 迁移的本质

| | 旧栈（现状） | 新栈（`feature/deployable`） |
|---|---|---|
| 代码位置 | 假设 `/root/lingjing-ai/one-api/`（**Step 1 必须确认真实路径**） | 假设 `/root/lingjing-ai/`（同一 git 仓库根目录，**同上**） |
| 容器 | `one-api`（backend）、`one-api-mysql`、`one-api-redis` 三个容器，编排文件 `one-api/docker-compose.yml` | `backend`/`frontend`/`admin`/`mysql`/`redis`/`nginx`（+ 可选 `certbot`），编排文件根 `docker-compose.yml` |
| nginx | **裸机 nginx**（`systemctl` 管理），配置在 `/etc/nginx/conf.d/api-platform.conf`，HTTPS 由宿主机 certbot 就地维护 | **容器化 nginx**（`nginx/templates/` + envsubst），需要额外挂载/扩展才能覆盖旧栈的三域名 + HTTPS 能力，见 Step 3 |
| 数据 | `one-api/mysql-data`、`one-api/redis-data`（bind mount） | **零迁移**：新栈的 `MYSQL_DATA_PATH` / `REDIS_DATA_PATH` 直接指向同一批目录，新旧栈共用一份数据 |

**安全须知（贯穿全程）：**

- **`SESSION_SECRET` 与 `COOKIE_DOMAIN` 禁止在迁移中改动或改名**。`SESSION_SECRET` 变了等于让全体
  在线用户瞬间掉线；本项目 2026-04-25 曾因 cookie/session 配置不一致导致订单串号事故（见内部记忆
  `feedback_cookie_session_collision.md`），迁移只做"栈搬家"，任何鉴权相关配置一律照抄旧值，
  **不新生成、不"顺便优化"**。
- 服务器上 `docker` 命令需要 `sudo`，下文命令按此假设书写；如实际免 sudo 请自行去掉。
- MySQL 容器名固定为 `one-api-mysql`（旧栈 `container_name`），数据库名固定为 `oneapi`。

---

## Step 1：导出生产站现有配置作为对照基准

**在生产服务器上执行**，把每条命令的真实输出贴进本 runbook 对应位置（下面 Step 2/3 的表格中标
"待确认"的项，最终都要用这里的真实输出替换，不能沿用本文档里的占位值）。

```bash
# 0. 确认部署根目录（brief 假设是 /root/lingjing-ai，必须现场确认）
ls -la /root/lingjing-ai 2>/dev/null || echo "路径不对，找找 crontab / systemctl / docker ps 里的线索"
crontab -l | grep -i lingjing   # backup-mysql.sh 的 cron 行能反推出真实仓库路径

# 1. 旧栈 one-api 服务的完整环境变量（含 TASK_* 各项当前取值）
cd /root/lingjing-ai/one-api   # 若 Step 0 发现路径不同，这里同步改
sudo docker compose config | grep -A100 "one-api:" | grep -E "^\s+-\s[A-Z_]+="

# 2. 裸机 nginx 的真实生效配置（certbot 已经就地改写过，会比仓库里
#    nginx/api-platform.conf 这份"参考版"多出 443 ssl 相关 server 块 /
#    ssl_certificate 指令 —— 这些真实的 SSL 段落是 Step 3 要照搬的对象）
cat /etc/nginx/conf.d/api-platform.conf

# 3. 证书目录：确认三个域名各自的证书路径（可能是三个独立目录，也可能
#    是一张多域名 SAN 证书只在其中一个目录下）
ls -la /etc/letsencrypt/live/

# 4. certbot 续期方式：迁移后 80/443 端口的主人从裸机 nginx 换成 docker
#    nginx 容器，必须确认续期机制切换后仍然可用（webroot 方式依赖裸机
#    nginx 把 /.well-known/acme-challenge/ 转发到某个目录；standalone
#    方式依赖临时抢占 80 端口）
crontab -l | grep -i certbot
systemctl list-timers 2>/dev/null | grep -i certbot
cat /etc/letsencrypt/renewal/*.conf | grep -E "^(authenticator|webroot_path)"

# 5. MySQL / Redis 真实的数据卷宿主机路径（**零迁移的关键**，新栈的
#    MYSQL_DATA_PATH / REDIS_DATA_PATH 必须精确等于这里的 Source，
#    填错等于指向一个空目录、新栈起来后看起来"正常"但其实是全新空库）
sudo docker inspect one-api-mysql --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
sudo docker inspect one-api-redis --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'

# 6. 旧栈 .env 里的密钥现值（只确认"非空"，不要把真实值贴进本文档或
#    任何聊天记录 —— 迁移时直接原样复制 .env 文件，不手抄数值）
grep -cE "^(MYSQL_PASSWORD|SESSION_SECRET)=" /root/lingjing-ai/one-api/.env
```

**Step 1 产出（迁移前必须逐项打勾确认，而不是照抄下面的假设值）：**

- [ ] 部署根目录真实路径：______（brief 假设 `/root/lingjing-ai`）
- [ ] 旧栈 `TASK_*` 现值与本仓库 `one-api/docker-compose.yml` 一致（如运维手动改过要以现场输出为准）
- [ ] 三个域名的证书目录名：______
- [ ] certbot 续期方式（webroot / standalone / dns-01）：______，切换后是否受影响：______
- [ ] `one-api-mysql` 的 `Source` 路径：______
- [ ] `one-api-redis` 的 `Source` 路径：______

---

## Step 2：生产 `.env` 对照表

以下是新栈 `.env` 需要落地的完整取值。"来源"一列标注了这个值是从仓库当前配置直接推出的（可信、
本文档已核实），还是需要 Step 1 现场确认的。

| 变量 | 生产取值 | 来源 |
|---|---|---|
| `SITE_URL` | `https://aitoken.homes` | 现 `ServerAddress`（`SERVER_ADDRESS` 用于邮件链接、支付跳转） |
| `BASE_DOMAIN` | `aitoken.homes` | nginx `admin.${BASE_DOMAIN}` 匹配用 |
| `SITE_NAME` | `灵镜AI` | 现 `config.SystemName`（存于 DB，非 env；零迁移场景下这个变量只影响新装机的默认值，DB 里已有的现值不会被覆盖） |
| `COOKIE_DOMAIN` | `.aitoken.homes` | 旧 `one-api/docker-compose.yml` 内联值（**禁止改动，见 Step 0 安全须知**） |
| `CORS_ALLOWED_ORIGINS` | `https://aitoken.homes,*.aitoken.homes` | 等价于旧 `cors.go` 硬编码逻辑；已核对 `backend/middleware/cors.go` 的 `originAllowed()`：不带通配的裸域名需要精确列出，`*.aitoken.homes` 覆盖 `admin.`/`api.` 等子域 |
| `PUBLIC_API_BASE_URL` | `https://api.aitoken.homes` | 现 `frontend/.env.production`，绕开 CF 对长耗时请求的超时限制（见 `docs/deployment.md` 第 5 节） |
| `SSL_MODE` | `external` | 证书由现有宿主机 certbot 管理，**但见下方"⚠️ SSL_MODE=external 的坑"** |
| `MYSQL_DATA_PATH` | Step 1 第 5 条 `one-api-mysql` 的真实 `Source` | **零迁移**，brief 假设值 `/root/lingjing-ai/one-api/mysql-data`，**必须用 Step 1 现场输出覆盖，不能直接抄这个假设值** |
| `REDIS_DATA_PATH` | Step 1 第 5 条 `one-api-redis` 的真实 `Source` | 同上，brief 假设值 `/root/lingjing-ai/one-api/redis-data` |
| `MYSQL_PASSWORD` / `SESSION_SECRET` | 沿用 `one-api/.env` 现值 | **必须原样复制，不得重新生成**——改了 `SESSION_SECRET` 等于让全员瞬间掉线；`MYSQL_PASSWORD` 改了则新栈连不上已有数据库里的旧密码 |
| `MAX_UPLOAD_SIZE` | `30M` | 现 `nginx/api-platform.conf` 主域名 `client_max_body_size 30M`（api 子域名现值是 `0` 即不限，新栈全局只有一个 `MAX_UPLOAD_SIZE`，取更严格的 30M；api 子域名走 Step 3 自建的 server 块可以按需单独放宽） |
| `NGINX_PROXY_READ_TIMEOUT` | `320` | ≥ `TASK_SYNC_WAIT_SECONDS`(300) + 20，`docs/deployment.md` 第 6 节有此约束的详细说明 |
| 全部 `TASK_*`（`ENABLE_TASK_SYSTEM`、`TASK_WORKER_INTERVAL`、`TASK_WORKER_BATCH_SIZE`、`TASK_TIMEOUT_MINUTES`、`TASK_RETENTION_DAYS`、`TASK_UPSTREAM_HTTP_TIMEOUT`、`TASK_MAX_FETCH_ERRORS`、`TASK_SYNC_WAIT_SECONDS`、`TASK_SYNC_POLL_INTERVAL_SECONDS`） | 逐项照抄 `one-api/docker-compose.yml`（本仓库已核实的现值见下） | **勿用 `.env.example` 的默认值**——本仓库 `one-api/docker-compose.yml` 里这些值已经是踩过坑后调过的生产值（例如 `TASK_UPSTREAM_HTTP_TIMEOUT=180s`、`TASK_TIMEOUT_MINUTES=20`），如果 Step 1 现场输出与此不同，以现场输出为准 |
| `ROOT_USER_EMAIL` | 不需要特别设置，保持默认 | 只在数据库无任何用户时才会用来创建初始管理员；零迁移场景下 DB 已有真实管理员账号，这个变量不生效 |

**本仓库已核实的 `TASK_*` 现值（`one-api/docker-compose.yml`）：**

```
ENABLE_TASK_SYSTEM=${ENABLE_TASK_SYSTEM:-false}
TASK_WORKER_INTERVAL=${TASK_WORKER_INTERVAL:-5s}
TASK_WORKER_BATCH_SIZE=${TASK_WORKER_BATCH_SIZE:-50}
TASK_TIMEOUT_MINUTES=${TASK_TIMEOUT_MINUTES:-20}
TASK_RETENTION_DAYS=${TASK_RETENTION_DAYS:-30}
TASK_UPSTREAM_HTTP_TIMEOUT=${TASK_UPSTREAM_HTTP_TIMEOUT:-180s}
TASK_MAX_FETCH_ERRORS=${TASK_MAX_FETCH_ERRORS:-5}
TASK_SYNC_WAIT_SECONDS=${TASK_SYNC_WAIT_SECONDS:-300}
TASK_SYNC_POLL_INTERVAL_SECONDS=${TASK_SYNC_POLL_INTERVAL_SECONDS:-2}
```

这些右侧是 `docker-compose.yml` 里写的 fallback 默认值，不是生产真实值——`one-api/.env`（旧栈的
环境变量文件）里如果覆盖了其中任何一项，Step 1 第 1 条命令的现场输出会体现出真实生效值，**以现场
输出为准，不要直接抄这里的 fallback**。

**`SQL_DSN` 差异（不需要手工处理，新栈已内置修复）：** 旧栈 `SQL_DSN` 是
`root:${MYSQL_PASSWORD}@tcp(mysql:3306)/oneapi`（无 `charset`/`parseTime`/`loc` 参数）；新栈根
`docker-compose.yml` 已把 DSN 硬编码为
`root:${MYSQL_PASSWORD}@tcp(mysql:3306)/oneapi?charset=utf8mb4&parseTime=True&loc=Local`，
三件套是 compose 文件里写死的，不经过 `.env`，迁移时无需在 `.env` 里额外配置。

**`SESSION_SECRET` 必须沿用旧值 —— 换了等于让所有在线用户瞬间掉线。**

### ⚠️ `SSL_MODE=external` 的坑：新栈默认只监听 HTTP，不会自动帮你在三个域名上装 443

`docs/deployment.md` 第 5 节写得很清楚：`SSL_MODE=external` 的意思是"本容器组只监听 HTTP，TLS、
HTTP/2、证书轮换全部交给外层（CDN 或反代）处理"——`nginx/docker-entrypoint-ssl.sh` 在这个模式下
直接使用 `nginx/templates/`（纯 HTTP 模板），**不会**套用 `nginx/templates-ssl/` 里那套 443 ssl
配置（那套只在 `SSL_MODE=letsencrypt` 下启用）。

这对 `aitoken.homes`（CF 橙云代理）大体成立——CF 边缘可以是那个"外层"。但
`api.aitoken.homes` / `admin.aitoken.homes` 是 **CF 灰云直连**，浏览器直接打到源站 IP，边缘没有
任何人帮它们终止 TLS。旧栈能用 HTTPS 访问这两个域名，靠的是**裸机 nginx 自己**（被 certbot 就地
改写过配置）在 443 上终止 TLS。新栈如果原样套用 `SSL_MODE=external` 的默认行为，`api`/`admin` 两
个域名的 HTTPS 会直接从有变成无。

**结论：为了 1:1 复刻旧栈行为（迁移的首要目标是"不引入新行为"），新栈的 docker nginx 容器需要
自己在三个域名上终止 TLS**，做法是在 `SSL_MODE=external` 的基础上用一份手工维护的静态 nginx 配
置补齐这块——具体怎么做见 Step 3。这不是 bug，是 `external` 模式的设计就没有覆盖"多域名、部分走
CDN 部分直连"这种拓扑，本次迁移需要手工补一层。

---

## Step 3：nginx 迁移方案

新模板（`nginx/templates/site.conf.template`，`SSL_MODE=external` 下唯一生效的模板）只有两块：
`admin.${BASE_DOMAIN}` 和兜底 `default_server`，都只监听 80。生产站需要在它之上补三件事：

### 3.1 新增 `api.${BASE_DOMAIN}` 的 HTTP server 块

现有 `nginx/api-platform.conf` 里已经有这段逻辑，照搬到新的 `nginx/templates/api.conf.template`
（会被 envsubst 处理，放在 `nginx/templates/` 目录下，与 `site.conf.template` 一起生效）：

```nginx
# nginx/templates/api.conf.template
server {
    listen 80;
    server_name api.${BASE_DOMAIN};

    client_max_body_size 0;   # 照抄旧配置：api 子域名不限上传体积

    location = / {
        return 302 https://${BASE_DOMAIN}/;
    }

    location /api/ {
        proxy_pass http://backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout ${NGINX_PROXY_READ_TIMEOUT}s;
        proxy_send_timeout ${NGINX_PROXY_READ_TIMEOUT}s;
        chunked_transfer_encoding on;
    }

    location /v1/ {
        proxy_pass http://backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout ${NGINX_PROXY_READ_TIMEOUT}s;
        proxy_send_timeout ${NGINX_PROXY_READ_TIMEOUT}s;
        chunked_transfer_encoding on;
    }

    location / {
        return 404;
    }
}
```

`backend_upstream` 是 `nginx/templates/site.conf.template` 里已经定义的 `upstream`（指向
`backend:3000`），沿用即可，不用改成旧配置里的 `http://127.0.0.1:3000`（新栈里 backend 是独立
容器，走 docker 网络，不是宿主机回环地址）。

### 3.2 补齐 443 直接终止 TLS（解决 Step 2 提到的 `SSL_MODE=external` 缺口）

新建 `nginx/conf.d-extra/` 目录（这个目录不经过 envsubst，直接放最终值，不是模板），把 Step 1 现场
抓到的 `/etc/nginx/conf.d/api-platform.conf` 真实内容（**含 certbot 就地加的 443 ssl 段落**）搬进
来，只做两处必要改写：

1. `proxy_pass http://127.0.0.1:3000` → `proxy_pass http://backend_upstream`（backend 现在是
   独立容器，不在宿主机回环地址上监听）
2. `ssl_certificate` / `ssl_certificate_key` 路径按 Step 1 第 3 条确认的真实证书目录调整

```bash
mkdir -p nginx/conf.d-extra
# 把 Step 1 抓到的真实 /etc/nginx/conf.d/api-platform.conf 内容整理进这个文件，
# 保留其中所有 "listen 443 ssl" 相关 server 块（aitoken.homes/www、
# api.aitoken.homes、admin.aitoken.homes 三个域名各一块）
vi nginx/conf.d-extra/ssl-servers.conf
```

### 3.3 CF 真实 IP 透传

`nginx/api-platform.conf` 顶部那 15 行 `set_real_ip_from`（当前在仓库里是注释状态，**迁移时必须
取消注释**，否则后端日志、风控、限流看到的全是 CF 回源 IP 而不是用户真实 IP）：

```bash
cat > nginx/conf.d-extra/cloudflare-realip.conf <<'EOF'
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
EOF
```

### 3.4 把上面两个 extra 文件、以及证书目录挂进 nginx 容器

编辑根 `docker-compose.yml` 的 `nginx:` 服务，**把 `certbot-conf` 具名卷换成宿主机真实证书目录的
bind mount**（否则容器里看到的是一个空的 docker 卷，不是 certbot 真正维护的证书），并追加两个
extra 配置文件的挂载：

```yaml
  nginx:
    # ... 其余不变 ...
    volumes:
      - frontend-dist:/var/www/frontend:ro
      - admin-dist:/var/www/admin:ro
      - certbot-www:/var/www/certbot
      - /etc/letsencrypt:/etc/letsencrypt:ro          # 原来是 certbot-conf 具名卷，改成宿主机真实证书目录
      - ./nginx/conf.d-extra/cloudflare-realip.conf:/etc/nginx/conf.d/cloudflare-realip.conf:ro
      - ./nginx/conf.d-extra/ssl-servers.conf:/etc/nginx/conf.d/ssl-servers.conf:ro
```

`nginx/conf.d-extra/api.conf.template` 挂到 `nginx/templates/` 下即可被现有的 envsubst 流程处理，
不需要额外挂载（放进仓库的 `nginx/templates/` 目录，跟 `site.conf.template` 同级）。

**待确认（无法在本文档里替你验证）：** certbot 续期方式（Step 1 第 4 条）在裸机 nginx 停机后是否
仍能正常续期。如果是 `webroot` 方式且 webroot 目录之前由裸机 nginx 提供访问，需要在
`nginx/conf.d-extra/` 里补一个 80 端口的 `/.well-known/acme-challenge/` location 转发到同一个
webroot 目录（bind mount 进容器），否则下次续期会失败。这一点必须在真正停止裸机 nginx 之前想清
楚，本文档不代为决定。

---

## Step 4：切换步骤

每一步都带命令和验证方法，按顺序执行，**不要跳步**。

1. **低峰期开始（建议凌晨），公告提前挂出**
   ```bash
   # 站内公告接口 / 前端公告位，提前 30 分钟挂出维护通知
   ```
2. **备份**：`./scripts/backup-mysql.sh`，确认备份文件大小合理（对比历史备份体积，明显偏小说明
   备份不完整）
   ```bash
   ls -lh /root/lingjing-backups/ | tail -5
   ```
3. **拉取代码**：`git fetch && git checkout feature/deployable`
   ```bash
   cd /root/lingjing-ai   # Step 1 确认过的真实路径
   git fetch
   git checkout feature/deployable
   git log -1 --oneline   # 确认 HEAD 是预期的提交
   ```
4. **按 Step 2 表格写好 `.env`**（含 Step 1 现场确认过的 `MYSQL_DATA_PATH`/`REDIS_DATA_PATH`，
   以及从 `one-api/.env` 原样复制的 `MYSQL_PASSWORD`/`SESSION_SECRET`），并完成 Step 3 的 nginx
   扩展文件与 `docker-compose.yml` 挂载改动
   ```bash
   cp .env.example .env
   vi .env   # 按 Step 2 表格逐项填写
   grep -c CHANGE_ME_ .env   # 必须输出 0，否则 deploy.sh 会拒绝启动
   ```
5. **构建镜像（不停机，缩短后续停机窗口）**：`docker compose build`
   ```bash
   sudo docker compose build
   ```
6. **停机开始**：停止裸机 nginx
   ```bash
   sudo systemctl stop nginx
   ```
7. **停旧栈（不加 `-v`，数据卷必须保留）**
   ```bash
   cd one-api
   sudo docker compose down   # 确认命令里没有 -v / --volumes
   cd ..
   ```
8. **起新栈**
   ```bash
   sudo docker compose up -d
   sudo docker compose ps   # 确认 backend/mysql/redis/frontend/admin/nginx 全部 running/healthy
   ```
9. **按 Step 5 清单逐项验证**（见下节，全部通过才可以撤下公告）
10. **停机结束**：验证全部通过后撤下公告

---

## Step 5：切换后验证清单

逐条打勾，每条都有具体验证命令；**任何一条不过都不要撤维护公告**，先按 Step 6 判断是否需要回滚。

- [ ] **主域名前台可访问，站名显示为「灵镜AI」**
  ```bash
  curl -s https://aitoken.homes/ -o /dev/null -w '%{http_code}\n'   # 200
  curl -s https://aitoken.homes/config.js | grep -i siteName        # 应看到 灵镜AI
  ```
- [ ] **`admin.aitoken.homes` 可登录，且登录态与主域名互通（跨子域 cookie 生效）**
  ```
  浏览器先登录 https://aitoken.homes，再直接打开 https://admin.aitoken.homes，
  应免登录直接进后台（COOKIE_DOMAIN=.aitoken.homes 生效的标志）
  ```
- [ ] **`api.aitoken.homes/v1/chat/completions` 用真实令牌调通**
  ```bash
  curl -s https://api.aitoken.homes/v1/chat/completions \
    -H "Authorization: Bearer <真实令牌>" -H "Content-Type: application/json" \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'
  ```
- [ ] **SSE 流式对话逐字输出**
  ```
  在 Playground / 聊天页面发起对话，观察是否逐字流式出现（不是等全部生成完一次性弹出）；
  也可用 curl -N 加 "stream": true 观察 chunk 是否分批到达而不是最后一次性吐出
  ```
- [ ] **图生图上传 25MB 文件不返回 413**
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -F "image=@/path/to/25mb.png" \
    https://aitoken.homes/api/...(实际图生图接口)   # 应为 200，不是 413
  ```
- [ ] **异步任务出图正常，长耗时请求不被 nginx 截断**
  ```
  用一次实测 p95 较长（多参考图 img2img）的请求验证：不应在 NGINX_PROXY_READ_TIMEOUT(320s)
  之前收到网关超时（504/524），应正常拿到结果或降级为 202 + task_id 轮询
  ```
- [ ] **支付回调路径 `POST https://aitoken.homes/api/lingjing/pay/notify/hupijiao` 返回 200（非 404）**
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    https://aitoken.homes/api/lingjing/pay/notify/hupijiao
  # 已核实路由：backend/router/lingjing-router.go 里 public.POST("/pay/notify/:provider", ...)
  # 是通配路由，provider=hupijiao 会命中，预期至少是 200（业务层因缺签名会拒绝，
  # 但不应该是 404 —— 404 说明路由没挂上）
  ```
- [ ] **真实小额支付走通全流程（下单 → 支付 → 回调 → 余额到账 → 站内通知）**
  ```
  用真实账号下一笔最小额度充值订单，完整走一遍虎皮椒支付流程，确认到账金额、
  站内通知都正常（本条无法用 curl 单条命令验证，必须人工走一遍）
  ```
- [ ] **已有用户登录后余额、订单、日志数据完整**
  ```
  用迁移前就存在的真实账号登录，核对余额、历史订单列表、调用日志与迁移前是否一致
  ```
- [ ] **`abilities` 表路由正常，各模型能匹配到渠道**
  ```bash
  sudo docker compose exec mysql mysql -uroot -p"$MYSQL_PASSWORD" oneapi \
    -e "SELECT COUNT(*) FROM abilities WHERE enabled=1;"
  # 应为非零且与迁移前记录数量一致；再用上面 /v1/chat/completions 的真实调用
  # 结果做最终确认（curl 200 且返回正常内容，而不是"当前分组下没有可用的渠道"）
  ```
- [ ] **CF 真实 IP 透传生效（日志中 IP 不是 CF 网段）**
  ```bash
  sudo docker compose logs nginx --tail=50 | grep -E '^\S+' 
  # 或直接看 backend 侧记录的请求 IP，应为真实用户 IP（非 173.245.x.x /
  # 103.21.x.x 等 Step 3.3 列出的 CF 网段）
  ```

---

## Step 6：回滚方案

**5 分钟回滚：**

```bash
cd /root/lingjing-ai              # Step 1 确认过的真实路径
sudo docker compose down          # 停新栈（同样不加 -v）
cd one-api
sudo docker compose up -d         # 起旧栈
cd ..
sudo systemctl start nginx        # 恢复裸机 nginx
curl -sf https://aitoken.homes/api/status
```

**回滚不涉及数据恢复。** 新旧两套栈的 `MYSQL_DATA_PATH`/`REDIS_DATA_PATH` 从 Step 2 开始就指向
Step 1 确认的**同一批**宿主机目录，回滚只是换回旧的容器编排去读同一份数据，不存在"数据卷路径变了
需要倒回去"的问题。

**只有在 MySQL 数据确实损坏（而不是单纯想撤回这次切换）时**，才需要用 Step 4 第 2 步的备份做真正
的数据恢复：

```bash
gunzip -c /root/lingjing-backups/oneapi-<TIMESTAMP>.sql.gz | \
  sudo docker compose exec -T mysql mysql -uroot -p"$MYSQL_PASSWORD" oneapi
```

---

## Step 7：提交

```bash
cd /Users/lizhishaoniange/lingjing-ai
git add docs/production-migration-runbook.md
git commit -m "docs: 生产站切换 runbook（配置对照表 / 切换步骤 / 验证清单 / 回滚）"
```
