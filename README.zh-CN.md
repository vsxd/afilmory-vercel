# Afilmory Vercel

[English](./README.md) | 简体中文

<p align="center">
  <img src="docs/assets/afilmory-readme.webp" alt="Afilmory" width="100%" />
</p>

<p align="center">
  <strong>专为 S3 存储和 Vercel 部署优化的 Afilmory Fork 版本</strong>
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> •
  <a href="#-特性">特性</a> •
  <a href="#-部署">部署</a> •
  <a href="#-在线演示">在线演示</a>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel&env=S3_BUCKET_NAME,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_ENDPOINT,S3_PREFIX,S3_CUSTOM_DOMAIN,S3_EXCLUDE_REGEX,SITE_NAME,SITE_TITLE,SITE_DESCRIPTION,SITE_URL,SITE_ACCENT_COLOR,AUTHOR_NAME,AUTHOR_URL,AUTHOR_AVATAR,SOCIAL_GITHUB,SOCIAL_TWITTER,SOCIAL_RSS,FEED_FOLO_FEED_ID,FEED_FOLO_USER_ID,MAP_STYLE,MAP_PROJECTION&envDescription=S3%20存储配置与站点信息&envLink=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel%2Fblob%2Fmain%2FREADME.zh-CN.md%23-%E7%8E%AF%E5%A2%83%E5%8F%98%E9%87%8F%E9%85%8D%E7%BD%AE&project-name=my-afilmory&repository-name=my-afilmory">
    <img src="https://vercel.com/button" alt="Deploy with Vercel"/>
  </a>
</p>

---

## 📖 关于本项目

