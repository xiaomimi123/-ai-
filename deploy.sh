#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

DEPLOY_DIR="/root/lingjing-ai"
FRONTEND_DIST="/var/www/api-platform/frontend"
ADMIN_DIST="/var/www/api-platform/admin"

echo ""
echo "🚀 灵镜AI 一键部署"
echo "时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "================================"

# Step 1: 拉取最新代码
log "Step 1/6: 从 GitHub 拉取最新代码..."
cd $DEPLOY_DIR
git pull origin main || err "代码拉取失败"
log "代码已更新"

# Step 2: 构建自研 Go 后端（Docker 编译）
log "Step 2/6: 构建灵镜AI 后端..."
cd $DEPLOY_DIR/one-api
docker compose build --no-cache one-api || err "后端构建失败"
docker compose up -d || err "后端启动失败"
log "后端构建并启动完成"

# Step 3: 用 Docker 构建用户前台
log "Step 3/6: 构建用户前台..."
docker run --rm \
  -v $DEPLOY_DIR/frontend:/app \
  -w /app \
  node:20-alpine \
  sh -c "npm install --silent 2>/dev/null && npm run build" \
  || err "前台构建失败"
mkdir -p $FRONTEND_DIST
rm -rf $FRONTEND_DIST/*
cp -r $DEPLOY_DIR/frontend/dist/* $FRONTEND_DIST/
chown -R nginx:nginx $FRONTEND_DIST 2>/dev/null || true
log "用户前台部署完成"

# Step 4: 用 Docker 构建管理后台
log "Step 4/6: 构建管理后台..."
docker run --rm \
  -v $DEPLOY_DIR/admin:/app \
  -w /app \
  node:20-alpine \
  sh -c "npm install --silent 2>/dev/null && npm run build" \
  || err "后台构建失败"
mkdir -p $ADMIN_DIST
rm -rf $ADMIN_DIST/*
cp -r $DEPLOY_DIR/admin/dist/* $ADMIN_DIST/
chown -R nginx:nginx $ADMIN_DIST 2>/dev/null || true
log "管理后台部署完成"

# Step 5: 重载 Nginx
log "Step 5/6: 重载 Nginx..."
nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
log "Nginx 已重载"

# Step 6: 验证
log "Step 6/6: 验证服务状态..."
sleep 15

echo -n "  后端 API: "
curl -sf --max-time 5 http://localhost:3000/api/status > /dev/null \
  && echo -e "${GREEN}正常${NC}" \
  || echo -e "${RED}异常${NC} → cd one-api && docker compose logs one-api"

echo -n "  灵镜扩展: "
curl -sf --max-time 5 http://localhost:3000/api/lingjing/plans > /dev/null \
  && echo -e "${GREEN}正常${NC}" \
  || echo -e "${RED}异常${NC}"

echo -n "  Nginx:    "
curl -sf --max-time 5 http://localhost > /dev/null \
  && echo -e "${GREEN}正常${NC}" \
  || echo -e "${RED}异常${NC} → nginx -t"

echo ""
echo "================================"
echo -e "${GREEN}🎉 部署完成！${NC}"
echo ""
echo "  用户前台: https://aitoken.homes"
echo "  管理后台: https://admin.aitoken.homes"
echo "  完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================"
