#!/bin/bash
set -e

# 静态站点构建脚本
# 用于 Vercel、Netlify、Cloudflare Pages 等平台的部署

echo "🚀 开始构建静态站点..."

MANIFEST_PATH="packages/data/src/photos-manifest.json"

# 如果没有 S3 凭据，则跳过 builder，交给 precheck 复用现有 manifest 或生成空 manifest
if [ -z "$S3_BUCKET_NAME" ] || [ -z "$S3_ACCESS_KEY_ID" ] || [ -z "$S3_SECRET_ACCESS_KEY" ]; then
  if [ -f "$MANIFEST_PATH" ]; then
    echo "⚠️  未检测到完整的 S3 环境变量，使用仓库中的现有 manifest 继续构建 Preview"
  else
    echo "⚠️  未检测到完整的 S3 环境变量，也没有现成 manifest，将在 precheck 阶段生成空 manifest 用于 Preview 构建"
  fi
  export SKIP_MANIFEST_BUILD=true
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
