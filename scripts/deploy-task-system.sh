#!/bin/bash
# deploy-task-system.sh
# 异步任务系统（task worker）分阶段部署脚本
#
# 设计原则：
#   - 全程可中断（set -euo pipefail，任一步骤失败立即停）
#   - 自动备份（镜像 / 任务表 / git HEAD）
#   - phase1 只拉取代码和构建，feature flag 保持 off，零生产影响
#   - phase2 打开 ENABLE_TASK_SYSTEM，worker 启动路由注册
#   - phase3 提示手工在 admin 后台建异步渠道
#   - 支持回滚到上一个镜像版本
#
# 用法：
#   chmod +x scripts/deploy-task-system.sh
#   ./scripts/deploy-task-system.sh phase1    # 部署代码（flag off）
#   ./scripts/deploy-task-system.sh phase2    # 打开 flag + 启动 worker
#   ./scripts/deploy-task-system.sh phase3    # 打印渠道创建清单
#   ./scripts/deploy-task-system.sh rollback  # 回滚

set -euo pipefail

# === 配置 ===
DEPLOY_DIR="/root/lingjing-ai"
BACKUP_DIR="/root/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M)"
NEW_TAG="v${TIMESTAMP}-task"
ROLLBACK_TAG="rollback-task-${TIMESTAMP}"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
err()    { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info()   { echo -e "${BLUE}[i]${NC} $1"; }
banner() { echo ""; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

confirm() {
    local prompt="$1"
    echo ""
    read -r -p "$(echo -e "${YELLOW}>>> ${prompt} [输入 yes 继续 / 其他取消]: ${NC}")" REPLY
    [[ "$REPLY" == "yes" ]] || err "已取消"
}

# 必须在服务器上跑（DEPLOY_DIR 存在性检查）
[[ -d "$DEPLOY_DIR" ]] || err "未发现 $DEPLOY_DIR，本脚本只能在服务器上跑"
[[ -f "$DEPLOY_DIR/one-api/.env" ]] || err "未发现 $DEPLOY_DIR/one-api/.env"

# 从 .env 拿 MySQL 密码（不在脚本里硬编码）
MYSQL_PASS="$(grep '^MYSQL_PASSWORD=' "$DEPLOY_DIR/one-api/.env" | cut -d= -f2-)"
[[ -n "$MYSQL_PASS" ]] || err "无法从 .env 读取 MYSQL_PASSWORD"

mkdir -p "$BACKUP_DIR"

case "${1:-}" in
  phase1)
    banner "Phase 1 / 4: 部署代码（feature flag 保持 off）"

    # 0.1 给当前生产镜像打 rollback tag
    if docker image inspect lingjing-api:latest >/dev/null 2>&1; then
      docker tag lingjing-api:latest "lingjing-api:${ROLLBACK_TAG}"
      log "镜像备份: lingjing-api:${ROLLBACK_TAG}"
    else
      warn "未发现 lingjing-api:latest（首次部署？），跳过镜像备份"
    fi

    # 0.2 备份任务相关表（tasks + logs 中与任务相关的记录）
    BACKUP_SQL="${BACKUP_DIR}/db-task-backup-${TIMESTAMP}.sql"
    if docker exec one-api-mysql mysql -uroot -p"$MYSQL_PASS" oneapi -e "SHOW TABLES LIKE 'tasks';" 2>/dev/null | grep -q tasks; then
      docker exec one-api-mysql mysqldump \
        -uroot -p"$MYSQL_PASS" \
        oneapi tasks logs > "$BACKUP_SQL" 2>/dev/null || true
      log "DB 备份:   ${BACKUP_SQL} ($(wc -l < "$BACKUP_SQL") 行)"
    else
      warn "tasks 表不存在（首次部署？），跳过 DB 备份"
      touch "$BACKUP_SQL"
    fi

    # 0.3 记录当前 git HEAD
    GIT_HEAD_FILE="${BACKUP_DIR}/git-head-task-${TIMESTAMP}.txt"
    cd "$DEPLOY_DIR"
    git rev-parse HEAD > "$GIT_HEAD_FILE"
    log "Git HEAD:  $(cat "$GIT_HEAD_FILE")"

    # 0.4 拉取最新代码
    info "拉取最新代码..."
    git fetch origin
    LOCAL_BEFORE="$(git rev-parse HEAD)"
    git pull origin main || err "git pull 失败"
    LOCAL_AFTER="$(git rev-parse HEAD)"

    if [[ "$LOCAL_BEFORE" == "$LOCAL_AFTER" ]]; then
      warn "代码无更新（HEAD 未变化）"
      confirm "确认即使无代码更新也继续 build 吗？"
    else
      log "代码已更新: ${LOCAL_BEFORE:0:8} → ${LOCAL_AFTER:0:8}"
      echo "    本次提交:"
      git log --oneline "${LOCAL_BEFORE}..${LOCAL_AFTER}" | sed 's/^/      /'
    fi

    # 0.5 构建新镜像
    info "开始 docker build（首次约 3-5 分钟，有缓存约 30 秒）..."
    docker build -t "lingjing-api:${NEW_TAG}" "${DEPLOY_DIR}/backend/" || err "镜像构建失败"
    log "新镜像已构建: lingjing-api:${NEW_TAG}"
    docker images lingjing-api --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" | head -5

    # 0.6 切镜像 + 重启（此时 ENABLE_TASK_SYSTEM 仍为 off，行为不变）
    confirm "切换 latest 镜像并重启 backend（5-15 秒生产抖动）？"
    docker tag "lingjing-api:${NEW_TAG}" lingjing-api:latest
    cd "${DEPLOY_DIR}/one-api"
    docker compose up -d --force-recreate one-api || err "容器重启失败 — 立即手动回滚！"

    # 0.7 等待健康检查通过
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
      warn "健康检查超时！容器日志："
      docker logs one-api --tail 30
      err "新版本异常，立即执行回滚命令："
      echo "  docker tag lingjing-api:${ROLLBACK_TAG} lingjing-api:latest && \\"
      echo "    cd ${DEPLOY_DIR}/one-api && docker compose up -d --force-recreate one-api"
    }

    log "新版本已上线，ENABLE_TASK_SYSTEM 仍为 off（行为与旧版本一致）"
    echo ""
    log "Phase 1 完成！"
    echo ""
    info "下一步（观察 1-2 小时后）: ./scripts/deploy-task-system.sh phase2"
    ;;

  phase2)
    banner "Phase 2 / 4: 打开 ENABLE_TASK_SYSTEM（启动 worker）"

    ENV_FILE="$DEPLOY_DIR/one-api/.env"

    # 检查当前状态
    CURRENT_VALUE="$(grep '^ENABLE_TASK_SYSTEM=' "$ENV_FILE" 2>/dev/null || echo 'ENABLE_TASK_SYSTEM=false')"
    info "当前设置: ${CURRENT_VALUE}"

    if grep -q '^ENABLE_TASK_SYSTEM=true' "$ENV_FILE"; then
      warn "ENABLE_TASK_SYSTEM 已为 true，跳过修改"
    else
      # 如果行存在（false），替换；如果不存在，追加
      if grep -q '^ENABLE_TASK_SYSTEM=' "$ENV_FILE"; then
        sed -i 's/^ENABLE_TASK_SYSTEM=.*/ENABLE_TASK_SYSTEM=true/' "$ENV_FILE"
      else
        echo "ENABLE_TASK_SYSTEM=true" >> "$ENV_FILE"
      fi
      log "ENABLE_TASK_SYSTEM=true 已写入 $ENV_FILE"
    fi

    confirm "重启 backend 以加载 flag 并启动 task worker？"

    cd "${DEPLOY_DIR}/one-api"
    docker compose up -d --force-recreate one-api || err "容器重启失败"

    # 等待日志中出现 "task worker started" 标志
    sleep 3
    if docker logs --since 30s one-api 2>&1 | grep -qi "task worker\|worker.*start"; then
      log "日志中确认 worker 启动"
    else
      warn "未在日志中找到 worker 启动标志 — 请手动检查: docker logs one-api | grep -i worker"
    fi

    log "Phase 2 完成！Task worker 已启动"
    echo ""
    info "下一步: ./scripts/deploy-task-system.sh phase3"
    ;;

  phase3)
    banner "Phase 3 / 4: 手工创建异步任务渠道（admin 后台）"

    cat <<'EOF'

