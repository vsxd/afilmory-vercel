# Afilmory Vercel

<p align="center">
  <strong>专为 S3 存储和 Vercel 部署优化的 Afilmory Fork版本</strong>
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> •
  <a href="#-特性">特性</a> •
  <a href="#-部署">部署</a> •
  <a href="#-在线演示">在线演示</a>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory&env=S3_BUCKET_NAME,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY&envDescription=S3%20存储配置信息&envLink=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory%23配置&project-name=my-afilmory&repository-name=my-afilmory">
    <img src="https://vercel.com/button" alt="Deploy with Vercel"/>
  </a>
</p>

---

## 📖 关于本项目

本项目是基于 [Afilmory](https://github.com/Innei/Afilmory) 的修改版本，**专为 S3 兼容存储和 Vercel 静态部署优化**。

### 与原版的区别

- ✅ **仅支持 S3 存储** - 移除本地文件和 GitHub 存储支持，确保部署包体积最小
- ✅ **Vercel 优化** - 专门优化构建流程，完美适配 Vercel 免费版限制
- ✅ **简化配置** - 精简构建脚本和配置，降低使用门槛
- ✅ **一键部署** - 支持通过 Vercel 按钮一键部署

### 致谢

感谢 [Innei](https://innei.in) 和 Afilmory 团队创建了这个优秀的照片集生成器项目！

> 💡 如果你需要完整功能（本地存储、GitHub 存储等），请使用[原版 Afilmory](https://github.com/Innei/Afilmory)

---

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
- 📷 **图片分享** - 分享到社交媒体或嵌入网站
- 🗺️ **交互式地图** - 使用 MapLibre 展示带 GPS 坐标的照片

### S3 存储特性

- ☁️ **S3 兼容存储** - 支持 AWS S3、MinIO、阿里云 OSS、腾讯云 COS 等
- 🌍 **CDN 加速** - 支持自定义 CDN 域名
- 📦 **零打包** - 照片不会被打包到部署产物中
- 🚀 **快速部署** - 构建产物体积小，适合静态托管平台

---

## 🎯 在线演示

- [Official Demo](https://afilmory.innei.in) - Afilmory 官方演示
- [Gallery by mxte](https://gallery.mxte.cc)
- [Photography by pseudoyu](https://photography.pseudoyu.com)
- [Afilmory by magren](https://afilmory.magren.cc)

---

## 🚀 快速开始

### 方式一：一键部署到 Vercel（推荐）

点击下方按钮，按照提示配置 S3 环境变量即可完成部署：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory&env=S3_BUCKET_NAME,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY&envDescription=S3%20存储配置信息&envLink=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory%23配置&project-name=my-afilmory&repository-name=my-afilmory)

**部署步骤：**
1. 点击上方 "Deploy with Vercel" 按钮
2. 登录你的 Vercel 账户
3. Fork 项目到你的 GitHub
4. 配置必需的环境变量（见下方 [环境变量配置](#环境变量配置)）
5. 点击 Deploy 开始部署
6. 等待构建完成（首次构建约 5-10 分钟）

### 方式二：本地开发

#### 前置要求

- Node.js 18+
- pnpm 10+
- S3 兼容对象存储（必需）

#### 安装

```bash
# 克隆仓库
git clone https://github.com/vsxd/afilmory.git
cd afilmory

# 安装依赖
pnpm install
```

#### 配置

##### 1. 准备 S3 存储并上传照片

将你的照片上传到 S3 兼容的对象存储中，支持以下格式：
- JPG / JPEG
- PNG
- HEIC (Apple 设备)
- TIFF
- Live Photos (iPhone)

**重要提示：本项目仅支持 S3 兼容存储，照片不会被打包到部署产物中。**

##### 2. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.template .env
```

填写你的 S3 配置：

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
```

##### 3. 配置站点信息（可选）

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

#### 构建和预览

```bash
# 完整构建（处理照片 + 构建前端）
pnpm build

# 本地预览
pnpm preview
```

打开 http://localhost:4173 预览你的照片站点！

---

## 📦 部署

### 部署到 Vercel（推荐）

#### 选项 A：使用 Deploy 按钮

直接点击本文档开头的 "Deploy with Vercel" 按钮进行一键部署。

#### 选项 B：从 GitHub 导入

1. 将项目推送到你的 GitHub 仓库
2. 访问 [vercel.com](https://vercel.com) 并导入项目
3. 配置环境变量（见 [环境变量配置](#环境变量配置)）
4. 点击 "Deploy"
5. 每次推送到 `main` 分支自动重新部署

#### 选项 C：使用 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 确保本地 .env 文件已配置
# 部署到生产环境
vercel --prod
```

### 部署到其他静态托管平台

项目支持静态站点部署，构建产物位于 `apps/web/dist` 目录。你可以将构建后的静态文件部署到：

- **Cloudflare Pages**
- **Netlify**
- **GitHub Pages**
- **任何支持静态托管的平台**

**构建命令：** `pnpm build`
**输出目录：** `apps/web/dist`

详见 [静态部署指南](./DEPLOY_STATIC.md)

---

## ⚙️ 配置

### 环境变量配置

项目**仅支持 S3 存储**，以下环境变量为必填：

| 环境变量 | 说明 | 必填 | 示例 |
|---------|------|------|------|
| `S3_BUCKET_NAME` | S3 存储桶名称 | ✅ | `my-photos` |
| `S3_REGION` | S3 区域 | ✅ | `us-east-1` |
| `S3_ACCESS_KEY_ID` | S3 访问密钥 ID | ✅ | `AKIAIOSFODNN7EXAMPLE` |
| `S3_SECRET_ACCESS_KEY` | S3 访问密钥 Secret | ✅ | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `S3_ENDPOINT` | S3 服务端点 | ❌ | `https://s3.us-east-1.amazonaws.com` |
| `S3_PREFIX` | 照片路径前缀 | ❌ | `photos/` |
| `S3_CUSTOM_DOMAIN` | 自定义 CDN 域名 | ❌ | `https://cdn.example.com` |
| `S3_EXCLUDE_REGEX` | 排除文件的正则表达式 | ❌ | `.*\.txt$` |

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

### 构建配置 (`builder.config.ts`)

配置文件已预设为 S3 模式，通常无需修改。如需调整并发数、缩略图尺寸等，可以编辑此文件：

```typescript
export default defineBuilderConfig(() => ({
  storage: {
    provider: 's3',
    bucket: env.S3_BUCKET_NAME,
    region: env.S3_REGION,
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

---

## 📋 CLI 命令

### 开发命令

```bash
# 开发模式（不处理照片，使用已有 manifest）
pnpm dev

# 完整构建（处理照片 + 构建前端）
pnpm build

# 只处理照片生成 manifest
pnpm build:manifest

# 只构建前端应用
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

---

## 🔄 更新照片

### 添加新照片

1. 将新照片上传到 S3 存储桶
2. 推送代码到 GitHub（触发 Vercel 自动部署）或运行 `vercel --prod`
3. Vercel 会自动重新构建并部署

增量构建会自动检测 S3 中新增/修改的照片，只处理变更部分。

---

## 🏗️ 技术栈

### 前端

- **React 19** - 包含 React Compiler
- **TypeScript** - 类型安全
- **Vite 7** - 构建工具
- **Tailwind CSS 4** - 样式框架
- **Radix UI** - 无障碍组件
- **Jotai** - 状态管理
- **TanStack Query** - 数据获取
- **React Router 7** - 路由
- **i18next** - 国际化

### 构建系统

- **Node.js** - 运行时
- **Sharp** - 图片处理
- **AWS SDK** - S3 操作
- **Worker Threads** - 并发处理
- **EXIF-Reader** - EXIF 提取

### 存储

支持的 S3 兼容服务：
- **AWS S3** - Amazon S3
- **MinIO** - 开源对象存储
- **阿里云 OSS** - 阿里云对象存储
- **腾讯云 COS** - 腾讯云对象存储
- 其他 S3 兼容服务

---

## 📁 项目结构

```
afilmory/
├── apps/
│   └── web/                   # 🎨 前端 SPA 应用
├── packages/
│   ├── builder/               # 🔨 照片处理工具
│   ├── webgl-viewer/          # 🖼️ WebGL 查看器
│   ├── data/                  # 📊 数据层
│   ├── ui/                    # 🎨 UI 组件
│   ├── hooks/                 # ⚓ React Hooks
│   └── utils/                 # 🔧 工具函数
├── config.json                # ⚙️ 站点配置
├── builder.config.ts          # ⚙️ 构建配置
└── vercel.json                # 📦 Vercel 部署配置
```

---

## 🎨 自定义

### 修改主题色

编辑 `config.json`:

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

---

## 📊 性能

- ⚡ **Lighthouse 评分**: 95+
- 🎯 **首屏加载**: < 1s
- 📦 **Bundle 大小**: ~250KB (gzipped)
- 🖼️ **图片优化**: WebP + 多尺寸缩略图
- 💾 **缓存策略**: 静态资源永久缓存

---

## ❓ 常见问题

<details>
<summary><strong>Q: 为什么只支持 S3 存储？</strong></summary>

本项目专为 Vercel 部署优化。Vercel 免费版对部署包大小有限制，使用 S3 存储可以：
- 避免将大量照片打包到部署产物中
- 利用 CDN 加速照片访问
- 降低构建时间和成本

如需本地存储或 GitHub 存储，请使用 [原版 Afilmory](https://github.com/Innei/Afilmory)。
</details>

<details>
<summary><strong>Q: 支持哪些 S3 兼容服务？</strong></summary>

支持所有兼容 AWS S3 API 的对象存储服务，包括：
- AWS S3
- MinIO
- 阿里云 OSS
- 腾讯云 COS
- Backblaze B2
- Wasabi
- 等等...
</details>

<details>
<summary><strong>Q: 如何配置 CDN 加速？</strong></summary>

在环境变量中设置 `S3_CUSTOM_DOMAIN`：

```bash
S3_CUSTOM_DOMAIN=https://cdn.example.com
```

然后在你的 CDN 服务商（如 Cloudflare）配置回源到 S3。
</details>

<details>
<summary><strong>Q: 部署后看不到照片？</strong></summary>

检查以下几点：
1. S3 配置是否正确（bucket name、region、credentials）
2. S3 bucket 是否有照片文件
3. 照片格式是否支持（JPG/PNG/HEIC/TIFF）
4. Vercel 环境变量是否正确配置
5. 查看 Vercel 构建日志是否有错误
</details>

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目基于 [Afilmory](https://github.com/Innei/Afilmory) 修改，遵循原项目的许可证：

**Attribution Network License (ANL) v1.0**

- **Library Code**: MIT License
- **Project Code**: AGPL-3.0-or-later with UI attribution requirement

详见 [LICENSE](LICENSE)

---

## 🔗 相关链接

- **原版 Afilmory**: [github.com/Innei/Afilmory](https://github.com/Innei/Afilmory)
- **在线演示**: [afilmory.innei.in](https://afilmory.innei.in)
- **静态部署指南**: [DEPLOY_STATIC.md](./DEPLOY_STATIC.md)
- **问题反馈**: [GitHub Issues](https://github.com/vsxd/afilmory/issues)
- **作者博客**: [innei.in](https://innei.in)

---

## 💝 致谢

- 感谢 [Innei](https://innei.in) 和 Afilmory 团队创建了这个优秀的项目
- 感谢所有使用本项目的摄影爱好者
- 感谢所有开源贡献者

---

<p align="center">
  <sub>如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！</sub>
</p>