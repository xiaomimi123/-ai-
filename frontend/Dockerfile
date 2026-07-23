FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# 构建产物放在 /opt/dist，由 entrypoint 拷进共享卷。
# 不能直接 COPY 到 /usr/share/nginx/html：那里挂着 named volume，
# 卷只在首次创建时从镜像填充，之后即使镜像更新了内容也不会重新填充——
# 结果是部署了新版前端但用户永远看到旧版。
COPY --from=builder /app/dist /opt/dist
COPY docker-entrypoint.sh /docker-entrypoint.d/40-generate-config.sh
RUN chmod +x /docker-entrypoint.d/40-generate-config.sh
