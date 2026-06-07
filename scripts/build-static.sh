#!/bin/sh
set -e

# 静态站点构建脚本
# 用于 Vercel、Netlify、Cloudflare Pages 等平台的部署

echo "🚀 开始构建静态站点..."

MANIFEST_PATH="generated/photos-manifest.json"
BUILD_COMMAND="pnpm build"
CACHE_REPO_URL="${REPO_URL:-${BUILDER_REPO_URL:-}}"
CACHE_REPO_TOKEN="${REPO_TOKEN:-${GIT_TOKEN:-}}"

if [ -n "$CACHE_REPO_URL" ] && [ -n "$CACHE_REPO_TOKEN" ]; then
  echo "♻️  尝试从远程仓库缓存恢复 manifest 和缩略图..."
  if ! pnpm exec tsx scripts/artifact-cache.ts restore; then
    echo "⚠️  远程仓库缓存恢复失败，将继续使用本地文件或从 S3 重建"
  fi
else
  MISSING_CACHE_CONFIG=""
  if [ -z "$CACHE_REPO_URL" ]; then
    MISSING_CACHE_CONFIG="REPO_URL/BUILDER_REPO_URL"
  fi
  if [ -z "$CACHE_REPO_TOKEN" ]; then
    if [ -n "$MISSING_CACHE_CONFIG" ]; then
      MISSING_CACHE_CONFIG="$MISSING_CACHE_CONFIG, REPO_TOKEN/GIT_TOKEN"
    else
      MISSING_CACHE_CONFIG="REPO_TOKEN/GIT_TOKEN"
    fi
  fi
  echo "ℹ️  远程仓库缓存未启用，缺少: $MISSING_CACHE_CONFIG"
fi

# 如果没有 S3 凭据但仓库里已有 manifest，则允许静态预览构建继续
if [ -z "$S3_BUCKET_NAME" ] || [ -z "$S3_ACCESS_KEY_ID" ] || [ -z "$S3_SECRET_ACCESS_KEY" ]; then
  if [ -f "$MANIFEST_PATH" ]; then
    echo "⚠️  未检测到完整的 S3 环境变量，使用现有 manifest 继续构建 Preview"
    BUILD_COMMAND="pnpm build:web"
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
if ! $BUILD_COMMAND; then
  echo "❌ 构建失败"
  exit 1
fi

if [ -n "$CACHE_REPO_URL" ] && [ -n "$CACHE_REPO_TOKEN" ]; then
  echo "♻️  同步最新 manifest 和缩略图到远程仓库缓存..."
  if ! pnpm exec tsx scripts/artifact-cache.ts save; then
    echo "⚠️  远程仓库缓存同步失败，静态站点产物已生成但下次构建可能无法复用缓存"
  fi
else
  echo "ℹ️  远程仓库缓存未启用，跳过同步 manifest 和缩略图"
fi

# 验证构建输出
OUTPUT_DIR="apps/web/dist"
if [ ! -f "$OUTPUT_DIR/index.html" ]; then
  echo "❌ 错误: 构建输出不完整，未找到 index.html"
  exit 1
fi

echo "✅ 构建完成！输出目录: $OUTPUT_DIR"
