# 新服务器部署清单

本清单以 **IP / 纯 HTTP 快速试跑**（`SSL_MODE=none`）为主线，帮助你在一台全新服务器上从零把站点跑起来并验证可用。
正式上域名 + HTTPS 的完整说明见 [deployment.md](deployment.md) 第 3–5 节，切换方式在文末「上生产」一节。

> 约定：下文 `mysite.test` 是**示例主机名**，请换成你自己的名字；`<服务器IP>` 换成服务器公网 IP。

## 阶段 0 — 先把代码放到服务器

可部署代码在 `main` 分支。二选一：

- [ ] **git clone（推荐）**：先确保远端 `main` 已是最新（`git push origin main`），服务器上 `git clone <仓库> lingjing-ai`。
- [ ] **rsync/scp**：直接把目录传上去，排除 `.git`、`node_modules`、各 `*/dist`、数据卷目录。此法下 `deploy.sh` 的 `git pull` 会自动跳过（脚本已兼容）。

## 阶段 1 — 服务器准备

- [ ] 安装 Docker + Compose 插件：`docker compose version` 能打印版本
- [ ] 机器 ≥ 4C8G；当前用户在 `docker` 组（否则命令全程加 `sudo`）
- [ ] 确认宿主机 **80** 和 **443** 端口空闲 —— ⚠️ 即使 `SSL_MODE=none`，compose 也会发布 443；被占就在 `.env` 改 `HTTP_PORT` / `HTTPS_PORT`

## 阶段 2 — 拿代码

- [ ] `git clone <你的仓库> lingjing-ai && cd lingjing-ai`（`main` 分支即含可部署代码）

## 阶段 3 — 配 `.env`

- [ ] `cp .env.example .env`
- [ ] **必改两项**（不改 `deploy.sh` 会直接拦下）：
  - `MYSQL_PASSWORD=` 一个强密码
  - `SESSION_SECRET=` 用 `openssl rand -base64 32` 的输出
- [ ] IP/HTTP 试跑建议值：

  ```dotenv
  SITE_URL=http://mysite.test          # 用一个你 hosts 里指向服务器IP的名字（见阶段5）
  SITE_NAME=你的站名
  BASE_DOMAIN=mysite.test              # 后台路由到 admin.${BASE_DOMAIN}
  COOKIE_DOMAIN=                       # 试跑留空即可
  CORS_ALLOWED_ORIGINS=http://mysite.test,http://admin.mysite.test
  PUBLIC_API_BASE_URL=                 # 留空 = 同源 /api（推荐）
  SSL_MODE=none                        # 已是默认
  HTTP_PORT=80                         # 80 被占就改，如 8080
  HTTPS_PORT=443                       # 443 被占就改，如 8443（none 档也会发布 443）
  MYSQL_DATA_PATH=                     # 留空 = 命名卷，新站够用
  REDIS_DATA_PATH=
  ```

- [ ] 自检：`grep CHANGE_ME_ .env` 应无输出

## 阶段 4 — 起站

- [ ] `./deploy.sh`
- [ ] 预期结尾：`🎉 部署完成` + 「后端 API / 站点前台 / 运行时配置」**三项全绿**
- [ ] 失败先看日志：`docker compose logs --tail=100`

## 阶段 5 — 访问与首次登录

- [ ] **前台**：`http://mysite.test`（或直接 `http://<服务器IP>` —— 裸 IP 只能到前台）
- [ ] **后台**：管理台靠 Host 头路由（`admin.${BASE_DOMAIN}`），裸 IP 到不了。在**你自己电脑**的 hosts 里加一行：

  ```
  <服务器IP>  mysite.test  admin.mysite.test
  ```

  再打开 `http://admin.mysite.test`
- [ ] **首登用内置管理员 `root` / `123456`**（不是「第一个注册的用户」，是首次启动、库为空时自动创建的），**登录后立即改密码**

## 阶段 6 — 让它真能用

- [ ] 后台「渠道」加一个上游（类型 / Base URL / Key / 支持的模型）→ 保存后可点「测试」
- [ ] 前台签发令牌，验证 API：

  ```bash
  curl -s http://mysite.test/v1/chat/completions \
    -H "Authorization: Bearer <令牌>" -H "Content-Type: application/json" \
    -d '{"model":"<模型>","messages":[{"role":"user","content":"你好"}]}'
  ```

- [ ] 在线支付默认关闭（只有兑换码）；要开支付见 [payment-provider.md](payment-provider.md)

## 常见坑速查（详见 [deployment.md](deployment.md) §8）

| 现象 | 排查 |
|---|---|
| 部署第一步报 `port 443 already allocated` | 改 `HTTPS_PORT`（`none` 档也发布 443） |
| 进不去后台 | Host 不是 `admin.<BASE_DOMAIN>`（加 hosts 或用真域名） |
| 登录后一刷新掉线 | 用了多子域却没设 `COOKIE_DOMAIN=.<域名>` |
| 上传图片 413 | 调大 `MAX_UPLOAD_SIZE` |
| 图生图 524 / 超时 | `NGINX_PROXY_READ_TIMEOUT` ≥ `TASK_SYNC_WAIT_SECONDS + 20`（默认 320 已够） |
| “无可用渠道” | 渠道没启用 / 模型没勾 / SQL 直插渠道漏同步 `abilities` 表 |

## 上生产（域名 + HTTPS）

验证通过后要正式上线，把 `.env` 改成真域名并切换 HTTPS 模式即可，无需重建镜像思路之外的改动：

- `SITE_URL` / `BASE_DOMAIN` / `COOKIE_DOMAIN=.<域名>` / `CORS_ALLOWED_ORIGINS` 换成真域名
- `SSL_MODE`：
  - `letsencrypt` —— 服务器直连公网，容器内 certbot 自动签发（首次签发命令见 [deployment.md](deployment.md) §4）
  - `external` —— 套在 Cloudflare/CDN 后面，由 CDN 终结 TLS，源站只跑 HTTP
- DNS：主域名 A 记录 + `admin` 子域 A 记录都指向服务器

从既有部署迁移数据、CDN 与灰云直连等更复杂的场景，见 [deployment.md](deployment.md) 与 `docs/production-migration-runbook.md`。
