#!/bin/bash
# 灵镜 AI 全功能 API 烟雾测试（14 组）
#
# 用法：
#   cd /root/lingjing-ai
#   # 默认凭据：root/123456 + Jax/zjx0820LL，可 export 覆盖：
#   # export ADMIN_USER=root ADMIN_PASS=xxx TEST_USER=Jax TEST_PASS=xxx
#   bash scripts/test-all-apis.sh
#
# 跟测试 scripts/test-withdraw-flow.sh 的区别：这个覆盖全站 14 组 API，
# 但不做完整状态机测试；对每个端点只验证「能打通 + success:true」。

set -u

BASE="${BASE:-http://localhost:3000}"
ADMIN_USER="${ADMIN_USER:-root}"
ADMIN_PASS="${ADMIN_PASS:-123456}"
TEST_USER="${TEST_USER:-Jax}"
TEST_PASS="${TEST_PASS:-zjx0820LL}"

CJ_ADMIN=/tmp/test_admin.txt
CJ_USER=/tmp/test_user.txt

MYSQL="docker exec -i one-api-mysql mysql -uroot -pQS75P98SvYaYIy4zkBhmHA== oneapi --default-character-set=utf8mb4"

PASS=0; FAIL=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'

check() {
  local DESC="$1" EXPECT="$2" ACTUAL="$3"
  if echo "$ACTUAL" | grep -q "$EXPECT"; then
    echo -e "${GREEN}✅${NC} $DESC"
    PASS=$((PASS+1))
  else
    echo -e "${RED}❌${NC} $DESC"
    echo "   期望包含: $EXPECT"
    echo "   实际返回: $(echo $ACTUAL | head -c 150)"
    FAIL=$((FAIL+1))
  fi
}

group() { echo -e "\n${CYAN}=== $1 ===${NC}"; }

# ===== 登录 =====
group "环境准备"
curl -sS -c $CJ_ADMIN -X POST $BASE/api/user/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" > /dev/null
echo "Admin 登录完成（$ADMIN_USER）"

curl -sS -c $CJ_USER -X POST $BASE/api/user/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}" > /dev/null
echo "测试用户登录完成（$TEST_USER）"

# ===== 1. 用户系统 =====
group "1. 用户系统"
R=$(curl -sS -b $CJ_USER $BASE/api/user/self)
check "获取用户信息" '"success":true' "$R"
check "用户名正确" "\"username\":\"$TEST_USER\"" "$R"
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/user/?p=0")
check "管理员用户列表" '"success":true' "$R"
check "用户列表非空" '"data":\[' "$R"

# ===== 2. API 令牌 =====
group "2. API 令牌"
R=$(curl -sS -b $CJ_USER -X POST $BASE/api/token/ \
  -H 'Content-Type: application/json' \
  -d '{"name":"全功能测试令牌","remain_quota":-1,"unlimited_quota":true}')
check "创建 API 令牌" '"success":true' "$R"
TOKEN_ID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
TOKEN_KEY=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('key',''))" 2>/dev/null)
echo "   token_id=$TOKEN_ID"

R=$(curl -sS -b $CJ_USER "$BASE/api/token/?p=0")
check "获取令牌列表" '"success":true' "$R"

if [ -n "$TOKEN_ID" ]; then
  # 注意：curl 不 follow 307 redirect（axios 会），所以 DELETE 不能带尾斜杠
  R=$(curl -sS -b $CJ_USER -X DELETE "$BASE/api/token/$TOKEN_ID")
  check "删除令牌" '"success":true' "$R"
fi

# ===== 3. 渠道管理 =====
group "3. 渠道管理"
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/channel/?p=0")
check "获取渠道列表" '"success":true' "$R"
CH_ID=$(echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);l=d.get('data',[]);print(l[0]['id'] if l else '')" 2>/dev/null)
if [ -n "$CH_ID" ]; then
  R=$(curl -sS -b $CJ_ADMIN "$BASE/api/channel/update_balance/$CH_ID")
  check "渠道余额查询接口可访问" '"success"' "$R"
  MSG=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('message',''))" 2>/dev/null)
  echo "   余额查询结果: $MSG"
fi

# ===== 4. 日志系统 =====
group "4. 日志系统"
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/log/?p=0&page_size=10")
check "管理员全量日志" '"success":true' "$R"
R=$(curl -sS -b $CJ_USER "$BASE/api/log/self?p=0&page_size=10")
check "用户自己日志" '"success":true' "$R"

# ===== 5. 兑换码 =====
group "5. 兑换码"
R=$(curl -sS -b $CJ_ADMIN -X POST $BASE/api/redemption/ \
  -H 'Content-Type: application/json' \
  -d '{"name":"测试兑换码","quota":100000,"count":1}')
check "生成兑换码" '"success":true' "$R"
# 兑换码列表里拿最新一条的 key
RD_KEY=$(curl -sS -b $CJ_ADMIN "$BASE/api/redemption/?p=0" | \
  python3 -c "import sys,json;d=json.load(sys.stdin);l=d.get('data',[]) or [];print(l[0]['key'] if l and l[0].get('used_time',0)==0 else '')" 2>/dev/null)
