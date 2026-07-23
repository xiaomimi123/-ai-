#!/bin/bash
# 灵镜AI 本地推送脚本
# 用法：
#   ./push.sh              # 自动生成 commit 信息
#   ./push.sh "修改说明"   # 自定义 commit 信息

MSG=${1:-"deploy: $(date '+%Y-%m-%d %H:%M:%S')"}

echo "📦 推送代码到 GitHub..."
cd "$(dirname "$0")"
git add -A
git commit -m "$MSG" || echo "没有新改动，跳过 commit"
git push origin main

echo ""
echo "✅ 代码已推送到 GitHub！"
echo ""
echo "下一步：登录你的服务器，执行："
echo ""
echo "  cd <项目目录> && ./deploy.sh"
echo ""
