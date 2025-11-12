#!/bin/bash

# 静态站点构建脚本
# 用于像 Hexo/Hugo 一样生成完整的静态站点

set -e

echo "🚀 开始构建静态站点..."
echo ""

# 1. 检查 photos 目录
if [ ! -d "photos" ]; then
  echo "⚠️  未找到 photos 目录"
  echo "📝 请创建 photos 目录并放入你的照片"
  echo ""
  echo "目录结构示例："
  echo "  photos/"
  echo "    ├── 2024/"
  echo "    │   ├── IMG_001.jpg"
  echo "    │   └── IMG_002.jpg"
  echo "    └── 2023/"
  echo "        └── IMG_003.jpg"
  echo ""
  exit 1
fi

# 检查是否有照片文件
PHOTO_COUNT=$(find photos -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.heic" -o -iname "*.tiff" \) 2>/dev/null | wc -l | tr -d ' ')

if [ "$PHOTO_COUNT" -eq 0 ]; then
  echo "⚠️  photos 目录中没有找到照片文件"
  echo "📝 支持的格式: JPG, JPEG, PNG, HEIC, TIFF"
  exit 1
fi

echo "📸 找到 $PHOTO_COUNT 张照片"
echo ""

# 2. 生成 manifest 和处理图片
echo "🔨 步骤 1/2: 处理照片并生成 manifest..."
BUILDER_CONFIG_PATH=builder.config.static.ts pnpm --filter @afilmory/builder cli

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 照片处理失败"
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
echo "🚀 部署方式："
echo "   1. Vercel: 在项目根目录运行 'vercel deploy'"
echo "   2. Netlify: 拖拽 apps/web/dist 目录到 Netlify"
echo "   3. GitHub Pages: 将 apps/web/dist 内容推送到 gh-pages 分支"
echo ""
