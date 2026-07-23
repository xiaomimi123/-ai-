FROM nginx:alpine
# 官方镜像自带的 default.conf 也声明了 listen 80 default_server，
# 不删会与我们模板生成的 default_server 冲突，nginx 直接启动失败
RUN rm -f /etc/nginx/conf.d/default.conf
COPY templates/ /etc/nginx/templates/
COPY templates-ssl/ /etc/nginx/templates-ssl/
# docker-entrypoint-ssl.sh 按 SSL_MODE 决定用 templates/（HTTP）还是
# templates-ssl/（HTTPS）覆盖到 /etc/nginx/templates/，必须早于官方的
# 20-envsubst-on-templates.sh 执行，所以编号取 15-
COPY docker-entrypoint-ssl.sh /docker-entrypoint.d/15-select-ssl-template.sh
RUN chmod +x /docker-entrypoint.d/15-select-ssl-template.sh
