# AGENTS - Afilmory 静态站点版本

## 项目概述

Afilmory Vercel 是一个照片优先的静态站点生成器。Builder 在构建期从 S3 兼容对象存储读取照片，生成 `generated/photos-manifest.json` 和缩略图；前端是 Vite + React SPA，通过构建注入的 manifest 与站点配置运行，不依赖数据库或运行时后端。

## 核心理念

- **照片优先**: 以照片浏览、查看器、EXIF、地图和分享体验为核心。
- **静态优先**: 运行时数据来自 JSON manifest 和静态资源。
- **S3 优先**: 默认站点配置只支持 S3 兼容对象存储作为原图来源。
- **易于部署**: 面向 Vercel，也可部署到任意静态托管平台。
- **现代前端**: React 19、Vite 7、Tailwind CSS 4、Radix UI、Motion。

## Monorepo 结构

项目使用 PNPM Workspace：

- **根目录**: 统一脚本、`builder.config.ts`、`site.config.ts`、`site.config.build.ts`、`vercel.json`、根 ESLint flat config。
- **`apps/web`**: 前端 SPA 应用，Vite + React。
- **`packages/builder`**: 构建期照片处理、EXIF、缩略图、manifest、插件和 S3 访问。
- **`packages/data`**: 共享类型、manifest 解析和二进制工具。
- **`packages/ui`**: 共享 UI 组件、hooks、portal、scroll area、ThumbHash 组件。
- **`packages/webgl-viewer`**: WebGL 图片查看器包。
- **`locales/app`**: i18n JSON 资源。
- **`generated`**: 生成的 `photos-manifest.json`。

## 关键依赖

- **构建工具**: Vite 7、TypeScript 5.9、TSX、tsdown。
- **前端框架**: React 19、React Router 7。
- **样式与 UI**: Tailwind CSS 4、Radix UI、Motion。
- **状态管理**: Jotai、Zustand、TanStack Query。
- **图片处理**: Sharp、heic-to、heic-convert、thumbhash。
- **EXIF 处理**: `exiftool-vendored`，前端 raw EXIF 查看使用 `@uswriting/exiftool`。
- **地图组件**: MapLibre GL、react-map-gl。

## 模块功能

### Builder (`@afilmory/builder`)

职责：

- 扫描 S3 兼容对象存储中的图片。
- 提取 EXIF、检测 Live Photo/Motion Photo/HDR metadata。
- 生成 600px 宽 JPEG 缩略图和 `thumbHash` 占位数据。
- 计算影调分析、维护相机和镜头索引。
- 输出 `generated/photos-manifest.json`，缩略图输出到 `apps/web/public/thumbnails`。

当前默认站点配置在 `builder.config.ts` 中使用 `provider: "s3"`。源码中仍存在插件/扩展点，但项目文档和部署路径只面向 S3。

### Data (`@afilmory/data`)

职责：

- 定义 `AfilmoryManifest`、`PhotoManifestItem`、`PickedExif` 等共享类型。
- 提供 `parseManifest`、`createEmptyManifest` 和 `u8array` 压缩/解压工具。
- 作为 web、ui、builder 之间的类型来源，避免循环依赖。

### Web (`@afilmory/web`)

职责：

- 提供静态 SPA、瀑布流、WebGL 查看器、地图、RSS/sitemap/OG 资产。
- 构建期通过 `site.config.build.ts` 合并环境变量和 `site.config.ts` 默认值，再注入 `window.__SITE_CONFIG__`。
- 运行时通过 `window.__MANIFEST_PROMISE__` 加载 manifest。生产构建默认外置 `assets/photos-manifest.<hash>.json`，开发默认内联；`AFILMORY_EMBED_MANIFEST` 可覆盖。

## 构建流程

根脚本以 `package.json` 为准：

