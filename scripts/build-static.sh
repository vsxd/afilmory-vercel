#!/bin/bash
set -e

# 静态站点构建脚本
# 用于 Vercel、Netlify、Cloudflare Pages 等平台的部署

echo "🚀 开始构建静态站点..."

MANIFEST_PATH="generated/photos-manifest.json"

# 如果没有 S3 凭据但仓库里已有 manifest，则允许静态预览构建继续
if [ -z "$S3_BUCKET_NAME" ] || [ -z "$S3_ACCESS_KEY_ID" ] || [ -z "$S3_SECRET_ACCESS_KEY" ]; then
  if [ -f "$MANIFEST_PATH" ]; then
    echo "⚠️  未检测到完整的 S3 环境变量，使用现有 manifest 继续构建 Preview"
    export SKIP_MANIFEST_BUILD=true
  else
    echo "❌ 错误: S3 环境变量未设置，且未找到可复用的 manifest"
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
    echo "   或者先生成可复用的 photos-manifest.json 后再触发 Preview 构建"
    exit 1
  fi
fi

# 执行完整构建
echo "📦 构建中..."
if ! pnpm build; then
  echo "❌ 构建失败"
  exit 1
fi

# 验证构建输出
OUTPUT_DIR="apps/web/dist"
if [ ! -f "$OUTPUT_DIR/index.html" ]; then
  echo "❌ 错误: 构建输出不完整，未找到 index.html"
  exit 1
fi

echo "✅ 构建完成！输出目录: $OUTPUT_DIR"
