#!/bin/sh
# 按 SSL_MODE 决定用哪套模板。必须在官方的 envsubst 脚本（20-）之前跑，
# 所以文件名编号取 15-。
set -e

case "${SSL_MODE:-none}" in
  letsencrypt)
    CERT_DIR="/etc/letsencrypt/live/${BASE_DOMAIN}"
    if [ -f "$CERT_DIR/fullchain.pem" ]; then
      echo "[entrypoint] SSL_MODE=letsencrypt，已找到证书，启用 HTTPS 模板"
      cp /etc/nginx/templates-ssl/*.template /etc/nginx/templates/
    else
      # 首次启动证书还没签发，此时用 HTTP 模板让 ACME 挑战能走通。
      # certbot 签发成功后重启 nginx 容器即切换到 HTTPS。
      echo "[entrypoint] SSL_MODE=letsencrypt，但 $CERT_DIR 无证书。"
      echo "[entrypoint] 先以 HTTP 模式启动供 ACME 挑战使用。签发完成后请执行："
      echo "[entrypoint]   docker compose restart nginx"
    fi
    ;;
  external|none)
    echo "[entrypoint] SSL_MODE=${SSL_MODE:-none}，使用 HTTP 模板（TLS 由外部终结或不启用）"
    ;;
  *)
    echo "[entrypoint] 错误：SSL_MODE 取值非法：'${SSL_MODE}'，必须是 none / letsencrypt / external 之一" >&2
    exit 1
    ;;
esac
