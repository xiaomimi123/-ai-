#!/bin/bash
# 把 group 为空字符串或 NULL 的用户统一改为 'default'
# One API 用 users.group 匹配渠道，空值会让渠道匹配逻辑走奇怪分支
#
# 用法：
#   bash scripts/normalize-user-group.sh           # 预览 + 执行
#   bash scripts/normalize-user-group.sh --dry-run # 只预览不执行

set -u
MYSQL="docker exec -i one-api-mysql mysql -uroot -pQS75P98SvYaYIy4zkBhmHA== oneapi --default-character-set=utf8mb4"

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'

echo -e "${YELLOW}=== 检查 group 空值用户 ===${NC}"
$MYSQL <<'SQL'
SELECT id, username, `group` AS cur_group, role, status
FROM users
WHERE `group` = '' OR `group` IS NULL
ORDER BY id;
SQL

COUNT=$($MYSQL -sN -e "SELECT COUNT(*) FROM users WHERE \`group\` = '' OR \`group\` IS NULL;")
echo ""
echo "待修复用户数：$COUNT"

if [ "$COUNT" = "0" ]; then
  echo -e "${GREEN}✓ 无需修复，所有用户都有有效 group${NC}"
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo -e "${YELLOW}--dry-run 模式，不执行。要应用修复请去掉 --dry-run 重跑。${NC}"
  exit 0
fi

echo ""
read -p "确认把上述用户的 group 设为 'default'？(y/N) " yn
if [ "$yn" != "y" ] && [ "$yn" != "Y" ]; then
  echo "已取消"
  exit 0
fi

$MYSQL -e "UPDATE users SET \`group\` = 'default' WHERE \`group\` = '' OR \`group\` IS NULL;"

echo ""
echo -e "${GREEN}=== 修复完成 ===${NC}"
$MYSQL <<'SQL'
SELECT id, username, `group`, role, status FROM users ORDER BY id;
SQL

# 提示清 Redis 缓存（如果启用了）
docker exec one-api-redis redis-cli FLUSHALL > /dev/null 2>&1 && echo "Redis 缓存已清" || echo "Redis 未启用，跳过"
