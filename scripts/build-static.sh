#!/bin/bash
set -e

# 静态站点构建脚本
# 用于 Vercel、Netlify、Cloudflare Pages 等平台的部署

echo "🚀 开始构建静态站点..."

# 检查必要的环境变量
if [ -z "$S3_BUCKET_NAME" ] || [ -z "$S3_ACCESS_KEY_ID" ] || [ -z "$S3_SECRET_ACCESS_KEY" ]; then
  echo "❌ 错误: S3 环境变量未设置，构建将失败"
  echo ""
  echo "   请确保在部署平台配置了以下环境变量:"
  echo "   - S3_BUCKET_NAME (必填)"
  echo "   - S3_ACCESS_KEY_ID (必填)"
  echo "   - S3_SECRET_ACCESS_KEY (必填)"
  echo "   - S3_REGION (可选，默认: us-east-1)"
  echo "   - S3_ENDPOINT (可选)"
  echo "   - S3_PREFIX (可选)"
  echo "   - S3_CUSTOM_DOMAIN (可选)"
  echo ""
  echo "   在 Vercel 中配置环境变量:"
  echo "   Project Settings > Environment Variables"
  exit 1
fi

# 检查输出目录是否存在
OUTPUT_DIR="apps/web/dist"
if [ ! -d "$OUTPUT_DIR" ]; then
  mkdir -p "$OUTPUT_DIR"
fi

# 构建 manifest
echo "📦 构建照片 manifest..."
if ! pnpm build:manifest; then
  echo "❌ Manifest 构建失败"
  exit 1
fi

# 构建前端
echo "🎨 构建前端应用..."
if ! pnpm build:web; then
  echo "❌ 前端构建失败"
  exit 1
fi

# 验证构建输出
if [ ! -f "$OUTPUT_DIR/index.html" ]; then
  echo "❌ 错误: 构建输出不完整，未找到 index.html"
  exit 1
fi

echo "✅ 构建完成！输出目录: $OUTPUT_DIR"

