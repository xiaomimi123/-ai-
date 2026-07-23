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

# 不用 source .env——含空格的值（如 SITE_NAME="AI API Platform"）会让
# source 报 command not found。docker compose 会用自己的解析器读 .env，
# deploy.sh 只需要下面两个变量，用 grep 单独取，更稳。
read_env() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed 's/^["'"'"']//;s/["'"'"']$//'; }
HTTP_PORT="$(read_env HTTP_PORT)"
SITE_URL="$(read_env SITE_URL)"

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
