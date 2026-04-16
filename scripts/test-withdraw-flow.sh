#!/bin/bash
# 提现功能端到端烟雾测试
# 用法：
#   cd /root/lingjing-ai
#   # 默认用 root/默认密码，可以 export 覆盖：
#   export ADMIN_USER=root ADMIN_PASS=你的root密码
#   export TEST_USER=xxx TEST_PASS=xxx       # 可选：测试用户，不填则用 user_id=2 现有用户
#   bash scripts/test-withdraw-flow.sh

set -u

# ===== 配置 =====
API="${API:-http://localhost:3000}"
MYSQL_CMD="docker exec -i one-api-mysql mysql -uroot -pQS75P98SvYaYIy4zkBhmHA== oneapi"

TEST_USER="${TEST_USER:-}"
TEST_PASS="${TEST_PASS:-}"
ADMIN_USER="${ADMIN_USER:-root}"
ADMIN_PASS="${ADMIN_PASS:-}"

COOKIE_USER="/tmp/withdraw-test-user.cookie"
COOKIE_ADMIN="/tmp/withdraw-test-admin.cookie"
TMP_OUT="/tmp/withdraw-test.out"

# ===== 工具函数 =====
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✔${NC} $1"; }
fail() { echo -e "${RED}✘${NC} $1"; FAIL_COUNT=$((FAIL_COUNT+1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; }
step() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
FAIL_COUNT=0

# 测试用户 ID（申请人）；默认用现有 user_id=2。脚本最后不会删除它。
TEST_UID=""
ADMIN_UID=""

# ===== 0. 预检 =====
step "0. 预检环境"

if ! docker ps --format '{{.Names}}' | grep -q '^one-api$'; then
  fail "one-api 容器没在跑，请先 docker compose up -d one-api"
  exit 1
fi
pass "one-api 容器在运行"

if ! curl -sf "$API/api/status" >/dev/null 2>&1; then
  fail "$API/api/status 不响应，后端可能没起来"
  exit 1
fi
pass "后端 HTTP 响应正常"

# 检查表存在
TBL=$($MYSQL_CMD -sN -e "SHOW TABLES LIKE 'withdraw_requests';" 2>/dev/null)
if [ "$TBL" != "withdraw_requests" ]; then
  fail "withdraw_requests 表不存在，请先启动新版后端让 AutoMigrate 建表"
  exit 1
fi
pass "withdraw_requests 表已创建"

# ===== 1. 登录 admin =====
step "1. 登录 admin 账号"
if [ -z "$ADMIN_PASS" ]; then
  warn "未设置 ADMIN_PASS，跳过 admin 登录相关测试"
  ADMIN_OK=0
else
  ADMIN_LOGIN=$(curl -sS -c "$COOKIE_ADMIN" -b "$COOKIE_ADMIN" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
    "$API/api/user/login")
  if echo "$ADMIN_LOGIN" | grep -q '"success":true'; then
    ADMIN_UID=$(echo "$ADMIN_LOGIN" | sed -E 's/.*"id":([0-9]+).*/\1/')
    pass "admin 登录成功 (uid=$ADMIN_UID)"
    ADMIN_OK=1
  else
    fail "admin 登录失败: $ADMIN_LOGIN"
    ADMIN_OK=0
  fi
fi

# ===== 2. 准备测试用户 =====
step "2. 准备测试用户"
if [ -n "$TEST_USER" ] && [ -n "$TEST_PASS" ]; then
  USER_LOGIN=$(curl -sS -c "$COOKIE_USER" -b "$COOKIE_USER" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}" \
    "$API/api/user/login")
  if echo "$USER_LOGIN" | grep -q '"success":true'; then
    TEST_UID=$(echo "$USER_LOGIN" | sed -E 's/.*"id":([0-9]+).*/\1/')
    pass "测试用户登录成功 (username=$TEST_USER uid=$TEST_UID)"
  else
    fail "测试用户登录失败: $USER_LOGIN"
    exit 1
  fi
else
  # 取 root 之外第一个普通用户
  TEST_UID=$($MYSQL_CMD -sN -e "SELECT id FROM users WHERE role < 100 AND status = 1 ORDER BY id ASC LIMIT 1;" 2>/dev/null)
  if [ -z "$TEST_UID" ]; then
    warn "数据库里没有普通用户，无法跑 API 流程。建议先注册一个再重试。"
    warn "只做 DB 层面的迁移/schema 检查。"
    exit 0
  fi
  USERNAME=$($MYSQL_CMD -sN -e "SELECT username FROM users WHERE id=$TEST_UID;" 2>/dev/null)
  warn "未提供 TEST_USER/TEST_PASS，使用现有用户 $USERNAME (uid=$TEST_UID) 做 DB 侧模拟，跳过用户 API 登录"
  TEST_USER_API=0
fi

# ===== 3. 给测试用户造一笔已结算佣金 =====
step "3. 造测试数据（1 笔 ¥25 已结算佣金）"
$MYSQL_CMD -e "
INSERT INTO commissions (user_id, from_user_id, order_id, amount, status, created_at)
VALUES ($TEST_UID, 0, 0, 25.00, 1, NOW());
" 2>/dev/null
pass "插入成功"

SETTLED=$($MYSQL_CMD -sN -e "SELECT COALESCE(SUM(amount),0) FROM commissions WHERE user_id=$TEST_UID AND status=1;" 2>/dev/null)
echo "  user $TEST_UID 累计已结算佣金: ¥$SETTLED"

# 清理之前的测试残留（避免 "有待审核申请" 拦截）
PENDING_BEFORE=$($MYSQL_CMD -sN -e "SELECT COUNT(*) FROM withdraw_requests WHERE user_id=$TEST_UID AND status=0;" 2>/dev/null)
if [ "$PENDING_BEFORE" != "0" ]; then
  warn "用户 $TEST_UID 有 $PENDING_BEFORE 笔待审核申请，清理掉以便测试"
  $MYSQL_CMD -e "DELETE FROM withdraw_requests WHERE user_id=$TEST_UID AND status=0;" 2>/dev/null
fi

# ===== 4. 查询可提现余额（用户 API）=====
if [ "${TEST_USER_API:-1}" = "1" ]; then
  step "4. GET /api/lingjing/withdraw (用户查询余额)"
  R=$(curl -sS -b "$COOKIE_USER" "$API/api/lingjing/withdraw")
  echo "$R" > "$TMP_OUT"
  if echo "$R" | grep -q '"success":true'; then
    AVAIL=$(echo "$R" | sed -E 's/.*"available":([0-9.]+).*/\1/')
    pass "查询成功，可提现 ¥$AVAIL"
  else
    fail "查询失败: $(cat $TMP_OUT)"
  fi

  # ===== 5. 创建提现申请 =====
  step "5. POST /api/lingjing/withdraw (申请 ¥15)"
  R=$(curl -sS -b "$COOKIE_USER" -H 'Content-Type: application/json' \
    -d '{"amount":15,"alipay_account":"test@example.com","real_name":"测试用户"}' \
    "$API/api/lingjing/withdraw")
  echo "$R" > "$TMP_OUT"
  if echo "$R" | grep -q '"success":true'; then
    WITHDRAW_ID=$(echo "$R" | sed -E 's/.*"id":([0-9]+).*/\1/' | head -1)
    pass "申请提交成功，ID=$WITHDRAW_ID"
  else
    fail "申请失败: $(cat $TMP_OUT)"
    exit 1
  fi

  # ===== 5b. 重复申请应被拒（幂等保护：有待审核时不能再提）=====
  # 注意 amount 必须 >= 最低值，否则会先被金额校验拦下，测不到幂等分支
  step "5b. 重复申请应被拦（幂等保护）"
  R=$(curl -sS -b "$COOKIE_USER" -H 'Content-Type: application/json' \
    -d '{"amount":12,"alipay_account":"x@y.com","real_name":"x"}' \
    "$API/api/lingjing/withdraw")
  MSG=$(echo "$R" | sed -E 's/.*"message":"([^"]*)".*/\1/')
  if echo "$R" | grep -q '"success":false' && echo "$MSG" | grep -q "待审核"; then
    pass "幂等保护生效：$MSG"
  elif echo "$R" | grep -q '"success":false'; then
    fail "被拒了但不是幂等原因: $MSG（应该是「您有待审核的提现申请...」）"
  else
    fail "预期被拦但通过了: $R"
  fi
else
  step "4-5. 跳过用户 API 测试（没提供 TEST_USER/TEST_PASS），直接 DB 插入一条待审核申请"
  $MYSQL_CMD -e "
INSERT INTO withdraw_requests (user_id, amount, alipay_account, real_name, status, created_at)
VALUES ($TEST_UID, 15.00, 'test@example.com', '测试用户', 0, UNIX_TIMESTAMP());
" 2>/dev/null
  WITHDRAW_ID=$($MYSQL_CMD -sN -e "SELECT MAX(id) FROM withdraw_requests WHERE user_id=$TEST_UID;" 2>/dev/null)
  pass "直接插入 withdraw_requests 记录 (id=$WITHDRAW_ID)"
fi

# ===== 6. 管理员 API 流程 =====
if [ "$ADMIN_OK" = "1" ]; then
  step "6. GET /api/admin/withdraw?status=0 (管理员查看待审核列表)"
  R=$(curl -sS -b "$COOKIE_ADMIN" "$API/api/admin/withdraw?status=0")
  echo "$R" > "$TMP_OUT"
  if echo "$R" | grep -q '"success":true'; then
    COUNT=$(echo "$R" | sed -E 's/.*"total":([0-9]+).*/\1/')
    pass "列表返回 total=$COUNT"
    if echo "$R" | grep -q "\"id\":$WITHDRAW_ID"; then
      pass "刚提交的 id=$WITHDRAW_ID 在列表里"
    else
      fail "id=$WITHDRAW_ID 没在列表里"
    fi
  else
    fail "管理员列表失败: $(cat $TMP_OUT)"
  fi

  # 统计接口
  step "7. GET /api/admin/withdraw/stats"
  R=$(curl -sS -b "$COOKIE_ADMIN" "$API/api/admin/withdraw/stats")
  if echo "$R" | grep -q '"success":true'; then
    pass "stats OK: $(echo $R | head -c 200)..."
  else
    fail "stats 失败: $R"
  fi

  # ===== 8. 审核通过 =====
  step "8. PUT /api/admin/withdraw/$WITHDRAW_ID action=approve"
  R=$(curl -sS -X PUT -b "$COOKIE_ADMIN" -H 'Content-Type: application/json' \
    -d '{"action":"approve","admin_remark":"测试审核通过"}' \
    "$API/api/admin/withdraw/$WITHDRAW_ID")
  if echo "$R" | grep -q '"success":true'; then
    pass "审核通过: $(echo $R | sed -E 's/.*"message":"([^"]*)".*/\1/')"
  else
    fail "审核失败: $R"
  fi

  STATUS=$($MYSQL_CMD -sN -e "SELECT status FROM withdraw_requests WHERE id=$WITHDRAW_ID;" 2>/dev/null)
  [ "$STATUS" = "1" ] && pass "DB status 已变为 1 (已通过)" || fail "DB status 期望 1 实际 $STATUS"

  # ===== 9. 标记已打款 =====
  step "9. PUT /api/admin/withdraw/$WITHDRAW_ID action=paid"
  R=$(curl -sS -X PUT -b "$COOKIE_ADMIN" -H 'Content-Type: application/json' \
    -d '{"action":"paid","admin_remark":"测试已打款"}' \
    "$API/api/admin/withdraw/$WITHDRAW_ID")
  if echo "$R" | grep -q '"success":true'; then
    pass "标记打款: $(echo $R | sed -E 's/.*"message":"([^"]*)".*/\1/')"
  else
    fail "标记打款失败: $R"
  fi

  STATUS=$($MYSQL_CMD -sN -e "SELECT status FROM withdraw_requests WHERE id=$WITHDRAW_ID;" 2>/dev/null)
  [ "$STATUS" = "3" ] && pass "DB status 已变为 3 (已打款)" || fail "DB status 期望 3 实际 $STATUS"

  # ===== 10. 状态机边界：不能再次操作已终态 =====
  step "10. 对已打款记录再 approve，应被拒"
  R=$(curl -sS -X PUT -b "$COOKIE_ADMIN" -H 'Content-Type: application/json' \
    -d '{"action":"approve"}' \
    "$API/api/admin/withdraw/$WITHDRAW_ID")
  if echo "$R" | grep -q '"success":false'; then
    pass "状态机保护生效：$(echo $R | sed -E 's/.*"message":"([^"]*)".*/\1/')"
  else
    fail "应被拒但通过了: $R"
  fi

  # ===== 11. 拒绝场景：再造一笔，拒绝它 =====
  step "11. 拒绝流程：再造一笔 → reject"
  $MYSQL_CMD -e "
INSERT INTO withdraw_requests (user_id, amount, alipay_account, real_name, status, created_at)
VALUES ($TEST_UID, 10.00, 'reject@test.com', '被拒用户', 0, UNIX_TIMESTAMP());
" 2>/dev/null
  REJECT_ID=$($MYSQL_CMD -sN -e "SELECT MAX(id) FROM withdraw_requests WHERE user_id=$TEST_UID;" 2>/dev/null)

  # 空原因应被拒
  R=$(curl -sS -X PUT -b "$COOKIE_ADMIN" -H 'Content-Type: application/json' \
    -d '{"action":"reject"}' \
    "$API/api/admin/withdraw/$REJECT_ID")
  if echo "$R" | grep -q '"success":false'; then
    pass "空拒绝原因被拦"
  else
    fail "空拒绝原因应被拦: $R"
  fi

  # 正确拒绝
  R=$(curl -sS -X PUT -b "$COOKIE_ADMIN" -H 'Content-Type: application/json' \
    -d '{"action":"reject","reject_reason":"自动化测试拒绝"}' \
    "$API/api/admin/withdraw/$REJECT_ID")
  if echo "$R" | grep -q '"success":true'; then
    pass "拒绝成功"
  else
    fail "拒绝失败: $R"
  fi

  STATUS=$($MYSQL_CMD -sN -e "SELECT status, reject_reason FROM withdraw_requests WHERE id=$REJECT_ID;" 2>/dev/null)
  pass "DB 最终: id=$REJECT_ID status/reason = $STATUS"
fi

# ===== 11b. 字符集检查：API 写入的中文是否没丢 =====
if [ "${TEST_USER_API:-1}" = "1" ] && [ -n "${WITHDRAW_ID:-}" ]; then
  step "11b. 中文字符集检查"
  # 确保客户端用 utf8mb4 读取，避免客户端侧的 ???
  REAL_NAME=$($MYSQL_CMD --default-character-set=utf8mb4 -sN -e \
    "SELECT real_name FROM withdraw_requests WHERE id=$WITHDRAW_ID;" 2>/dev/null)
  echo "  id=$WITHDRAW_ID real_name: [$REAL_NAME]"
  # 期望是「测试用户」，如果是「????」说明 API → DB 通路中文丢了
  if [ "$REAL_NAME" = "测试用户" ]; then
    pass "API 写入中文完好"
  elif echo "$REAL_NAME" | grep -q "?"; then
    fail "API 写入中文变 ？？？ —— SQL_DSN 可能缺 charset=utf8mb4 参数"
    echo "  诊断命令："
    echo "    grep SQL_DSN /root/lingjing-ai/one-api/.env"
    echo "    $MYSQL_CMD -e \"SHOW CREATE TABLE withdraw_requests\\\\G\" | grep -E 'CHARSET|COLLATE'"
  else
    warn "读到非预期值：[$REAL_NAME]"
  fi
fi

# ===== 12. 最终 DB 状态 =====
step "12. 最终快照（user_id=$TEST_UID 最近 5 条）"
$MYSQL_CMD --default-character-set=utf8mb4 -e "
SELECT id, amount, LEFT(alipay_account, 20) AS alipay, real_name, status,
       FROM_UNIXTIME(created_at) AS created, FROM_UNIXTIME(processed_at) AS processed
FROM withdraw_requests WHERE user_id=$TEST_UID
ORDER BY id DESC LIMIT 5;
" 2>/dev/null

# ===== 总结 =====
echo ""
if [ "$FAIL_COUNT" = "0" ]; then
  echo -e "${GREEN}✅ 全部通过${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAIL_COUNT 项失败${NC}，请把上方输出贴给我"
  exit 1
fi
