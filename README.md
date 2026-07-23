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

浏览器打开 `http://localhost`（或你配置的域名）。

首次启动、数据库里还没有任何用户时，后端会自动创建内置管理员账号
**`root` / `123456`**，直接用它登录管理后台（`admin.<你的域名>`）——
**登录后请立刻去「个人设置」修改密码**，这是一个所有人都知道密码的账号。

登录后先添加至少一个上游渠道，然后在前台签发令牌即可调用。

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
