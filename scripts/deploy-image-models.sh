#!/bin/bash
# deploy-image-models.sh
# 图像模型上架专用安全部署脚本
#
# 设计原则：
#   - 全程可中断（set -euo pipefail，任一步骤失败立即停）
#   - 自动备份（镜像 / DB / git HEAD）
#   - 烟雾测试通过才提示切流量（端口 3001 隔离测试）
#   - 切流量和 DB 操作需要显式 yes 确认
#   - Ctrl+C 会自动清理测试容器
#
# 用法：
#   chmod +x scripts/deploy-image-models.sh
#   ./scripts/deploy-image-models.sh
#
# 中止：任何阶段 Ctrl+C，或 confirm 时输入 no

set -euo pipefail

# === 配置 ===
DEPLOY_DIR="/root/lingjing-ai"
BACKUP_DIR="/root/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M)"
NEW_TAG="v${TIMESTAMP}-img"
ROLLBACK_TAG="rollback-${TIMESTAMP}"
SMOKE_PORT=3001
SMOKE_NAME="lingjing-smoke"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
banner() { echo ""; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

confirm() {
    local prompt="$1"
    echo ""
    read -r -p "$(echo -e "${YELLOW}>>> ${prompt} [输入 yes 继续 / 其他取消]: ${NC}")" REPLY
    [[ "$REPLY" == "yes" ]] || err "已取消"
}

# 异常退出时清理测试容器
cleanup() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${SMOKE_NAME}$"; then
        docker rm -f "$SMOKE_NAME" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

# 必须在服务器上跑（DEPLOY_DIR 存在性检查）
[[ -d "$DEPLOY_DIR" ]] || err "未发现 $DEPLOY_DIR，本脚本只能在服务器上跑"
[[ -f "$DEPLOY_DIR/one-api/.env" ]] || err "未发现 $DEPLOY_DIR/one-api/.env"

# 从 .env 拿 MySQL 密码（不在脚本里硬编码）
MYSQL_PASS="$(grep '^MYSQL_PASSWORD=' "$DEPLOY_DIR/one-api/.env" | cut -d= -f2-)"
[[ -n "$MYSQL_PASS" ]] || err "无法从 .env 读取 MYSQL_PASSWORD"

mkdir -p "$BACKUP_DIR"

banner "图像模型上架 - 安全 SOP"
info "新版本 tag: lingjing-api:${NEW_TAG}"
info "回滚 tag:   lingjing-api:${ROLLBACK_TAG}"
info "备份目录:   ${BACKUP_DIR}"
echo ""

# ════════════════════════════════════════
# Phase 0: 备份
# ════════════════════════════════════════
banner "Phase 0 / 5: 备份当前生产状态"

# 0.1 给当前生产镜像打 rollback tag
if docker image inspect lingjing-api:latest >/dev/null 2>&1; then
    docker tag lingjing-api:latest "lingjing-api:${ROLLBACK_TAG}"
    log "镜像备份: lingjing-api:${ROLLBACK_TAG}"
else
    warn "未发现 lingjing-api:latest（首次部署？），跳过镜像备份"
fi

# 0.2 备份 model_prices 表
BACKUP_SQL="${BACKUP_DIR}/model_prices-${TIMESTAMP}.sql"
docker exec one-api-mysql mysqldump \
    -uroot -p"$MYSQL_PASS" \
    oneapi model_prices > "$BACKUP_SQL" 2>/dev/null \
    || err "model_prices 备份失败"
log "DB 备份:   ${BACKUP_SQL} ($(wc -l < "$BACKUP_SQL") 行)"

# 0.3 记录当前 git HEAD
GIT_HEAD_FILE="${BACKUP_DIR}/git-head-${TIMESTAMP}.txt"
git -C "$DEPLOY_DIR" rev-parse HEAD > "$GIT_HEAD_FILE"
log "Git HEAD:  $(cat "$GIT_HEAD_FILE") → ${GIT_HEAD_FILE}"

# ════════════════════════════════════════
# Phase 1: 拉取最新代码
# ════════════════════════════════════════
banner "Phase 1 / 5: 拉取最新代码"

cd "$DEPLOY_DIR"
git fetch origin
LOCAL_BEFORE="$(git rev-parse HEAD)"
git pull origin main || err "git pull 失败"
LOCAL_AFTER="$(git rev-parse HEAD)"

if [[ "$LOCAL_BEFORE" == "$LOCAL_AFTER" ]]; then
    warn "代码无更新（HEAD 未变化）— 是否走错时间点？"
    confirm "确认即使无代码更新也继续 build 吗？"
else
    log "代码已更新: ${LOCAL_BEFORE:0:8} → ${LOCAL_AFTER:0:8}"
    echo "    本次提交:"
    git log --oneline "${LOCAL_BEFORE}..${LOCAL_AFTER}" | sed 's/^/      /'
fi

# ════════════════════════════════════════
# Phase 2: 构建新镜像
# ════════════════════════════════════════
banner "Phase 2 / 5: 构建新镜像（不影响生产）"

info "开始 docker build（首次约 3-5 分钟，有缓存约 30 秒）..."
docker build -t "lingjing-api:${NEW_TAG}" "${DEPLOY_DIR}/backend/" || err "镜像构建失败"
log "新镜像已构建: lingjing-api:${NEW_TAG}"
docker images lingjing-api --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" | head -5

# ════════════════════════════════════════
# Phase 3: 烟雾测试
# ════════════════════════════════════════
banner "Phase 3 / 5: 烟雾测试（端口 ${SMOKE_PORT}，不影响生产 3000）"

# 清掉可能残留的测试容器
docker rm -f "$SMOKE_NAME" >/dev/null 2>&1 || true

# 起测试容器，连到同一网络共享 mysql/redis
docker run -d --name "$SMOKE_NAME" \
    -p "${SMOKE_PORT}:3000" \
    --env-file "${DEPLOY_DIR}/one-api/.env" \
    --network one-api_api-net \
    "lingjing-api:${NEW_TAG}" >/dev/null \
    || err "烟雾测试容器启动失败"
log "测试容器已启动: ${SMOKE_NAME} → :${SMOKE_PORT}"

info "等待容器就绪 (最多 30 秒)..."
READY=0
for i in {1..30}; do
    if curl -sf --max-time 3 "http://localhost:${SMOKE_PORT}/api/status" >/dev/null 2>&1; then
        READY=1
        log "健康检查通过（用时 ${i} 秒）"
        break
    fi
    sleep 1
done

[[ $READY -eq 1 ]] || {
    warn "健康检查超时，启动日志："
    docker logs "$SMOKE_NAME" --tail 50
    err "烟雾测试失败"
}

# 检查启动日志有没有 panic / fatal
if docker logs "$SMOKE_NAME" 2>&1 | grep -iE "^(.*panic:|.*FATAL )" >/dev/null; then
    docker logs "$SMOKE_NAME" --tail 50
    err "启动日志出现 panic / fatal"
fi
log "启动日志无 panic / fatal"

# 验证图像路由仍存在（401 是因为没带 token，但路由存在才会到鉴权层）
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
    "http://localhost:${SMOKE_PORT}/v1/images/generations" \
    -X POST -H "Content-Type: application/json" -d '{}' || echo 000)"