访问 admin 后台 → 渠道管理 → 新建渠道，按以下参数分别创建：

【ApiMart 异步渠道（类型 57）】
  名称:         ApiMart - 异步图像
  类型:         57 (ApiMart)
  models:       gpt-image-2
  base_url:     https://api.apimart.ai （不要带 /v1，会自动拼接）
  key:          <ApiMart API Key>
  group:        admin       ← 先用内部分组测试，通过后改成 default
  status:       启用

【Jimeng 异步渠道（类型 58）】
  名称:         Jimeng - 即梦
  类型:         58 (Jimeng)
  models:       jimeng-v3.0
  key:          复合 JSON，例:
                {
                  "access_key_id":"AK...",
                  "secret_access_key":"SK...",
                  "region":"cn-north-1",
                  "service":"cv"
                }
  group:        admin
  status:       启用

创建后，用 admin token 自测：

  # 发起异步图像生成
  curl -X POST https://api.aitoken.homes/v1/images/generations \
    -H "Authorization: Bearer <admin_token>" \
    -H "Content-Type: application/json" \
    -d '{
      "model":"gpt-image-2",
      "prompt":"a corgi running in a park",
      "n":1,
      "size":"1024x1024"
    }'

  # 返回结果：{"code":0,"data":{"task_id":"..."},...}
  # 拿到 task_id 后轮询查询：

  curl https://api.aitoken.homes/v1/tasks/<task_id> \
    -H "Authorization: Bearer <admin_token>"

  # 当 data.status 为 "completed" 时，data.result 包含 images[] 数组