本项目是基于 [Afilmory](https://github.com/Afilmory/afilmory) 的修改版本，**专为 S3 兼容存储和 Vercel 静态部署优化**。

### 与原版的区别

- ✅ **仅支持 S3 存储** - 移除本地文件和 GitHub 存储支持，确保部署包体积最小
- ✅ **Vercel 优化** - 专门优化构建流程，完美适配 Vercel 免费版限制
- ✅ **简化配置** - 精简构建脚本和配置，降低使用门槛
- ✅ **一键部署** - 支持通过 Vercel 按钮一键部署

### 致谢

感谢 [Innei](https://innei.in) 和 Afilmory 团队创建了这个优秀的照片集生成器项目！

> 💡 如果你需要完整功能和最新功能，请使用[原版 Afilmory](https://github.com/Afilmory/afilmory)

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

## 🖥️ 截图

<p align="center">
  <img src="docs/assets/screenshot_0.webp" alt="screenshot_0" width="100%" />
</p>

<p align="center">
  <img src="docs/assets/screenshot_1.webp" alt="screenshot_1" width="100%" />
</p>

---

## 🎯 在线演示

- [Official Demo](https://afilmory.innei.in) - Afilmory 官方演示
- [Xudong's Lens](https://lens.misfork.com)
- [Gallery by mxte](https://gallery.mxte.cc)
- [Photography by pseudoyu](https://photography.pseudoyu.com)
- [Afilmory by magren](https://afilmory.magren.cc)

---

## 🚀 快速开始

### 一键部署到 Vercel

点击下方按钮，按照提示配置 S3 环境变量即可完成部署：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel&env=S3_BUCKET_NAME,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_ENDPOINT,S3_PREFIX,S3_CUSTOM_DOMAIN,S3_EXCLUDE_REGEX,SITE_NAME,SITE_TITLE,SITE_DESCRIPTION,SITE_URL,SITE_ACCENT_COLOR,AUTHOR_NAME,AUTHOR_URL,AUTHOR_AVATAR,SOCIAL_GITHUB,SOCIAL_TWITTER,SOCIAL_RSS,FEED_FOLO_FEED_ID,FEED_FOLO_USER_ID,MAP_STYLE,MAP_PROJECTION&envDescription=S3%20存储配置与站点信息&envLink=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel%2Fblob%2Fmain%2FREADME.zh-CN.md%23-%E7%8E%AF%E5%A2%83%E5%8F%98%E9%87%8F%E9%85%8D%E7%BD%AE&project-name=my-afilmory&repository-name=my-afilmory)

**部署步骤：**
1. 点击上方 "Deploy with Vercel" 按钮
2. 登录你的 Vercel 账户
3. Fork 项目到你的 GitHub
4. 配置必需的环境变量（见下方 [环境变量配置](#-环境变量配置)）
5. 点击 Deploy 开始部署
6. 等待构建完成（首次构建约 5-10 分钟）

---

## ⚙️ 环境变量配置

> **💡 推荐做法**：为了方便部署和个性化配置，**强烈建议通过环境变量配置所有个性化信息**。

### 配置优先级

环境变量 > `site.config.ts` 默认值

这意味着：
- ✅ 如果设置了环境变量，将优先使用环境变量的值
- ✅ 如果没有设置环境变量，则使用 `site.config.ts` 中的默认配置

### 必需配置 (S3 存储)

项目**仅支持 S3 存储**，以下环境变量为必填：

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `S3_BUCKET_NAME` | S3 存储桶名称 | `my-photos` |
| `S3_REGION` | S3 区域 | `us-east-1` |
| `S3_ACCESS_KEY_ID` | S3 访问密钥 ID | `AKIAIOSFODNN7EXAMPLE` |
| `S3_SECRET_ACCESS_KEY` | S3 访问密钥 Secret | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |

### 可选配置 (S3 高级选项)

| 环境变量 | 说明 | 默认值 | 示例 |
|---------|------|--------|------|
| `S3_ENDPOINT` | S3 服务端点 | `https://s3.us-east-1.amazonaws.com` | `https://oss-cn-hangzhou.aliyuncs.com` |
| `S3_PREFIX` | 照片路径前缀 | 空 | `photos/` |
| `S3_CUSTOM_DOMAIN` | 自定义 CDN 域名 | 空 | `https://cdn.example.com` |
| `S3_EXCLUDE_REGEX` | 排除文件的正则表达式 | 空 | `.*\.txt$` |

### 推荐配置 (站点信息)

**强烈建议通过环境变量配置**，这样在 Vercel 等平台上可以直接在 Dashboard 修改，无需重新部署代码：

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `SITE_NAME` | 站点名称 | `My Photo Gallery` |
| `SITE_TITLE` | 站点标题 | `My Photo Gallery` |
| `SITE_DESCRIPTION` | 站点描述 | `Capturing beautiful moments in life` |
| `SITE_URL` | 站点 URL | `https://your-site.vercel.app` |
| `SITE_ACCENT_COLOR` | 主题色 | `#007bff` |

### 推荐配置 (作者信息)

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `AUTHOR_NAME` | 作者名称 | `Your Name` |
| `AUTHOR_URL` | 作者网站 | `https://your-website.com` |
| `AUTHOR_AVATAR` | 作者头像 URL | `https://avatar-url.com/avatar.png` |

### 可选配置 (社交媒体)

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `SOCIAL_GITHUB` | GitHub 用户名 | `your-github-username` |
| `SOCIAL_TWITTER` | Twitter 用户名 | `your-twitter-username` |
| `SOCIAL_RSS` | 是否启用 RSS | `true` 或 `false` |

### 可选配置 (Feed)

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `FEED_FOLO_FEED_ID` | Folo Feed ID | `your-feed-id` |
| `FEED_FOLO_USER_ID` | Folo User ID | `your-user-id` |

### 可选配置 (地图)

| 环境变量 | 说明 | 默认值 | 可选值 |
|---------|------|--------|--------|
| `MAP_STYLE` | 地图样式 | `builtin` | `builtin` 或自定义 URL |
| `MAP_PROJECTION` | 地图投影 | `mercator` | `globe` 或 `mercator` |

### 配置示例

#### 在 Vercel 中配置

1. 进入你的项目 Dashboard
2. 点击 "Settings" → "Environment Variables"
3. 添加以上环境变量
4. 保存后会自动触发重新部署

#### 本地开发配置

创建 `.env` 文件：

```bash
cp .env.template .env
```

编辑 `.env` 文件，填写你的配置：

```bash
# S3 存储(必填)
S3_BUCKET_NAME=my-photos
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key

# 站点信息(推荐配置)
SITE_NAME=My Photo Gallery
SITE_TITLE=My Photo Gallery
SITE_DESCRIPTION=Capturing beautiful moments in life
SITE_URL=https://your-site.vercel.app

# 作者信息(推荐配置)
AUTHOR_NAME=Your Name
AUTHOR_URL=https://your-website.com
AUTHOR_AVATAR=https://avatar-url.com/avatar.png

# 社交媒体(可选)
SOCIAL_GITHUB=your-github-username
SOCIAL_RSS=true
```

---

## 💻 本地开发

### 前置要求

- Node.js 18+
- pnpm 10+
- S3 兼容对象存储（必需）

### 安装

```bash
# 克隆仓库
git clone https://github.com/vsxd/afilmory-vercel.git
cd afilmory-vercel

# 安装依赖
pnpm install
```

### 准备 S3 存储并上传照片

将你的照片上传到 S3 兼容的对象存储中，支持以下格式：
- JPG / JPEG
- PNG
- HEIC (Apple 设备)
- TIFF
- Live Photos (iPhone)

**重要提示：本项目仅支持 S3 兼容存储，照片不会被打包到部署产物中。**

### 构建和预览

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
3. 配置环境变量（见 [环境变量配置](#-环境变量配置)）
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

```text
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
├── site.config.ts             # ⚙️ 站点默认配置
├── site.config.build.ts       # ⚙️ 构建时配置注入
├── builder.config.ts          # ⚙️ 构建配置
└── vercel.json                # 📦 Vercel 部署配置
```

---

## 🎨 自定义

### 修改主题色

编辑 `site.config.ts`:

```typescript
export const siteConfig: SiteConfig = {
  // ...
  accentColor: '#ff6b6b',
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

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目基于 [Afilmory](https://github.com/Afilmory/Afilmory) 修改，遵循原项目的许可证：

**Attribution Network License (ANL) v1.0**

- **Library Code**: MIT License
- **Project Code**: AGPL-3.0-or-later with UI attribution requirement

详见 [LICENSE](LICENSE)

---

## 🔗 相关链接

- **原版 Afilmory**: [github.com/Afilmory/Afilmory](https://github.com/Afilmory/Afilmory)
- **在线演示**: [afilmory.innei.in](https://afilmory.innei.in)
- **静态部署指南**: [DEPLOY_STATIC.md](./DEPLOY_STATIC.md)
- **问题反馈**: [GitHub Issues](https://github.com/vsxd/afilmory-vercel/issues)
- **原项目作者博客**: [innei.in](https://innei.in)

---

## 💝 致谢

- 感谢 [Innei](https://innei.in) 和 Afilmory 团队创建了这个优秀的项目
- 感谢所有使用本项目的摄影爱好者
- 感谢所有开源贡献者

---

<p align="center">
  <sub>如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！</sub>
</p>


