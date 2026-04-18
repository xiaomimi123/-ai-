#!/bin/bash
# 灵镜 AI · MySQL 自动备份脚本
# 使用：
#   1) 手动跑：./scripts/backup-mysql.sh
#   2) cron：crontab -e 加一行  →  0 3 * * * /root/lingjing-ai/scripts/backup-mysql.sh >> /var/log/lj-backup.log 2>&1
#   （每天凌晨 3 点执行）
#
# 保留策略：最近 14 份备份（每天一份 = 2 周历史）
# 备份位置：/root/lingjing-backups/
# 上云：脚本结尾留了 OSS 上传的 TODO 注释，建议至少把最新一份 rsync 到第二台机器

set -e

# ===== 配置 =====
BACKUP_DIR="/root/lingjing-backups"
COMPOSE_DIR="/root/lingjing-ai/one-api"
MYSQL_CONTAINER="one-api-mysql"
DB_NAME="oneapi"
KEEP_COUNT=14   # 保留最近 N 份

# ===== 准备 =====
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTFILE="$BACKUP_DIR/oneapi-$TIMESTAMP.sql.gz"

# 从 .env 读取密码（避免在脚本明文）
if [ ! -f "$COMPOSE_DIR/.env" ]; then
  echo "[✗] 找不到 $COMPOSE_DIR/.env"
  exit 1
fi
MYSQL_PWD=$(grep -E '^MYSQL_PASSWORD=' "$COMPOSE_DIR/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$MYSQL_PWD" ]; then
  echo "[✗] .env 里 MYSQL_PASSWORD 为空"
  exit 1
fi

# ===== 备份 =====
echo "[$(date '+%F %T')] 开始备份 $DB_NAME → $OUTFILE"
docker exec "$MYSQL_CONTAINER" mysqldump \
  -uroot -p"$MYSQL_PWD" \
  --single-transaction \
  --quick \
  --lock-tables=false \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip -9 > "$OUTFILE"

SIZE=$(du -h "$OUTFILE" | awk '{print $1}')
echo "[$(date '+%F %T')] 完成 $OUTFILE ($SIZE)"

# ===== 清理旧备份 =====
cd "$BACKUP_DIR"
ls -1t oneapi-*.sql.gz 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs -r rm -f
REMAINING=$(ls -1 oneapi-*.sql.gz 2>/dev/null | wc -l)
echo "[$(date '+%F %T')] 当前保留 $REMAINING 份备份（上限 $KEEP_COUNT）"

# ===== TODO: 异地上云 =====
# 强烈建议取消注释一种方案做异地备份，本机损毁时数据仍可恢复：
#
# 方案 A - 阿里云 OSS（需先 apt install -y ossutil 并 ossutil config）：
# ossutil cp "$OUTFILE" oss://你的bucket/lingjing-backups/ --update
#
# 方案 B - 另一台服务器（假设 ssh key 已配好）：
# rsync -avz "$OUTFILE" backup@your-backup-host:/backups/lingjing/
#
# 方案 C - 阿里云盘 webhook 上传、B2 / S3 / MinIO 任选

echo "[$(date '+%F %T')] 备份完成 ✓"
