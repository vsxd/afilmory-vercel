#!/bin/bash

# 静态站点构建脚本（仅支持 S3 存储）
# 用于像 Hexo/Hugo 一样生成完整的静态站点

set -e

echo "🚀 开始构建静态站点（S3 模式）..."
echo ""

# 1. 检查环境变量
echo "🔍 检查 S3 配置..."

if [ -z "$S3_BUCKET_NAME" ]; then
  echo "❌ 错误：缺少 S3_BUCKET_NAME 环境变量"
  echo ""
  echo "📝 请按以下步骤配置："
  echo "  1. 复制 .env.template 为 .env"
  echo "     cp .env.template .env"
  echo ""
  echo "  2. 编辑 .env 文件，填写你的 S3 配置："
  echo "     S3_BUCKET_NAME=your-bucket-name"
  echo "     S3_REGION=us-east-1"
  echo "     S3_ACCESS_KEY_ID=your-access-key-id"
  echo "     S3_SECRET_ACCESS_KEY=your-secret-access-key"
  echo ""
  echo "  3. （可选）如果使用其他 S3 兼容服务，还需配置："
  echo "     S3_ENDPOINT=https://your-endpoint.com"
  echo "     S3_CUSTOM_DOMAIN=https://your-cdn-domain.com"
  echo ""
  exit 1
fi

if [ -z "$S3_ACCESS_KEY_ID" ]; then
  echo "❌ 错误：缺少 S3_ACCESS_KEY_ID 环境变量"
  exit 1
fi

if [ -z "$S3_SECRET_ACCESS_KEY" ]; then
  echo "❌ 错误：缺少 S3_SECRET_ACCESS_KEY 环境变量"
  exit 1
fi

echo "✅ S3 配置检查通过"
echo "   Bucket: $S3_BUCKET_NAME"
echo "   Region: ${S3_REGION:-us-east-1}"
if [ -n "$S3_PREFIX" ]; then
  echo "   Prefix: $S3_PREFIX"
fi
if [ -n "$S3_CUSTOM_DOMAIN" ]; then
  echo "   Custom Domain: $S3_CUSTOM_DOMAIN"
fi
echo ""

# 2. 生成 manifest 和处理图片
echo "🔨 步骤 1/2: 从 S3 读取照片并生成 manifest..."
BUILDER_CONFIG_PATH=builder.config.static.ts pnpm --filter @afilmory/builder cli

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 照片处理失败"
  echo ""
  echo "💡 可能的原因："
  echo "  1. S3 凭证错误或无权限"
  echo "  2. Bucket 名称或区域配置错误"
  echo "  3. S3 中没有照片文件"
  echo "  4. 网络连接问题"
  echo ""
  exit 1
fi

echo "✅ 照片处理完成"
echo ""

# 3. 构建前端
echo "🔨 步骤 2/2: 构建前端应用..."
pnpm --filter @afilmory/web build

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 前端构建失败"
  exit 1
fi

echo "✅ 前端构建完成"
echo ""

# 4. 完成
echo "🎉 静态站点构建完成！"
echo ""
echo "📁 构建产物位置: apps/web/dist"
echo ""
echo "📝 注意事项："
echo "  - 照片通过 S3 访问，不会被打包到构建产物中"
echo "  - 构建产物体积小，适合部署到 Vercel 等平台"
echo "  - 确保 S3 存储桶的 CORS 和公开访问策略配置正确"
echo ""
echo "🚀 部署方式："
echo "   1. Vercel: 在项目根目录运行 'vercel deploy --prod'"
echo "   2. Netlify: 拖拽 apps/web/dist 目录到 Netlify"
echo "   3. GitHub Pages: 将 apps/web/dist 内容推送到 gh-pages 分支"
echo ""
