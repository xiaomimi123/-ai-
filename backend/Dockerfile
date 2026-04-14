FROM golang:alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev build-base

ENV GO111MODULE=on \
    CGO_ENABLED=1 \
    GOOS=linux

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .

# 创建空的 web/build 避免编译报错
RUN mkdir -p web/build/default web/build/berry web/build/air && \
    echo '<!DOCTYPE html><html><body>灵镜AI</body></html>' > web/build/default/index.html && \
    cp web/build/default/index.html web/build/berry/index.html && \
    cp web/build/default/index.html web/build/air/index.html

RUN go build -trimpath -ldflags "-s -w -linkmode external -extldflags '-static'" -o lingjing-api

FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /build/lingjing-api /
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/lingjing-api"]
