# AGENTS - Afilmory 静态站点版本

## 项目概述

Afilmory 是一个现代化的照片展示站点生成器，专注于照片展示的用户体验。它将照片处理和前端构建整合为一个完整的静态站点生成流程。

## 核心理念

- **📸 照片优先**: 专注于照片展示的用户体验
- **⚡ 静态优先**: 无需数据库和后端服务器，使用 JSON Manifest 作为数据源
- **🚀 易于部署**: 专为 Vercel 优化，支持 S3 存储
- **🎨 现代设计**: Glassmorphic 设计系统，React 19 + Tailwind CSS 4

## 技术架构

### Monorepo 结构

项目使用 PNPM Workspace 管理多包结构：

- **根目录**: 包含整体构建脚本和配置
- **`apps/web`**: 前端 SPA 应用 (Vite + React)
- **`packages/builder`**: 核心照片处理逻辑 (Node.js)
- **`packages/data`**: 数据类型定义与 manifest 解析工具
- **`packages/ui`**: UI 组件库
- **`packages/webgl-viewer`**: 高性能图片查看器

### 关键依赖

- **构建工具**: Vite 7, TypeScript, TSX
- **前端框架**: React 19, React Router 7
- **样式方案**: Tailwind CSS 4, DaisyUI 5
- **状态管理**: Jotai, TanStack Query
- **图片处理**: Sharp, Heic-to (Node.js)
- **EXIF 处理**: ExifTool-vendored
- **地图组件**: MapLibre GL

## 模块功能详解

### 1. Builder (`@afilmory/builder`)
照片处理的核心引擎。
- **职责**: 扫描 S3/本地照片，提取 EXIF，生成缩略图，计算 Blurhash，输出 `generated/photos-manifest.json`。
- **关键技术**: 
    - `sharp`: 高性能图片处理
    - `exiftool-vendored`: 强大的 EXIF 数据提取
    - `heic-to`: HEIC 格式转换

### 2. Data (`@afilmory/data`)
数据层抽象，作为类型定义的中心。
- **职责**: 定义核心数据结构 (`PhotoManifestItem`, `PickedExif`) 并提供纯数据工具（如 manifest 解析）。
- **重要性**: 所有包共享的类型定义都在 `src/types.ts` 中，避免了循环依赖。

### 3. Web (`@afilmory/web`)
用户直接交互的前端应用。
- **构建**: 这是一个纯静态 SPA，构建时注入 `site.config.ts` 配置。
- **特性**: Masonry 布局，WebGL 查看器，PWA 支持，SSR (SSG) 友好的元数据注入。
- **运行时数据**: 构建阶段从 `generated/photos-manifest.json` 注入 `window.__MANIFEST__`，前端运行时不直接读取构建脚本目录。

## 软件工程重点关注点

### 1. 构建流程
- **两阶段构建**: 
    1. `pnpm build:manifest`: builder 运行，生成数据。
    2. `pnpm build:web`: vite 运行，打包前端。
- **职责划分**:
  - `pnpm build:manifest` 只负责生成 manifest 和缩略图。
  - `pnpm build:web` 只负责打包前端。
  - `pnpm build` 顺序执行以上两步。
- **增量构建**: Builder 支持基于 Hash 的增量更新，避免重复处理照片。

### 2. 类型安全
- 全面使用 TypeScript。
- **架构**: 所有共享类型定义集中在 `@afilmory/data/types`，实现了：
  - ✅ 类型定义单一来源
  - ✅ 消除循环依赖
  - ✅ 更好的类型复用

### 3. 配置管理
- **环境变量**: `.env` 用于敏感信息 (S3 Keys)。
- **静态配置**: `site.config.ts` 用于站点元数据。
- **构建注入**: 环境变量在构建时注入到前端，前端运行时不依赖 `process.env`。

### 4. 性能优化
- **图片加载**: 缩略图 -> 预览图 -> 原图 (渐进式加载)。
- **虚拟滚动**: 使用 `masonic` 处理大量照片的瀑布流。
- **WebGL**: 使用 WebGL 加速大图浏览。

## 快速开始

### 开发命令

```bash
# 安装依赖
pnpm install

# 本地开发（不处理照片）
pnpm dev

# 处理照片并生成 manifest
pnpm build:manifest

# 构建完整静态站点（处理照片 + 构建前端）
pnpm build

# 预览构建结果
pnpm preview
```

### 配置说明

#### 1. S3 存储配置
在 `.env` 文件中配置（参考 `.env.template`）：
```env
S3_BUCKET_NAME=your-bucket
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
```

#### 2. 站点配置
编辑 `site.config.ts` 或使用环境变量：
```typescript
export const siteConfig: SiteConfig = {
  name: '我的照片集',
  title: 'My Photos',
  description: '记录生活',
  url: 'https://your-site.vercel.app',
  author: { name: 'Your Name' }
}
```

### 部署

**Vercel 部署（推荐）**：
```bash
# 方式一：GitHub 集成（推荐）
git push origin main

# 方式二：CLI 部署
vercel --prod
```

**本地构建后部署**：
```bash
pnpm build
# 输出在 apps/web/dist，可部署到任何静态托管平台
```

## 常见问题

### 构建慢？
- 调整 `builder.config.ts` 中的 `defaultConcurrency` 参数
- 后续构建是增量的，只处理变更的照片

### 类型错误？
- 确保所有包的依赖都已安装：`pnpm install`
- 类型定义在 `@afilmory/data/types`，由 `exiftool-vendored` 提供支持

## 待改进项目 (架构债)

1. ~~**类型统一**: 将核心类型迁移到 `@afilmory/data`~~ ✅ 已完成
2. ~~**依赖解耦**: 解除循环依赖~~ ✅ 已完成
3. **Linting**: 统一各包的 ESLint 配置