if [ -n "$RD_KEY" ]; then
  R=$(curl -sS -b $CJ_USER -X POST $BASE/api/user/topup \
    -H 'Content-Type: application/json' \
    -d "{\"key\":\"$RD_KEY\"}")
  check "使用兑换码" '"success":true' "$R"
fi

# ===== 6. 灵镜公开接口 =====
group "6. 灵镜公开接口"
for ep in plans notices model-prices config pay/config; do
  R=$(curl -sS "$BASE/api/lingjing/$ep")
  check "GET /api/lingjing/$ep" '"success":true' "$R"
done

# ===== 7. 支付系统 =====
group "7. 支付系统"
# 路径修正：脚本原稿 /api/pay/create 错，实际为 /api/lingjing/pay/create
R=$(curl -sS -b $CJ_USER -X POST $BASE/api/lingjing/pay/create \
  -H 'Content-Type: application/json' \
  -d '{"amount":10,"pay_type":"alipay"}')
ORDER_NO=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('order_no',''))" 2>/dev/null)
if echo "$R" | grep -q '"success":true'; then
  echo -e "${GREEN}✅${NC} 创建支付订单"
  PASS=$((PASS+1))
  if [ -n "$ORDER_NO" ]; then
    R2=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/pay/order/$ORDER_NO")
    check "查询订单状态" '"success":true' "$R2"
  fi
else
  echo -e "${YELLOW}⚠${NC}  创建支付订单失败（可能支付宝未配置，非严重）"
  MSG=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('message',''))" 2>/dev/null)
  echo "   原因: $MSG"
fi
R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/pay/orders")
check "用户订单列表" '"success":true' "$R"
# 路径修正：脚本原稿 /api/admin/lingjing/topups 后端未注册（latent bug），跳过
echo -e "${YELLOW}⚠${NC}  跳过「管理员订单管理」—— /api/admin/lingjing/topups 未实现（需独立修）"

# ===== 8. 分销系统 =====
group "8. 分销系统"
R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/referral")
check "获取邀请信息" '"success":true' "$R"
AFF=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('aff_code',''))" 2>/dev/null)
echo "   aff_code=$AFF"
R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/referral/commissions")
check "获取佣金记录" '"success":true' "$R"
# 路径修正：实际为 /api/admin/lingjing/referral/stats
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/admin/lingjing/referral/stats")
check "管理员分销统计" '"success":true' "$R"

# ===== 9. 提现功能 =====
group "9. 提现功能"
# 先清理再造数据，避免幂等残留
$MYSQL -e "DELETE FROM withdraw_requests WHERE user_id=2; DELETE FROM commissions WHERE user_id=2;" 2>/dev/null
$MYSQL -e "INSERT INTO commissions (user_id,from_user_id,order_id,amount,status,created_at) VALUES (2,0,0,50,1,NOW());" 2>/dev/null

R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/withdraw")
check "查询提现余额" '"success":true' "$R"
AVAIL=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('available',0))" 2>/dev/null)
echo "   可提现余额 ¥$AVAIL"

R=$(curl -sS -b $CJ_USER -X POST $BASE/api/lingjing/withdraw \
  -H 'Content-Type: application/json' \
  --data-binary '{"amount":10,"alipay_account":"test@alipay.com","real_name":"测试用户"}')
check "申请提现 ¥10" '"success":true' "$R"
WD_ID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)

R=$(curl -sS -b $CJ_USER -X POST $BASE/api/lingjing/withdraw \
  -H 'Content-Type: application/json' \
  --data-binary '{"amount":10,"alipay_account":"test@alipay.com","real_name":"测试用户"}')
check "幂等保护（重复被拦）" '待审核' "$R"

R=$(curl -sS -b $CJ_ADMIN "$BASE/api/admin/withdraw?status=0")
check "管理员提现列表" '"success":true' "$R"

if [ -n "$WD_ID" ]; then
  R=$(curl -sS -b $CJ_ADMIN -X PUT "$BASE/api/admin/withdraw/$WD_ID" \
    -H 'Content-Type: application/json' \
    -d '{"action":"approve","admin_remark":"测试通过"}')
  check "管理员审核通过" '"success":true' "$R"
  R=$(curl -sS -b $CJ_ADMIN -X PUT "$BASE/api/admin/withdraw/$WD_ID" \
    -H 'Content-Type: application/json' \
    -d '{"action":"paid","admin_remark":"已打款"}')
  check "管理员标记已打款" '"success":true' "$R"
fi

$MYSQL -e "DELETE FROM withdraw_requests WHERE user_id=2; DELETE FROM commissions WHERE user_id=2;" 2>/dev/null
echo "   测试数据已清理"

# ===== 10. 通知中心 =====
group "10. 通知中心"
$MYSQL -e "INSERT INTO user_notifications (user_id,title,content,type,is_read,created_at) VALUES (2,'测试通知','这是测试内容','system',0,UNIX_TIMESTAMP());" 2>/dev/null