if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "400" ]]; then
    log "图像路由存活（HTTP ${HTTP_CODE} = 路由通到鉴权层）"
else
    warn "图像路由返回异常 HTTP ${HTTP_CODE}（预期 401/400）"
fi

# 停掉测试容器（防止占用资源 & 端口冲突）
docker stop "$SMOKE_NAME" >/dev/null
docker rm "$SMOKE_NAME" >/dev/null
log "烟雾测试完毕，测试容器已销毁"

# ════════════════════════════════════════
# Phase 4: 切流量
# ════════════════════════════════════════
banner "Phase 4 / 5: 切换生产流量（5-15 秒抖动）"

warn "即将："
warn "  1. docker tag lingjing-api:${NEW_TAG} → lingjing-api:latest"
warn "  2. docker compose up -d one-api  (容器 recreate)"
warn "  3. 生产 API 会有 5-15 秒不可用"
echo ""
warn "如出问题，一行回滚："
echo "  docker tag lingjing-api:${ROLLBACK_TAG} lingjing-api:latest && \\"
echo "    cd ${DEPLOY_DIR}/one-api && docker compose up -d --force-recreate one-api"

confirm "确认切换吗？"

docker tag "lingjing-api:${NEW_TAG}" lingjing-api:latest
cd "${DEPLOY_DIR}/one-api"
docker compose up -d one-api || err "容器重启失败 — 立即手动回滚！"

info "等待新容器就绪 (最多 30 秒)..."
READY=0
for i in {1..30}; do
    if curl -sf --max-time 3 "http://localhost:3000/api/status" >/dev/null 2>&1; then
        READY=1
        log "生产健康检查通过（用时 ${i} 秒）"
        break
    fi
    sleep 1
done

[[ $READY -eq 1 ]] || {
    warn "生产健康检查超时！容器日志："
    docker logs one-api --tail 30
    err "新版本异常，立即执行回滚命令（见上面 warn）"
}

log "生产已切到新版本"
log "当前镜像 SHA: $(docker inspect lingjing-api:latest --format='{{.Id}}' | cut -c1-19)"

# ════════════════════════════════════════
# Phase 5: 注入 model_prices
# ════════════════════════════════════════
banner "Phase 5 / 5: 注入 model_prices 数据"

