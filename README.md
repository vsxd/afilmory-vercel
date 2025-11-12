# Afilmory - 现代化照片集静态站点生成器

<p align="center">
  <img src="https://github.com/vsxd/assets/blob/main/afilmory-readme.webp?raw=true" alt="Afilmory" width="100%" />
</p>

Afilmory (/əˈfɪlməri/, "uh-FIL-muh-ree") 是一个专为摄影爱好者设计的静态站点生成器，类似于 Hexo/Hugo，但专注于照片展示。它结合了自动照片处理、现代化前端技术和简单的部署流程，让你轻松创建属于自己的照片集网站。

**✨ 在线演示:**
- https://afilmory.innei.in
- https://gallery.mxte.cc
- https://photography.pseudoyu.com
- https://afilmory.magren.cc

## 🌟 特性

### 核心功能

- 🖼️ **高性能 WebGL 图片渲染器** - 自定义 WebGL 组件，流畅的缩放和平移
- 📱 **响应式瀑布流布局** - 基于 Masonic，适配不同屏幕尺寸
- 🎨 **现代 UI 设计** - Glassmorphic 设计系统，Tailwind CSS 4
- ⚡ **增量构建** - 智能变更检测，只处理新增或修改的照片
- 🌐 **国际化** - 内置多语言支持
- 🔗 **OpenGraph** - 社交媒体分享预览

### 图片处理

- 🔄 **HEIC/HEIF 支持** - 自动转换 Apple 设备照片格式
- 📷 **TIFF 支持** - 自动转换专业摄影格式
- 🖼️ **智能缩略图生成** - 多尺寸缩略图，优化加载速度
- 📊 **EXIF 信息展示** - 完整的拍摄参数：相机、焦距、光圈等
- 🌈 **Blurhash 占位图** - 优雅的图片加载体验
- 📱 **Live Photo 支持** - 检测和展示 iPhone 动态照片
- ☀️ **HDR 图片支持** - 展示 HDR 图片

### 高级功能

- 🎛️ **富士胶片模拟** - 读取并展示富士相机胶片模拟设置
- 🔍 **全屏查看器** - 支持手势的图片查看器
- 🏷️ **文件系统标签** - 基于文件系统自动生成标签
- ⚡ **并发处理** - 多进程/多线程并发处理支持
- 🗂️ **多存储支持** - S3、GitHub 和本地文件系统
- 📷 **图片分享** - 分享到社交媒体或嵌入网站
- 🗺️ **交互式地图** - 使用 MapLibre 展示带 GPS 坐标的照片

## 🚀 快速开始

### 前置要求

- Node.js 18+
- pnpm 10+

### 安装

```bash
# 克隆仓库
git clone https://github.com/vsxd/afilmory-vercel.git
cd afilmory-vercel

# 安装依赖
pnpm install
```

### 配置

1. **准备 S3 存储并上传照片**

将你的照片上传到 S3 兼容的对象存储中，支持以下格式：
- JPG / JPEG
- PNG
- HEIC (Apple 设备)
- TIFF

**重要提示：本项目仅支持 S3 兼容存储，照片不会被打包到部署产物中。**

2. **配置环境变量**

创建 `.env` 文件，填写你的 S3 配置：

```bash
S3_BUCKET_NAME=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_PREFIX=photos/
S3_CUSTOM_DOMAIN=https://your-cdn-domain.com  # 可选
```

3. **配置站点信息** (可选)

```bash
cp config.example.json config.json
```

编辑 `config.json`:

```json
{
  "name": "我的照片集",
  "title": "My Afilmory",
  "description": "记录生活中的美好瞬间",
  "url": "https://your-site.vercel.app",
  "author": {
    "name": "Your Name",
    "url": "https://your-website.com"
  }
}
```

### 构建和预览

```bash
# 完整构建（处理照片 + 构建前端）
pnpm build

# 本地预览
pnpm preview
```

打开 http://localhost:4173 预览你的照片站点！

## 📦 部署

### 部署到 Vercel（推荐）

#### 方式一：GitHub 自动部署（推荐）