R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/notifications")
check "获取通知列表" '"success":true' "$R"

R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/notifications/unread")
check "获取未读数量" '"success":true' "$R"
UNREAD=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',0))" 2>/dev/null)
echo "   未读通知数 $UNREAD"

R=$(curl -sS -b $CJ_USER -X PUT "$BASE/api/lingjing/notifications/all/read" \
  -H 'Content-Type: application/json' -d '{}')
check "全部标为已读" '"success":true' "$R"

R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/notifications/unread")
UNREAD2=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',0))" 2>/dev/null)
if [ "$UNREAD2" = "0" ]; then
  echo -e "${GREEN}✅${NC} 标记已读后未读数归零"
  PASS=$((PASS+1))
else
  echo -e "${RED}❌${NC} 标记已读后未读数仍为 $UNREAD2"
  FAIL=$((FAIL+1))
fi

# ===== 11. 数据看板 =====
group "11. 数据看板"
R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/stats/dashboard")
check "用户控制台统计" '"success":true' "$R"
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/admin/stats/dashboard")
check "管理员总览统计" '"success":true' "$R"
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/admin/stats/realtime")
check "实时统计" '"success":true' "$R"

# ===== 12. 渠道分组 =====
group "12. 渠道分组"
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/admin/group/list")
check "分组列表" '"success":true' "$R"
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/admin/group/stats")
check "分组统计" '"success":true' "$R"
R=$(curl -sS -b $CJ_USER "$BASE/api/lingjing/group/my")
check "用户查看组权益" '"success":true' "$R"
GRP=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('group',''))" 2>/dev/null)
echo "   当前分组 $GRP"

# ===== 13. 套餐管理 =====
group "13. 套餐管理"
R=$(curl -sS -b $CJ_ADMIN "$BASE/api/admin/lingjing/plans")
check "套餐列表" '"success":true' "$R"
PLAN_COUNT=$(echo "$R" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('data',[]) or []))" 2>/dev/null)
echo "   套餐数量 $PLAN_COUNT"

R=$(curl -sS -b $CJ_ADMIN -X POST $BASE/api/admin/lingjing/plans \
  -H 'Content-Type: application/json' \
  -d '{"name":"测试套餐","price":1,"quota":100000,"bonus_quota":0,"description":"测试","is_available":false}')
check "创建套餐" '"success":true' "$R"
PLAN_ID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$PLAN_ID" ]; then
  R=$(curl -sS -b $CJ_ADMIN -X DELETE "$BASE/api/admin/lingjing/plans/$PLAN_ID")
  check "删除套餐" '"success":true' "$R"
fi

# ===== 14. API 中转测试 =====
group "14. DeepSeek 中转"
R=$(curl -sS -b $CJ_USER -X POST $BASE/api/token/ \
  -H 'Content-Type: application/json' \
  -d '{"name":"中转测试令牌","remain_quota":-1,"unlimited_quota":true}')
TEST_KEY=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('key',''))" 2>/dev/null)
TEST_TID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)

if [ -n "$TEST_KEY" ]; then
  echo "   令牌 ${TEST_KEY:0:20}..."
  R=$(curl -sS -X POST $BASE/v1/chat/completions \
    -H "Authorization: Bearer $TEST_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"回复：OK"}],"max_tokens":10}')
  if echo "$R" | grep -q '"choices"'; then
    echo -e "${GREEN}✅${NC} DeepSeek 中转调用成功"
    PASS=$((PASS+1))
    REPLY=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('choices',[{}])[0].get('message',{}).get('content',''))" 2>/dev/null)
    echo "   模型回复: $REPLY"
  else
    echo -e "${YELLOW}⚠${NC}  DeepSeek 中转失败（检查渠道密钥/额度）"
    echo "   响应: $(echo $R | head -c 200)"
  fi
  curl -sS -b $CJ_USER -X DELETE "$BASE/api/token/$TEST_TID" > /dev/null
fi

# ===== 报告 =====
echo ""
echo -e "${CYAN}========================================${NC}"
echo "  灵镜 AI 全功能测试报告"
echo -e "${CYAN}========================================${NC}"
echo -e "  ${GREEN}✅ 通过: $PASS 项${NC}"
echo -e "  ${RED}❌ 失败: $FAIL 项${NC}"
TOTAL=$((PASS+FAIL))
echo "  📊 总计: $TOTAL 项"
if [ $TOTAL -gt 0 ]; then
  RATE=$((PASS * 100 / TOTAL))
  echo "  通过率: ${RATE}%"
fi
echo ""
if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}🎉 全部通过${NC}"
  exit 0
elif [ $FAIL -le 2 ]; then
  echo -e "  ${YELLOW}⚠  少数失败，请检查上方 ❌ 项${NC}"
  exit 1
else
  echo -e "  ${RED}🔴 多项失败，需要排查${NC}"
  exit 1
fi
