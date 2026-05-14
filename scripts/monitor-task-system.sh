#!/bin/bash
# Runs every 5 minutes via crontab:
#   */5 * * * * /root/lingjing-ai/scripts/monitor-task-system.sh
#
# Replace WEBHOOK_URL below with your real alerting webhook.

set -u  # do NOT set -e — we want errors to be logged, not fail silently

DEPLOY_DIR="/root/lingjing-ai"
ENV_FILE="$DEPLOY_DIR/one-api/.env"

# === CONFIG: replace with your webhook ===
WEBHOOK_URL="${TASK_ALERT_WEBHOOK:-}"

# Threshold tuning
REFUND_RETRY_THRESHOLD=10
STUCK_THRESHOLD=20
STUCK_AGE_SECONDS=300

# === Helpers ===
alert() {
  local msg="$1"
  echo "[ALERT $(date '+%Y-%m-%d %H:%M:%S')] $msg" >&2
  if [[ -n "$WEBHOOK_URL" ]]; then
    curl -s -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"灵镜异步任务告警: $msg\"}" >/dev/null 2>&1 || true
  fi
}

# === Check 1: refund / retry spike in last 5min ===
SPIKE=$(docker logs --since 5m one-api 2>&1 \
  | grep -cE "task refund|fetch_max_retries" || true)

if [[ "${SPIKE:-0}" -gt $REFUND_RETRY_THRESHOLD ]]; then
  alert "5 分钟内 ${SPIKE} 条退款/重试失败 (阈值 ${REFUND_RETRY_THRESHOLD})"
fi

# === Check 2: stuck IN_PROGRESS tasks ===
if [[ -f "$ENV_FILE" ]]; then
  MYSQL_PASS=$(grep '^MYSQL_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
  if [[ -n "$MYSQL_PASS" ]]; then
    STUCK=$(docker exec one-api-mysql mysql -uroot -p"$MYSQL_PASS" oneapi -sN -e "
      SELECT COUNT(*) FROM tasks
      WHERE status = 'IN_PROGRESS'
        AND submit_time < UNIX_TIMESTAMP() - $STUCK_AGE_SECONDS;
    " 2>/dev/null || echo 0)

    if [[ "${STUCK:-0}" -gt $STUCK_THRESHOLD ]]; then
      alert "${STUCK} 个任务 IN_PROGRESS 超过 ${STUCK_AGE_SECONDS} 秒未完成 (阈值 ${STUCK_THRESHOLD})"
    fi
  fi
fi

exit 0
