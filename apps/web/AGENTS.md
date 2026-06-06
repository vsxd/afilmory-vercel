# AGENTS - Web Frontend Application

## 应用概述

`apps/web` 是 Afilmory 的静态 SPA 前端，使用 React 19 + Vite 7 构建。它不在运行时访问数据库或后端；照片数据和站点配置来自构建注入的 `window.__AFILMORY__` runtime namespace。

## 技术栈

### 核心框架

- React 19 与 React Compiler
- TypeScript 5.9
- Vite 7
- React Router 7

### UI 与交互

- Tailwind CSS 4
- Radix UI
- Motion
- `@afilmory/ui`
- `@afilmory/webgl-viewer`

### 状态和数据

- Jotai
- TanStack Query
- `apps/web/src/data-runtime/manifest-runtime.ts`
- `apps/web/src/data-runtime/photo-repository.ts`
- `apps/web/src/runtime/app-runtime.ts`

### 国际化和地图

- i18next、react-i18next
- 语言资源：`locales/app/*.json`
- 资源注册：`apps/web/src/@types/resources.ts`
- 支持语言：`apps/web/src/@types/constants.ts`
- MapLibre GL、react-map-gl

## 当前项目结构

```text
apps/web/
├── plugins/vite/
│   ├── ast.ts
│   ├── build-assets.ts         # 生成 OG 图片、feed.xml、sitemap.xml
│   ├── data-inject.ts          # 注入 manifest loader 和 site config
│   ├── deps.ts                 # vendor chunk 规则
│   ├── locales-json.ts         # i18n JSON key 转换
│   ├── photos-static.ts        # dev only /photos 本地映射
│   └── rss.ts                  # RSS feed 生成
├── public/
│   ├── thumbnails/             # builder 生成的缩略图
│   └── favicon / PWA icons
├── scripts/
│   ├── dev.ts                  # precheck + Vite dev server
│   └── precheck.ts             # manifest 构建/复用逻辑
├── src/
│   ├── @types/                 # i18n resource/type constants
│   ├── atoms/                  # Jotai atoms
│   ├── components/             # common/gallery/photo-viewer UI
│   ├── config/                 # runtime site config accessor
│   ├── data-runtime/           # manifest runtime and PhotoRepository
│   ├── hooks/
│   ├── lib/
│   ├── modules/gallery/
│   ├── modules/map/
│   ├── pages/
│   │   ├── (main)/layout.tsx
│   │   ├── (main)/photos/[photoId]/index.tsx
│   │   ├── (data)/manifest.tsx
│   │   ├── (debug)/blurhash.tsx
│   │   ├── (debug)/webgl-preview.tsx
│   │   └── explore/index.tsx
│   ├── providers/
│   ├── styles/
│   ├── router.tsx              # import.meta.glob route builder
│   └── main.tsx
├── index.html
├── package.json
└── vite.config.ts
```

Production builds exclude `(debug)` and `(data)` route groups. Development keeps them available.

## 核心功能

### 照片网格

- `MasonryRoot` 和 `modules/gallery/Masonic.tsx` 基于 Masonic 实现虚拟瀑布流。
- 缩略图使用 `photo.thumbnailUrl`。
- 占位和取色使用 `photo.thumbHash`。
- 筛选状态通过 URL search params 与 Jotai 状态同步。

### WebGL 图片查看器

真实组件名是 `WebGLImageViewer`：

```tsx
import { WebGLImageViewer } from "@afilmory/webgl-viewer";

<WebGLImageViewer
  src={photo.originalUrl}
  sourceBlob={imageBlob}
  width={photo.width}
  height={photo.height}
  onLoadingStateChange={handleLoadingState}
  onImagePainted={handleImagePainted}
  onError={handleError}
/>;
```

前端包装层位于 `apps/web/src/components/ui/photo-viewer/ProgressiveImage.tsx`，会处理渐进加载、WebGL fallback、Live Photo/Motion Photo 视频和 HDR 标记。

### 地图视图

- 页面入口：`/explore`，文件为 `apps/web/src/pages/explore/index.tsx`。
- 地图模块：`apps/web/src/modules/map`。
- 经纬度来自 manifest 中的 EXIF GPS 字段和 `location` 字段。

### 数据加载

Manifest runtime：

- `dataInjectPlugin` 会注入 manifest source。
- 开发默认在 `window.__AFILMORY__.manifest` 内联 manifest。
- 生产默认生成 `assets/photos-manifest.<hash>.json` 并通过 `window.__AFILMORY__.manifest.promise` fetch。
- `AFILMORY_EMBED_MANIFEST=true|false` 可覆盖默认策略。

PhotoRepository 用法：

```ts
import { usePhotoRepository } from "~/runtime/app-runtime";

const photoRepository = usePhotoRepository();
const photos = photoRepository.getPhotos();
const photo = photoRepository.getPhoto(photoId);
const tags = photoRepository.getAllTags();
```