info "将插入/更新 4 条记录:"
echo "    - gpt-image-1            (OpenAI, \$0.084/张, visible)"
echo "    - dall-e-3               (OpenAI, \$0.04/张, visible)"
echo "    - gemini-2.5-flash-image (Google, \$0.078/张, visible)"
echo "    - imagen-3.0-generate-001 (Google, \$0.06/张, INVISIBLE - 待 adaptor 实现)"
echo ""
warn "操作是 ON DUPLICATE KEY UPDATE，重复跑安全"

confirm "确认注入吗？"

docker exec -i one-api-mysql mysql -uroot -p"$MYSQL_PASS" oneapi <<'EOF'
INSERT INTO model_prices
  (model_id, name, provider, description, tags, logo, input_price, output_price, context_window, featured, is_visible, sort_order, created_at, updated_at)
VALUES
  ('gpt-image-1',             'GPT Image 1',         'OpenAI', 'OpenAI 最新图像生成模型，文字渲染清晰，支持透明背景，质量旗舰', '画图,海外', 'openai', 0.084, 0, '1024×1024', 1, 1, 20, NOW(), NOW()),
  ('dall-e-3',                'DALL·E 3',            'OpenAI', '经典稳定的图像生成模型，理解力强，prompt 跟随度高',          '画图,海外', 'openai', 0.04,  0, '1024×1024', 0, 1, 21, NOW(), NOW()),
  ('gemini-2.5-flash-image',  'Gemini Nano Banana',  'Google', 'Google 原生多模态图像生成，速度极快，性价比首选',            '画图,海外', 'google', 0.078, 0, '1024×1024', 1, 1, 22, NOW(), NOW()),
  ('imagen-3.0-generate-001', 'Imagen 3',            'Google', 'Google Imagen 3 独立模型（待开发，暂不可用）',                '画图,海外', 'google', 0.06,  0, '1024×1024', 0, 0, 23, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name=VALUES(name), description=VALUES(description), input_price=VALUES(input_price),
  output_price=VALUES(output_price), tags=VALUES(tags), featured=VALUES(featured),
  is_visible=VALUES(is_visible), sort_order=VALUES(sort_order), updated_at=NOW();
EOF

log "model_prices 注入完成"

# 验证
echo ""
info "确认数据已落库："
docker exec one-api-mysql mysql -uroot -p"$MYSQL_PASS" oneapi -e \
    "SELECT model_id, name, input_price, is_visible, sort_order FROM model_prices WHERE model_id IN ('gpt-image-1','dall-e-3','gemini-2.5-flash-image','imagen-3.0-generate-001') ORDER BY sort_order;" 2>/dev/null

# ════════════════════════════════════════
# 完成
# ════════════════════════════════════════
banner "🎉 部署完成"

cat <<SUMMARY

✅ 已完成:
   • 镜像备份: lingjing-api:${ROLLBACK_TAG}
   • DB 备份:  ${BACKUP_SQL}
   • Git HEAD: $(cat "$GIT_HEAD_FILE")
   • 新镜像:   lingjing-api:${NEW_TAG} → :latest
   • DB 注入:  4 条 model_prices 记录

📋 你接下来要在 admin 后台手动做:

   1. 渠道管理 → 新建「OpenAI - 图像生成」
      - type:   OpenAI (1)
      - models: gpt-image-1,dall-e-3
      - group:  admin    ← 先用内部分组测试
      - key:    <OpenAI API Key>

   2. 渠道管理 → 新建「Google Gemini - 图像生成」
      - type:   Gemini (24)
      - models: gemini-2.5-flash-image,nano-banana
      - model_mapping (JSON):
        {"nano-banana":"gemini-2.5-flash-image-preview","gemini-2.5-flash-image":"gemini-2.5-flash-image-preview"}
      - group:  admin
      - key:    <Google AI Studio Key>

   3. 自测 3 个模型（用 admin token 或属于 admin group 的 token）
      curl -X POST https://api.aitoken.homes/v1/images/generations \\
        -H "Authorization: Bearer <token>" \\
        -H "Content-Type: application/json" \\
        -d '{"model":"gpt-image-1","prompt":"a corgi","size":"1024x1024","n":1}'

   4. 测通后把渠道 group 改成 default 开放给所有用户

🚨 应急回滚（贴墙上）:

   # 代码回滚（30 秒）
   docker tag lingjing-api:${ROLLBACK_TAG} lingjing-api:latest
   cd ${DEPLOY_DIR}/one-api && docker compose up -d --force-recreate one-api

   # DB 数据删除
   docker exec -i one-api-mysql mysql -uroot -p\$MYSQL_PASS oneapi <<DELETESQL
   DELETE FROM model_prices WHERE model_id IN
     ('gpt-image-1','dall-e-3','gemini-2.5-flash-image','imagen-3.0-generate-001');
DELETESQL

   # 终极兜底（DB 备份恢复）
   docker exec -i one-api-mysql mysql -uroot -p\$MYSQL_PASS oneapi < ${BACKUP_SQL}

SUMMARY
