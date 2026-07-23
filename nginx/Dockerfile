FROM nginx:alpine
# 官方镜像自带的 default.conf 也声明了 listen 80 default_server，
# 不删会与我们模板生成的 default_server 冲突，nginx 直接启动失败
RUN rm -f /etc/nginx/conf.d/default.conf
COPY templates/ /etc/nginx/templates/