不要创建模块级照片单例；React tree 内通过 AppRuntime 获取 PhotoRepository。

## 构建流程

### 开发模式

```bash
pnpm dev
```

根脚本会运行 `pnpm --filter @afilmory/web dev`，实际执行 `tsx scripts/dev.ts`：

1. 运行 `apps/web/scripts/precheck.ts`。
2. 如果 S3 凭据完整，刷新 manifest。
3. 如果缺少 S3 凭据但已有 `generated/photos-manifest.json`，复用现有 manifest。
4. 启动 Vite dev server，默认端口 `1924`。

### 生产构建

```bash
pnpm build
```

根脚本实际步骤：

1. `pnpm exec tsx apps/web/scripts/precheck.ts`
2. `pnpm build:packages`
3. `pnpm build:web`

`pnpm build:web` 只运行 Vite build，要求 manifest 已存在。`buildAssetsPlugin` 会读取 manifest 并生成 `feed.xml`、`sitemap.xml` 和 OG 图片。

### 输出

```text
apps/web/dist/
├── index.html
├── assets/
│   ├── photos-manifest.<hash>.json
│   └── vendor / app chunks
├── thumbnails/
├── feed.xml
├── sitemap.xml
├── manifest.webmanifest
└── assets/og-image-<timestamp>.png
```

## Vite 插件事实

### `dataInjectPlugin`

- 读取 `generated/photos-manifest.json`。
- 使用 schema strict validation 读取 manifest；旧 manifest schema 不再迁移。
- 注入 `window.__AFILMORY__.config`。
- 根据 `AFILMORY_EMBED_MANIFEST` 和 serve/build 模式选择内联或外置 manifest。
- 外置 manifest 会添加 preload link，并通过 `window.__AFILMORY__.manifest.promise` 加载。

### `photosStaticPlugin`

- 只在 dev server 中为 `/photos/*` 映射仓库根 `photos` 目录。
- 不负责生产构建复制照片资源。
- 若 `apps/web/public/photos` 已存在，会跳过以避免和 Vite 静态目录冲突。

### `buildAssetsPlugin`

- 构建期生成 Open Graph PNG。
- 读取 manifest 生成 RSS feed 和 sitemap。
- 将 meta tags 插入 `index.html`。
- OG 图片由 `scripts/generate-og-image.ts` 使用 Sharp 和 SVG/text helpers 生成。

### `createDependencyChunksPlugin`

- 将 React、i18n、Motion、Map、HEIC、EXIF、state、UI、masonry 等依赖拆成稳定 vendor chunk。
- 会阻止 vendor chunk 依赖 entry chunk，避免生产启动时出现 ESM bootstrap cycle。

## 国际化

语言文件位置：

```text
locales/app/
├── en.json
├── jp.json
├── ko.json
├── zh-CN.json
├── zh-HK.json
└── zh-TW.json
```

添加语言：

1. 在 `locales/app` 添加 JSON 文件。
2. 在 `apps/web/src/@types/resources.ts` 导入并注册。
3. 在 `apps/web/src/@types/constants.ts` 添加语言代码。

## 常见任务

### 添加页面

页面由 `apps/web/src/router.tsx` 通过 `import.meta.glob("./pages/**/*.tsx")` 自动收集。添加页面时创建 `apps/web/src/pages/.../index.tsx` 或路由文件即可；动态路由使用 `[param]` 命名。

### 添加组件

优先放在最接近使用场景的位置：

- gallery 专用：`apps/web/src/modules/gallery`
- map 专用：`apps/web/src/modules/map`
- photo viewer 专用：`apps/web/src/components/ui/photo-viewer`
- 可复用 UI：优先考虑 `packages/ui`

### 添加全局状态

```ts
import { atom } from "jotai";

export const viewModeAtom = atom<"grid" | "list">("grid");
```

现有 atoms 位于 `apps/web/src/atoms`。

### 调试页面

开发环境可访问：

- `/blurhash`
- `/webgl-preview`
- `/manifest`

生产构建会排除 `(debug)` 和 `(data)` 路由组。

## 环境变量和编译常量

站点配置通过 `site.config.build.ts` 注入。Vite `define` 还提供：

```ts
APP_DEV_CWD;
APP_NAME;
BUILT_DATE;
GIT_COMMIT_HASH;
```

`BUILT_DATE` 是 ISO 字符串。

## 开发注意事项

- 不要在浏览器端直接导入 `env.ts` 或读取 `process.env`。
- 不要读取旧 `window.__*` manifest/config 名称；应通过 `loadManifestRuntime()`、AppRuntime 或已有 provider 使用 manifest。
- 原图来自 S3/CDN，生产构建只包含生成缩略图和静态 Web 资源。
- code-inspector-plugin 只在 dev server 中启用，按 `Alt` 点击可跳转源码。

## 更多信息

- [根目录 AGENTS.md](../../AGENTS.md) - 整体架构
- [Vite 文档](https://vite.dev/)
- [React 文档](https://react.dev/)
