#!/bin/sh
# 1) 把镜像内的构建产物同步进共享卷（卷不会随镜像更新自动刷新，必须每次覆盖）
# 2) 由环境变量生成运行时配置
# 每次容器启动都重新执行——这就是"改 .env + up -d 即可换品牌，无需重新 build"的实现。
set -e

WEB_ROOT=/usr/share/nginx/html

rm -rf "$WEB_ROOT"/*
cp -r /opt/dist/. "$WEB_ROOT"/
echo "[entrypoint] 已同步构建产物到 $WEB_ROOT"

CONFIG_PATH="$WEB_ROOT/config.js"

cat > "$CONFIG_PATH" <<EOF
window.__CONFIG__ = {
  apiBaseUrl: "${PUBLIC_API_BASE_URL:-}",
  siteName: "${SITE_NAME:-AI API Platform}",
  logoUrl: "${BRAND_LOGO_URL:-}",
  primaryColor: "${BRAND_PRIMARY_COLOR:-#2ECC71}",
  footerText: "${BRAND_FOOTER_TEXT:-}",
  icpNumber: "${BRAND_ICP_NUMBER:-}",
  contactUrl: "${BRAND_CONTACT_URL:-}"
};
EOF

echo "[entrypoint] 已生成 $CONFIG_PATH (siteName=${SITE_NAME:-AI API Platform})"
