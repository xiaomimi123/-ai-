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

# 品牌变量由部署者在 .env 中自由填写，可能含双引号 / 反斜杠 / 换行。
# 若不转义直接拼进 JS 字符串字面量，这些字符会破坏 config.js 的语法，
# 导致 window.__CONFIG__ 整体解析失败、全部字段静默回退默认值。
# 这里对每个插值的字符串值做转义：反斜杠必须最先转义。
js_escape() {
  cr=$(printf '\r')
  printf '%s' "$1" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e "s/$cr/\\\\r/g" \
    | awk 'BEGIN{ORS=""} { if (NR>1) printf "\\n"; printf "%s", $0 }'
}

ESC_API_BASE_URL=$(js_escape "${PUBLIC_API_BASE_URL:-}")
ESC_SITE_NAME=$(js_escape "${SITE_NAME:-AI API Platform}")
ESC_LOGO_URL=$(js_escape "${BRAND_LOGO_URL:-}")
ESC_PRIMARY_COLOR=$(js_escape "${BRAND_PRIMARY_COLOR:-#2ECC71}")
ESC_FOOTER_TEXT=$(js_escape "${BRAND_FOOTER_TEXT:-}")
ESC_ICP_NUMBER=$(js_escape "${BRAND_ICP_NUMBER:-}")
ESC_CONTACT_URL=$(js_escape "${BRAND_CONTACT_URL:-}")

cat > "$CONFIG_PATH" <<EOF
window.__CONFIG__ = {
  apiBaseUrl: "${ESC_API_BASE_URL}",
  siteName: "${ESC_SITE_NAME}",
  logoUrl: "${ESC_LOGO_URL}",
  primaryColor: "${ESC_PRIMARY_COLOR}",
  footerText: "${ESC_FOOTER_TEXT}",
  icpNumber: "${ESC_ICP_NUMBER}",
  contactUrl: "${ESC_CONTACT_URL}"
};
EOF

echo "[entrypoint] 已生成 $CONFIG_PATH (siteName=${SITE_NAME:-AI API Platform})"