通过测试后，把两个渠道的 group 改为 default，对所有用户开放。

EOF
    ;;

  rollback)
    banner "回滚: 关闭 ENABLE_TASK_SYSTEM + 切回旧镜像"

    # 找最新的 rollback-task-* tag
    LAST_TAG=$(docker images lingjing-api --format "{{.Tag}}" 2>/dev/null | grep "rollback-task-" | sort -r | head -1)
    [[ -z "$LAST_TAG" ]] && err "未找到 rollback-task-* tag — 是否之前没跑 phase1？"

    info "找到最新 rollback tag: ${LAST_TAG}"
    confirm "确认回滚到 lingjing-api:${LAST_TAG} 并关闭 ENABLE_TASK_SYSTEM？"

    # 1. 回滚镜像
    docker tag "lingjing-api:${LAST_TAG}" lingjing-api:latest
    log "镜像已回滚: lingjing-api:${LAST_TAG} → :latest"

    # 2. 关闭 flag
    ENV_FILE="$DEPLOY_DIR/one-api/.env"
    if grep -q '^ENABLE_TASK_SYSTEM=' "$ENV_FILE"; then
      sed -i 's/^ENABLE_TASK_SYSTEM=.*/ENABLE_TASK_SYSTEM=false/' "$ENV_FILE"
    fi
    log "ENABLE_TASK_SYSTEM=false 已写入 $ENV_FILE"

    # 3. 重启
    cd "${DEPLOY_DIR}/one-api"
    docker compose up -d --force-recreate one-api || err "容器重启失败"
    log "容器已重启"

    # 4. 等待健康检查
    info "等待回滚版本就绪 (最多 30 秒)..."
    READY=0
    for i in {1..30}; do
      if curl -sf --max-time 3 "http://localhost:3000/api/status" >/dev/null 2>&1; then
        READY=1
        log "健康检查通过（用时 ${i} 秒）"
        break
      fi
      sleep 1
    done

    [[ $READY -eq 1 ]] || err "回滚版本健康检查失败"

    log "回滚完成！系统已回到 ${LAST_TAG}"
    ;;

  *)
    cat <<'EOF'
用法: ./scripts/deploy-task-system.sh [COMMAND]

命令:
  phase1    部署代码 + 构建镜像 + 启动（feature flag 保持 off，生产无影响）
  phase2    打开 ENABLE_TASK_SYSTEM=true（worker 启动 + 路由注册）
  phase3    打印手工创建异步渠道的清单
  rollback  回滚：关闭 flag + 切回旧镜像

推荐流程:

  1. ./scripts/deploy-task-system.sh phase1   ← 拉代码、构建、测试，flag off
     （观察日志 1-2 小时，确保无异常）

  2. ./scripts/deploy-task-system.sh phase2   ← 打开 flag，启动 worker
     （观察 5-10 分钟，看 worker 运行状态）

  3. ./scripts/deploy-task-system.sh phase3   ← 提示手工操作
     按清单在 admin 后台创建异步渠道 2 个（ApiMart / Jimeng）

  4. 自测：用 admin token 发起异步请求，轮询查询结果

  5. 通过后，在 admin 后台把渠道 group 改为 default 对外开放

应急回滚（出问题立即跑）:

  ./scripts/deploy-task-system.sh rollback

EOF
    exit 0
    ;;
esac
