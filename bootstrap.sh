#!/usr/bin/env bash
# 一键起站（IP / 纯 HTTP 试跑）。用法：在仓库目录里执行
#   sudo bash bootstrap.sh
# 它会：装 Docker（若缺）→ 探测公网 IP → 用 <IP>.nip.io 免配 DNS
#       → 自动生成随机 MySQL 密码 / 会话密钥写进 .env → 构建并起站。
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")"
[ "$(id -u)" = "0" ] || err "请用 sudo 运行：sudo bash bootstrap.sh"

# 1) 装 Docker（若缺）
if ! command -v docker >/dev/null 2>&1; then
  log "安装 Docker ..."
  apt-get update -y >/dev/null && apt-get install -y curl ca-certificates >/dev/null
  curl -fsSL https://get.docker.com | sh
else
  log "Docker 已安装"
fi
docker compose version >/dev/null 2>&1 || err "缺少 docker compose 插件，请检查 Docker 安装"

# 2) 探测公网 IP，用 nip.io 免配 DNS（<IP>.nip.io 与 admin.<IP>.nip.io 都解析到本机）
IP=$(curl -fsS4 --max-time 8 https://api.ipify.org 2>/dev/null \
     || curl -fsS4 --max-time 8 https://ifconfig.me 2>/dev/null \
     || hostname -I | awk '{print $1}')
[ -n "$IP" ] || err "拿不到公网 IP，请手动编辑 .env"
HOST="${IP}.nip.io"
log "公网 IP=$IP，站点域名用 $HOST（无需改 hosts / 配 DNS）"

# 3) 生成 .env（已存在则不覆盖，尊重你手工改过的配置）
if [ -f .env ]; then
  warn ".env 已存在，沿用现有配置（不覆盖）"
else
  cp .env.example .env
  MYSQL_PW=$(openssl rand -hex 16 2>/dev/null || tr -dc 'a-f0-9' </dev/urandom | head -c 32)
  SESSION=$(openssl rand -base64 32 2>/dev/null || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 44)
  sed -i "s|^MYSQL_PASSWORD=.*|MYSQL_PASSWORD=${MYSQL_PW}|"                       .env
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION}|"                        .env
  sed -i "s|^SITE_URL=.*|SITE_URL=http://${HOST}|"                               .env
  sed -i "s|^BASE_DOMAIN=.*|BASE_DOMAIN=${HOST}|"                                .env
  sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=http://${HOST},http://admin.${HOST}|" .env
  sed -i "s|^SSL_MODE=.*|SSL_MODE=none|"                                         .env
  sed -i "s|^HTTP_PORT=.*|HTTP_PORT=80|"                                         .env
  log ".env 已生成（随机 MySQL 密码 / 会话密钥；域名 $HOST）"
fi

# 4) 放行 80（若装了 ufw）
if command -v ufw >/dev/null 2>&1; then ufw allow 80/tcp >/dev/null 2>&1 && log "ufw 已放行 80/tcp" || true; fi

# 5) 复用 deploy.sh 构建 + 起站 + 健康检查
log "开始构建并起站（首次含 Go/前端构建，约几分钟）..."
bash deploy.sh

echo ""
warn "别忘了：到云控制台【安全组】放行入站 80 端口，否则外网访问不到。"
warn "首登管理员 root / 123456，登录后请立刻改密码。"