1. 将项目推送到 GitHub
2. 在 [vercel.com](https://vercel.com) 导入项目
3. 在 Vercel 项目设置中配置环境变量：
   - `S3_BUCKET_NAME`
   - `S3_REGION`
   - `S3_ACCESS_KEY_ID`
   - `S3_SECRET_ACCESS_KEY`
   - `S3_ENDPOINT`（可选）
   - `S3_PREFIX`（可选）
   - `S3_CUSTOM_DOMAIN`（可选）
4. 点击 "Deploy"
5. 每次推送到 `main` 分支自动重新部署

#### 方式二：CLI 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 确保本地 .env 文件已配置
# 部署
vercel --prod
```

### 静态部署

项目支持静态站点部署，构建产物位于 `apps/web/dist` 目录。你可以将构建后的静态文件部署到任何静态托管平台。

**构建命令：**
```bash
pnpm build
```

**输出目录：** `apps/web/dist`

详见 [部署指南](./DEPLOY_STATIC.md)

## 🏗️ 技术架构

### 前端技术栈

- **React 19** - 最新版本，包含 React Compiler
- **TypeScript** - 完整的类型安全
- **Vite 7** - 现代构建工具
- **Tailwind CSS 4** - 原子化 CSS
- **Radix UI** - 无障碍组件库
- **Jotai** - 状态管理
- **TanStack Query** - 数据获取和缓存
- **React Router 7** - 路由管理
- **i18next** - 国际化

### 构建系统

- **Node.js** - 服务端运行时
- **Sharp** - 高性能图片处理
- **AWS SDK** - S3 存储操作（可选）
- **Worker Threads/Cluster** - 并发处理
- **EXIF-Reader** - EXIF 数据提取

### 存储架构

**本项目仅支持 S3 兼容存储**，不会将照片打包到部署产物中，确保项目体积小，适合静态部署和 Vercel 等平台。

支持的 S3 兼容服务：
- **AWS S3** - Amazon S3 对象存储
- **MinIO** - 开源对象存储服务
- **阿里云 OSS** - 阿里云对象存储
- **腾讯云 COS** - 腾讯云对象存储
- 其他 S3 兼容服务

## 📁 项目结构

```
afilmory-vercel/
├── apps/
│   └── web/                   # 🎨 前端 SPA 应用
├── packages/
│   ├── builder/               # 🔨 照片处理工具
│   ├── webgl-viewer/          # 🖼️ WebGL 查看器
│   ├── data/                  # 📊 数据层
│   ├── ui/                    # 🎨 UI 组件
│   ├── hooks/                 # ⚓ React Hooks
│   └── utils/                 # 🔧 工具函数
├── config.json                # 站点配置
└── vercel.json                # 部署配置
```

## ⚙️ 配置选项

### 站点配置 (`config.json`)

```json
{
  "name": "站点名称",
  "title": "站点标题",
  "description": "站点描述",
  "url": "https://your-site.com",
  "accentColor": "#007bff",
  "author": {
    "name": "作者名",
    "url": "https://author-site.com",
    "avatar": "https://avatar-url.jpg"
  },
  "social": {
    "github": "username",
    "twitter": "handle",
    "rss": true
  },
  "map": ["maplibre"],
  "mapStyle": "https://map-style-url.json"
}
```

### 环境变量配置 (`.env`)

项目**仅支持 S3 存储**，必须配置以下环境变量：

```bash
# 必填
S3_BUCKET_NAME=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key

# 可选
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com  # 默认 AWS S3
S3_PREFIX=photos/                               # 照片路径前缀
S3_CUSTOM_DOMAIN=https://cdn.example.com        # 自定义 CDN 域名
S3_EXCLUDE_REGEX=.*\.txt$                       # 排除某些文件
```

### 构建配置 (`builder.config.ts`)

配置文件已预设为 S3 模式，通常无需修改：

```typescript
export default defineBuilderConfig(() => ({
  storage: {
    provider: 's3',
    bucket: env.S3_BUCKET_NAME,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    // ... 其他 S3 配置
  },
  system: {
    processing: {
      defaultConcurrency: 10,         // 并发数
      enableLivePhotoDetection: true, // Live Photo
    },
  },
}))
```

## 📋 CLI 命令

### 开发命令

```bash
# 开发模式（不处理照片）
pnpm dev

# 完整构建
pnpm build

# 只处理照片
pnpm build:manifest

# 只构建前端
pnpm build:web

# 预览构建结果
pnpm preview
```

### Manifest 构建选项

```bash
# 强制重新处理所有照片
pnpm build:manifest -- --force

# 只重新生成缩略图
pnpm build:manifest -- --force-thumbnails

# 只重新生成 manifest
pnpm build:manifest -- --force-manifest
```

## 🔄 更新照片

### 添加新照片

1. 将新照片上传到 S3 存储桶
2. 推送代码到 GitHub（如果使用 Vercel 自动部署）或运行 `vercel --prod`
3. Vercel 会自动重新构建和部署

增量构建会自动检测 S3 中新增/修改的照片，只处理变更部分。

### 支持的格式

- JPG / JPEG
- PNG
- HEIC (Apple 设备)
- TIFF
- Live Photos (iPhone)

## 🎨 自定义

### 修改主题色

编辑 `config.json` 的 `accentColor`:

```json
{
  "accentColor": "#ff6b6b"
}
```

### 添加地图样式

```json
{
  "map": ["maplibre"],
  "mapStyle": "https://your-map-style.json",
  "mapProjection": "globe"
}
```

### 国际化

语言文件位于 `apps/web/public/locales/`。

添加新语言：
1. 创建语言目录（如 `fr/`）
2. 复制并翻译 `common.json`
3. 在 `apps/web/src/lib/i18n.ts` 添加语言代码

## 📊 性能

- ⚡ **Lighthouse 评分**: 95+
- 🎯 **首屏加载**: < 1s
- 📦 **Bundle 大小**: ~250KB (gzipped)
- 🖼️ **图片优化**: WebP + 多尺寸缩略图
- 💾 **缓存策略**: 静态资源永久缓存

## 🔧 高级用法

### 自定义图片处理

在 `packages/builder` 中添加自定义处理器。

详见 [AGENTS.md](./AGENTS.md)

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

Attribution Network License (ANL) v1.0 © 2025 Afilmory Team.

详见 [LICENSE](LICENSE)

## 🔗 相关链接

- [在线演示](https://afilmory.innei.in)
- [部署指南](./DEPLOY_STATIC.md)
- [架构文档](./AGENTS.md)
- [GitHub Issues](https://github.com/vsxd/afilmory-vercel/issues)
- [作者博客](https://innei.in)

## 💝 致谢

感谢所有贡献者和使用 Afilmory 的摄影爱好者们！

---

如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！