- `pnpm dev`: 运行 `apps/web/scripts/precheck.ts`，再启动 Vite dev server。
- `pnpm build`: 运行 `precheck`，再运行 `pnpm build:packages` 和 `pnpm build:web`。
- `pnpm build:manifest`: 设置 `BUILDER_CONFIG_PATH=builder.config.ts` 并运行 builder CLI。
- `pnpm build:packages`: 构建 `@afilmory/builder` 和 `@afilmory/webgl-viewer`。
- `pnpm build:web`: 只构建前端，要求 manifest 已存在。
- `pnpm preview`: 预览 `apps/web/dist`。

`precheck` 行为：

- S3 凭据完整时刷新 manifest。
- S3 凭据缺失但 `generated/photos-manifest.json` 存在时复用现有 manifest。
- builder 失败但存在 manifest 时降级复用并警告。
- `SKIP_MANIFEST_BUILD=true` 会显式跳过 builder。

Vercel 使用 `scripts/build-static.sh`。该脚本在 S3 凭据完整时运行 `pnpm build`；缺少凭据但已有 manifest 时运行 `pnpm build:web`，用于 Preview 构建。

## 配置管理

- **敏感配置**: `.env`，参考 `.env.template`。
- **S3 必需变量**: `S3_BUCKET_NAME`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`。
- **S3 默认值**: `S3_REGION` 默认 `us-east-1`，`S3_ENDPOINT` 默认 AWS S3 endpoint。
- **站点默认值**: `site.config.ts`，该文件会被浏览器端导入，不能直接读取 `process.env`。
- **构建期覆盖**: `site.config.build.ts` 读取 `env.ts` 并注入 `window.__SITE_CONFIG__`。
- **远程缓存**: `REPO_URL`/`REPO_TOKEN` 可缓存 manifest 和缩略图，不是照片存储后端。

## 运行时数据

Manifest shape 来自 `@afilmory/data`：

- 顶层字段：`version`、`data`、`cameras`、`lenses`。
- 单张照片包含 `id`、`originalUrl`、`thumbnailUrl`、`thumbHash`、`s3Key`、`exif`、`toneAnalysis`、`location`、可选 `video` 和 `isHDR`。
- `parseManifest` 会清理旧的 unsupported EXIF 字段并提供空 manifest fallback。

前端运行时不要直接读取构建脚本目录。使用 `apps/web/src/data-runtime/manifest-runtime.ts` 和 `photo-loader.ts`。

## 国际化

- 语言 JSON 位于 `locales/app/*.json`。
- 资源注册在 `apps/web/src/@types/resources.ts`。
- 支持语言列表在 `apps/web/src/@types/constants.ts`。
- `apps/web/plugins/vite/locales-json.ts` 会把扁平 key JSON 转成嵌套对象。

## 代码质量

- ESLint 使用根目录 `eslint.config.mjs` 的 flat config。
- 常用检查：

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

PR 前优先跑以上命令。文档-only 改动至少跑 Markdown 格式检查和 `git diff --check`。

## 常见任务

### 本地开发

```bash
pnpm install
pnpm dev
```

开发服务器默认端口为 `1924`。

### 处理照片并生成 manifest

```bash
pnpm build:manifest
pnpm build:manifest -- --force
pnpm build:manifest -- --force-thumbnails
pnpm build:manifest -- --force-manifest
```

### 构建静态站点

```bash
pnpm build
pnpm preview
```

输出目录是 `apps/web/dist`。

### 添加语言

1. 在 `locales/app` 添加 JSON 文件。
2. 在 `apps/web/src/@types/resources.ts` 导入并注册。
3. 在 `apps/web/src/@types/constants.ts` 添加语言代码。

## 已知后续事项

- `package.json` license 字段仍指向 `LICENSE.md`，但仓库实际文件是 `LICENSE`。
- Builder CLI help 文本仍有旧路径示例。
- `.env.template` 对 `S3_REGION` 的“必填”注释与 `env.ts` 默认值不完全一致。
