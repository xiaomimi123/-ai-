#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

DEPLOY_DIR="/root/lingjing-ai"
FRONTEND_DIST="/var/www/api-platform/frontend"
ADMIN_DIST="/var/www/api-platform/admin"

echo ""
echo "🚀 灵镜AI 一键部署"
echo "================================"

# Step 1: 拉取代码
log "Step 1/6: 拉取最新代码..."
cd $DEPLOY_DIR
git pull origin main || err "拉取失败"

# Step 2: 构建自研后端 Docker 镜像
log "Step 2/6: 构建后端镜像（首次约5分钟）..."
docker build -t lingjing-api:latest $DEPLOY_DIR/backend/ || err "后端构建失败"
log "后端镜像构建完成"

# Step 3: 重启后端服务
log "Step 3/6: 重启后端服务..."
cd $DEPLOY_DIR/one-api
docker compose up -d --remove-orphans || err "后端启动失败"
log "后端已启动"

# Step 4: 构建前台
log "Step 4/6: 构建用户前台..."
docker run --rm -v $DEPLOY_DIR/frontend:/app -w /app node:20-alpine sh -c "npm install --silent 2>/dev/null && npm run build" || err "前台构建失败"
mkdir -p $FRONTEND_DIST && rm -rf $FRONTEND_DIST/* && cp -r $DEPLOY_DIR/frontend/dist/* $FRONTEND_DIST/
log "前台完成"

# Step 5: 构建后台
log "Step 5/6: 构建管理后台..."
docker run --rm -v $DEPLOY_DIR/admin:/app -w /app node:20-alpine sh -c "npm install --silent 2>/dev/null && npm run build" || err "后台构建失败"
mkdir -p $ADMIN_DIST && rm -rf $ADMIN_DIST/* && cp -r $DEPLOY_DIR/admin/dist/* $ADMIN_DIST/
log "后台完成"

# Step 6: 验证
log "Step 6/6: 验证服务..."
sleep 15
echo -n "  后端 API: "; curl -sf --max-time 5 http://localhost:3000/api/status > /dev/null && echo -e "${GREEN}正常${NC}" || echo -e "${RED}异常${NC}"
echo -n "  灵镜扩展: "; curl -sf --max-time 5 http://localhost:3000/api/lingjing/plans > /dev/null && echo -e "${GREEN}正常${NC}" || echo -e "${RED}异常${NC}"
echo -n "  Nginx:    "; curl -sf --max-time 5 http://localhost > /dev/null && echo -e "${GREEN}正常${NC}" || echo -e "${RED}异常${NC}"

echo ""
echo -e "${GREEN}🎉 部署完成！${NC}"
echo "  前台: https://aitoken.homes"
echo "  后台: https://admin.aitoken.homes"
