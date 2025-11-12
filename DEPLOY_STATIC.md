# 静态站点部署指南

本指南将帮助你将 Afilmory 部署为静态站点（类似 Hexo/Hugo），无需数据库、Redis 等后端服务。

## 📋 部署流程概览

```
照片目录 → 图片处理 → 生成 manifest → 构建前端 → 部署到托管平台
```

## 🚀 快速开始

### 1. 准备照片

在项目根目录创建 `photos` 目录并放入你的照片：

```bash
mkdir photos
```

**目录结构示例：**

```
photos/
├── 2024/
│   ├── IMG_001.jpg
│   ├── IMG_002.heic
│   └── IMG_003.png
├── 2023/
│   ├── travel/
│   │   ├── photo1.jpg
│   │   └── photo2.jpg
│   └── daily/
│       └── photo3.jpg
└── README.md
```

**支持的格式：**
- JPG / JPEG
- PNG
- HEIC (Apple 设备照片格式)
- TIFF
- Live Photos (iPhone)

### 2. 配置站点信息

编辑 `config.json` 文件（如果不存在，从 `config.example.json` 复制）：

```json
{
  "name": "我的照片集",
  "title": "我的 Afilmory",
  "description": "记录生活中的美好瞬间",
  "url": "https://your-site.vercel.app",
  "accentColor": "#007bff",
  "author": {
    "name": "你的名字",
    "url": "https://your-website.com",
    "avatar": "https://your-avatar-url.com/avatar.jpg"
  },
  "social": {
    "github": "your-github-username",
    "twitter": "your-twitter-handle",
    "rss": true
  }
}
```

### 3. 安装依赖

```bash
pnpm install
```

### 4. 本地构建和预览

```bash
# 构建静态站点
pnpm build:static

# 预览构建结果
cd apps/web
pnpm serve
```

构建完成后，打开 http://localhost:4173 预览你的照片站点。

## 🌐 部署到 Vercel

### 方式一：通过 Vercel CLI

1. **安装 Vercel CLI**

```bash
npm i -g vercel
```

2. **登录 Vercel**

```bash
vercel login
```

3. **部署**

```bash
# 首次部署
vercel

# 生产环境部署
vercel --prod
```

### 方式二：通过 GitHub 自动部署

1. **将项目推送到 GitHub**

```bash
git add .
git commit -m "准备部署到 Vercel"
git push
```

2. **在 Vercel 导入项目**

- 访问 [vercel.com](https://vercel.com)
- 点击 "New Project"
- 从 GitHub 导入你的仓库
- Vercel 会自动检测 `vercel.json` 配置
- 点击 "Deploy"

3. **后续自动部署**

每次推送到 `main` 分支，Vercel 都会自动重新构建和部署。

### 配置说明

项目根目录的 `vercel.json` 已经配置好：

```json
{
  "buildCommand": "sh scripts/build-static.sh",
  "outputDirectory": "apps/web/dist",
  "installCommand": "pnpm install"
}
```

## 📦 部署到其他平台

### Netlify

1. **通过拖拽部署**

```bash
# 本地构建
pnpm build:static

# 将 apps/web/dist 目录拖拽到 Netlify
```

2. **通过 Git 自动部署**

在 Netlify 项目设置中配置：

- **Build command:** `sh scripts/build-static.sh`
- **Publish directory:** `apps/web/dist`
- **Install command:** `pnpm install`

### GitHub Pages

```bash
# 安装 gh-pages
pnpm add -D gh-pages

# 构建
pnpm build:static

# 部署到 gh-pages 分支
npx gh-pages -d apps/web/dist
```

在 GitHub 仓库设置中启用 GitHub Pages，选择 `gh-pages` 分支。

### Cloudflare Pages

1. 在 Cloudflare Pages 中连接你的 Git 仓库
2. 配置构建设置：
   - **Build command:** `sh scripts/build-static.sh`
   - **Build output directory:** `apps/web/dist`
   - **Root directory:** `/` (默认)

## 🔄 更新照片

### 添加新照片

1. 将新照片放入 `photos` 目录
2. 重新构建：

```bash
pnpm build:static
```

3. 部署更新：

```bash
# Vercel
vercel --prod

# 或推送到 Git（如果配置了自动部署）
git add .
git commit -m "添加新照片"
git push
```

### 增量更新（推荐）

如果只想重新生成 manifest 而不重新处理所有图片：

```bash
# 只生成 manifest（会自动检测新增/修改的照片）
pnpm build:manifest:static

# 构建前端
pnpm --filter @afilmory/web build
```

## ⚙️ 高级配置

### 自定义构建配置

编辑 `builder.config.static.ts` 来调整图片处理参数：

```typescript
export default defineBuilderConfig(() => ({
  storage: {
    provider: 'local',
    basePath: './photos',  // 照片源目录
    baseUrl: '/photos',     // 网站访问路径
  },
  system: {
    processing: {
      defaultConcurrency: 10,           // 并发处理数
      enableLivePhotoDetection: true,   // 检测 Live Photos
      digestSuffixLength: 0,
    },
    observability: {
      showProgress: true,               // 显示进度
      showDetailedStats: true,          // 显示详细统计
    },
  },
}))
```

### 使用 S3 存储照片

如果你的照片已经存储在 S3 上，可以直接从 S3 拉取：

1. 复制 `builder.config.default.ts` 到 `builder.config.ts`
2. 配置 S3 信息
3. 创建 `.env` 文件：

```bash
S3_BUCKET_NAME=your-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
S3_ENDPOINT=https://s3.amazonaws.com
S3_PREFIX=photos/
S3_CUSTOM_DOMAIN=https://cdn.example.com
```

4. 构建时使用默认配置：

```bash
pnpm build:manifest
pnpm --filter @afilmory/web build
```

## 🐛 常见问题

### 1. 构建时提示找不到 photos 目录

**解决方案：** 确保在项目根目录创建了 `photos` 目录并放入照片。

### 2. 图片处理速度很慢

**解决方案：**
- 照片数量多时，首次处理会比较慢，这是正常的
- 可以调整 `builder.config.static.ts` 中的 `defaultConcurrency` 参数
- 后续更新只会处理新增/修改的照片

### 3. Vercel 部署超时

**解决方案：**
- Vercel 免费版构建时间限制为 45 分钟
- 如果照片特别多，建议本地构建后部署：

```bash
# 本地构建
pnpm build:static

# 只部署构建产物
vercel --prebuilt
```

### 4. 部署后图片不显示

**解决方案：**
- 检查 `photos` 目录是否在 `.gitignore` 中
- 确保构建时 photos 目录下有照片
- 检查 `apps/web/dist/photos` 目录是否包含处理后的图片

## 📊 构建产物说明

构建完成后，`apps/web/dist` 目录包含：

```
dist/
├── index.html              # 主页面
├── assets/                 # JS/CSS 资源
│   ├── index-xxx.js
│   └── index-xxx.css
├── photos/                 # 处理后的照片
│   ├── thumbnails/         # 缩略图
│   └── originals/          # 原图 (可选)
├── manifest.json           # 照片信息清单
├── sitemap.xml            # 站点地图
├── feed.json              # RSS feed
└── og-image.png           # Open Graph 图片
```

## 🎉 完成

恭喜！你的静态照片站点已经部署成功。每次添加新照片时，只需重新运行 `pnpm build:static` 并部署即可。

## 📚 更多信息

- [完整项目文档](./README.md)
- [配置选项说明](./README.md#⚙️-configuration-options)
- [Vercel 文档](https://vercel.com/docs)
- [GitHub Issues](https://github.com/Afilmory/Afilmory/issues)
