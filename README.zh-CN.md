# Afilmory Vercel

[English](./README.md) | 简体中文

<p align="center">
  <img src="docs/assets/afilmory-readme.webp" alt="Afilmory" width="100%" />
</p>

<p align="center">
  <strong>专为 S3 兼容照片存储和 Vercel 静态部署优化的 Afilmory 分支</strong>
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

本项目基于 [Afilmory](https://github.com/Afilmory/afilmory) 修改，聚焦 S3 兼容照片存储和静态站点部署。原图保留在 S3 或兼容对象存储中；构建过程生成静态 Web 应用、缩略图、RSS、sitemap、Open Graph 图片和 JSON 照片 manifest。

### 与上游项目的区别

- ✅ **S3 优先的静态部署** - 默认站点配置只使用 S3 兼容存储作为照片来源。
- ✅ **面向 Vercel 的构建** - `vercel.json` 运行 `scripts/build-static.sh`，输出目录为 `apps/web/dist`。
- ✅ **Manifest 驱动运行时** - 浏览器读取构建生成的 JSON 数据，不需要数据库或后端服务。
- ✅ **可选远程元数据缓存** - `REPO_URL` 和 `REPO_TOKEN` 可在 CI 构建之间复用 manifest 与缩略图。
- ✅ **一键部署** - Vercel Deploy 按钮已配置必需的 S3 环境变量。

### 致谢

感谢 [Innei](https://innei.in) 和 Afilmory 团队创建了这个优秀的照片集生成器项目。

> 💡 如果你需要完整的上游功能和最新上游更新，请使用[原版 Afilmory](https://github.com/Afilmory/afilmory)。

---

## 🌟 特性

### 核心功能

- 🖼️ **高性能 WebGL 渲染器** - React 19 WebGL 查看器，支持流畅缩放、平移、分块加载和错误回调。
- 📱 **响应式瀑布流布局** - 基于 Masonic，适合大量照片虚拟滚动。
- 🎨 **现代 UI 设计** - 使用 Tailwind CSS 4、Radix UI 和 Motion 构建毛玻璃风格界面。
- ⚡ **增量构建** - 未变化照片会复用已有 manifest 数据、缩略图、EXIF 和影调分析。
- 🌐 **国际化** - 语言资源来自 `locales/app/*.json`。
- 🔗 **静态社交资源** - 构建时生成 Open Graph 图片、`feed.xml` 和 `sitemap.xml`。

### 图片处理

- 🔄 **HEIC/HEIF/HIF 支持** - Apple 格式会在处理阶段转换。
- 📷 **TIFF/TIF、WebP、BMP、PNG、JPG/JPEG 支持** - 支持扩展名定义在 `packages/builder/src/constants/index.ts`。
- 🖼️ **生成缩略图** - 缩略图写入 `apps/web/public/thumbnails` 并进入静态产物。
- 📊 **EXIF 展示** - Builder 使用 `exiftool-vendored` 提取元数据，前端查看器可展示。
- 🌈 **ThumbHash 占位图** - manifest 中的 `thumbHash` 用于渐进式加载占位。
- 📱 **Live Photo 和 Motion Photo 支持** - 独立视频文件和嵌入式 Motion Photo 元数据都会记录为视频来源。
- ☀️ **HDR 元数据支持** - 可检测 Ultra HDR gain map 元数据。

### 存储与运行时

- ☁️ **S3 兼容照片源** - 支持 AWS S3、MinIO、阿里云 OSS、腾讯云 COS 等 S3 兼容服务。
- 🌍 **CDN 友好 URL** - 可通过 `S3_CUSTOM_DOMAIN` 生成公开照片 URL。
- 📦 **原图不打包** - 原图保留在对象存储中，部署产物只包含生成缩略图和 Web 资源。
- 🚀 **静态 SPA 运行时** - 生产构建默认输出外置 `assets/photos-manifest.<hash>.json`，通过 `window.__AFILMORY__.manifest` 加载。

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

点击下方按钮，并按提示配置 S3 相关环境变量：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel&env=S3_BUCKET_NAME,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_ENDPOINT,S3_PREFIX,S3_CUSTOM_DOMAIN,S3_EXCLUDE_REGEX,SITE_NAME,SITE_TITLE,SITE_DESCRIPTION,SITE_URL,SITE_ACCENT_COLOR,AUTHOR_NAME,AUTHOR_URL,AUTHOR_AVATAR,SOCIAL_GITHUB,SOCIAL_TWITTER,SOCIAL_RSS,FEED_FOLO_FEED_ID,FEED_FOLO_USER_ID,MAP_STYLE,MAP_PROJECTION&envDescription=S3%20存储配置与站点信息&envLink=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel%2Fblob%2Fmain%2FREADME.zh-CN.md%23-%E7%8E%AF%E5%A2%83%E5%8F%98%E9%87%8F%E9%85%8D%E7%BD%AE&project-name=my-afilmory&repository-name=my-afilmory)

**部署步骤：**

1. 点击上方部署按钮。
2. 登录 Vercel，并 fork/import 仓库。
3. 配置必需的 S3 变量。
4. 点击 **Deploy**。
5. Vercel 构建会运行 `scripts/build-static.sh`；S3 凭据完整时执行完整构建。

---

## ⚙️ 环境变量配置

构建时，`site.config.build.ts` 会把环境变量覆盖合并到 `site.config.ts` 默认值中。浏览器端通过 `window.__AFILMORY__.config` 获取最终配置，不在运行时读取 `process.env`。

### S3 照片源必填项

默认静态站点配置只支持 S3 兼容照片源。Builder 刷新 manifest 时需要以下变量：

| 环境变量               | 说明               | 示例                                       |
| ---------------------- | ------------------ | ------------------------------------------ |
| `S3_BUCKET_NAME`       | S3 存储桶名称      | `my-photos`                                |
| `S3_ACCESS_KEY_ID`     | S3 访问密钥 ID     | `AKIAIOSFODNN7EXAMPLE`                     |
| `S3_SECRET_ACCESS_KEY` | S3 访问密钥 Secret | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |

### S3 可选项

| 环境变量           | 说明                 | 默认值                               | 示例                                   |
| ------------------ | -------------------- | ------------------------------------ | -------------------------------------- |
| `S3_REGION`        | S3 区域              | `us-east-1`                          | `us-west-2`                            |
| `S3_ENDPOINT`      | S3 服务端点          | `https://s3.us-east-1.amazonaws.com` | `https://oss-cn-hangzhou.aliyuncs.com` |
| `S3_PREFIX`        | 照片路径前缀         | 空                                   | `photos/`                              |
| `S3_CUSTOM_DOMAIN` | 自定义 CDN 域名      | 空                                   | `https://cdn.example.com`              |
| `S3_EXCLUDE_REGEX` | 排除文件的正则表达式 | 空                                   | `.*\.txt$`                             |

### 可选 CI 元数据缓存

| 环境变量           | 说明                                                          |
| ------------------ | ------------------------------------------------------------- |
| `REPO_URL`         | 用于缓存生成的 `photos-manifest.json` 和缩略图的 Git 仓库地址 |
| `REPO_TOKEN`       | 缓存同步插件推送更新时使用的 token                            |
| `BUILDER_REPO_URL` | `REPO_URL` 的兼容别名                                         |
| `GIT_TOKEN`        | `REPO_TOKEN` 的兼容别名                                       |

这个缓存不是照片存储后端，原始照片仍来自 S3。

### 站点配置

| 环境变量            | 说明     | 示例                                  |
| ------------------- | -------- | ------------------------------------- |
| `SITE_NAME`         | 站点名称 | `My Photo Gallery`                    |
| `SITE_TITLE`        | 站点标题 | `My Photo Gallery`                    |
| `SITE_DESCRIPTION`  | 站点描述 | `Capturing beautiful moments in life` |
| `SITE_URL`          | 站点 URL | `https://your-site.vercel.app`        |
| `SITE_ACCENT_COLOR` | 主题色   | `#007bff`                             |

| 环境变量        | 说明         | 示例                        |
| --------------- | ------------ | --------------------------- |
| `AUTHOR_NAME`   | 作者名称     | `Your Name`                 |
| `AUTHOR_URL`    | 作者网站     | `https://your-website.com`  |
| `AUTHOR_AVATAR` | 作者头像 URL | `https://example.com/a.png` |

| 环境变量         | 说明           | 示例                    |
| ---------------- | -------------- | ----------------------- |
| `SOCIAL_GITHUB`  | GitHub 用户名  | `your-github-username`  |
| `SOCIAL_TWITTER` | Twitter/X 用户 | `your-twitter-username` |
| `SOCIAL_RSS`     | 是否显示 RSS   | `true` 或 `false`       |

| 环境变量            | 说明         | 示例           |
| ------------------- | ------------ | -------------- |
| `FEED_FOLO_FEED_ID` | Folo Feed ID | `your-feed-id` |
| `FEED_FOLO_USER_ID` | Folo User ID | `your-user-id` |

| 环境变量         | 说明     | 默认值     | 可选值                 |
| ---------------- | -------- | ---------- | ---------------------- |
| `MAP_STYLE`      | 地图样式 | `builtin`  | `builtin` 或自定义 URL |
| `MAP_PROJECTION` | 地图投影 | `mercator` | `globe` 或 `mercator`  |

### 本地 `.env`

```bash
cp .env.template .env
```

示例：

```bash
S3_BUCKET_NAME=my-photos
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key

SITE_NAME=My Photo Gallery
SITE_TITLE=My Photo Gallery
SITE_DESCRIPTION=Capturing beautiful moments in life
SITE_URL=https://your-site.vercel.app

AUTHOR_NAME=Your Name
AUTHOR_URL=https://your-website.com
AUTHOR_AVATAR=https://example.com/avatar.png

SOCIAL_GITHUB=your-github-username
SOCIAL_RSS=true
```

---

## 💻 本地开发

### 前置要求

- Node.js `^20.19.0 || >=22.12.0`（Vite 7 要求）
- pnpm 10.19.0
- 用于刷新 manifest 的 S3 兼容对象存储

### 安装依赖

```bash
git clone https://github.com/vsxd/afilmory-vercel.git
cd afilmory-vercel
pnpm install
```

### 准备 S3 并上传照片

将照片上传到 S3 兼容对象存储。支持的图片扩展名包括 `.jpg`、`.jpeg`、`.png`、`.webp`、`.bmp`、`.tiff`、`.tif`、`.heic`、`.heif` 和 `.hif`。

原始照片不会被打包进 `apps/web/dist`；manifest 指向 S3/CDN URL，构建产物包含生成的缩略图。

### 构建和预览

```bash
# 开发服务器。会先运行 precheck。
pnpm dev

# 完整静态构建：precheck、包构建、Vite Web 构建。
pnpm build

# 只刷新 manifest 和缩略图。
pnpm build:manifest

# 使用已有 manifest 只构建前端。
pnpm build:web

# 本地预览 apps/web/dist。
pnpm preview
```

运行 `pnpm preview` 后打开 http://localhost:4173。

### Manifest 构建行为

- `pnpm dev` 和 `pnpm build` 会先运行 `apps/web/scripts/precheck.ts`。
- S3 凭据完整时，precheck 会通过 builder 刷新 manifest。
- 缺少 S3 凭据但存在 `generated/photos-manifest.json` 时，precheck 会复用已有 manifest。
- builder 失败但已有 manifest 存在时，precheck 会降级复用该 manifest 并输出警告。
- `SKIP_MANIFEST_BUILD=true pnpm build` 会显式跳过 builder 刷新。
- 生产 Web 构建默认输出外置带 hash 的 manifest 资产；可用 `AFILMORY_EMBED_MANIFEST=true` 强制内联，或用 `false` 强制外置。

### Manifest CLI 选项

```bash
pnpm build:manifest -- --force
pnpm build:manifest -- --force-thumbnails
pnpm build:manifest -- --force-manifest
```

---

## 📦 部署

### 部署到 Vercel

Vercel 使用：

- **构建命令：** `sh scripts/build-static.sh`
- **输出目录：** `apps/web/dist`

S3 凭据完整时，`scripts/build-static.sh` 会运行 `pnpm build`。缺少 S3 凭据但存在可复用 `generated/photos-manifest.json` 时，它会运行 `pnpm build:web`，让 Preview 部署仍可成功。

### 其他静态托管平台

可以把 `apps/web/dist` 部署到任何静态托管平台：

- Cloudflare Pages
- Netlify
- GitHub Pages
- 任意支持 SPA fallback 到 `index.html` 的静态托管服务

构建命令使用 `pnpm build`。

---

## 🔄 更新照片

1. 将新增或修改后的照片上传到 S3 bucket。
2. 触发一次新部署，或运行 `pnpm build:manifest`。
3. Builder 会对比源对象元数据和已有 manifest，尽量只处理变化部分。

---

## 🏗️ 技术栈

### 前端

- React 19 与 React Compiler
- TypeScript 5.9
- Vite 7
- Tailwind CSS 4
- Radix UI
- Motion
- Jotai
- TanStack Query
- React Router 7
- i18next 与 react-i18next
- MapLibre GL 与 react-map-gl

### 构建系统

- Node.js
- pnpm workspace
- Sharp：图片处理和 Open Graph 图片生成
- exiftool-vendored：EXIF 提取
- AWS SDK v3：S3 访问
- Worker threads 或 cluster workers：并发处理
- thumbhash：紧凑图片占位符

---

## 📁 项目结构

```text
afilmory/
├── apps/
│   └── web/                   # 前端 SPA 应用
├── packages/
│   ├── builder/               # 照片处理与 manifest builder
│   ├── data/                  # 共享 manifest 类型和解析工具
│   ├── ui/                    # 共享 UI 基元与 hooks
│   └── webgl-viewer/          # WebGL 图片查看器包
├── docs/
│   ├── assets/                # README 图片
│   └── rss-exif-extension.md  # RSS EXIF 扩展说明
├── generated/                 # 生成的 photos-manifest.json
├── locales/app/               # i18n JSON 资源
├── scripts/                   # 构建期辅助脚本
├── site.config.ts             # 浏览器安全的站点默认值
├── site.config.build.ts       # 构建期环境变量合并
├── builder.config.ts          # S3-backed builder 配置
└── vercel.json                # 静态部署配置
```

---

## 🎨 自定义

### 修改主题色

使用 `SITE_ACCENT_COLOR`，或编辑 `site.config.ts`：

```typescript
export const siteConfig: SiteConfig = {
  // ...
  accentColor: "#ff6b6b",
};
```

### 添加地图样式

使用 `MAP_STYLE` 和 `MAP_PROJECTION`，或编辑 `site.config.ts`：

```typescript
export const siteConfig: SiteConfig = {
  // ...
  map: ["maplibre"],
  mapStyle: "https://your-map-style.json",
  mapProjection: "globe",
};
```

### 国际化

语言文件位于 `locales/app/*.json`。添加新语言：

1. 在 `locales/app` 下添加新的 JSON 文件。
2. 在 `apps/web/src/@types/resources.ts` 导入并注册资源。
3. 在 `apps/web/src/@types/constants.ts` 添加语言代码。

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议。

请查看 [贡献指南](docs/CONTRIBUTING.md)，了解环境准备、常用命令、manifest 说明和 PR 验证要求。

---

## 📄 许可证

本项目基于 [Afilmory](https://github.com/Afilmory/Afilmory) 修改，遵循原项目的许可证：

**Attribution Network License (ANL) v1.0**

- **Library code**: MIT
- **Project code**: AGPL-3.0-or-later with UI attribution requirement

详见 [LICENSE](LICENSE)。

---

## 🔗 相关链接

- **原版 Afilmory**: [github.com/Afilmory/Afilmory](https://github.com/Afilmory/Afilmory)
- **在线演示**: [afilmory.innei.in](https://afilmory.innei.in)
- **问题反馈**: [GitHub Issues](https://github.com/vsxd/afilmory-vercel/issues)
- **原项目作者博客**: [innei.in](https://innei.in)

---

## 💝 致谢

- 感谢 [Innei](https://innei.in) 和 Afilmory 团队创建原项目。
- 感谢所有使用本项目的摄影爱好者。
- 感谢所有开源贡献者。

<p align="center">
  <sub>如果这个项目对你有帮助，欢迎给个 Star 支持。</sub>
</p>
