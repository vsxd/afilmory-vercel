# AGENTS - Web Frontend Application

## 应用概述

`apps/web` 是 Afilmory 的静态 SPA 前端，使用 React 19 + Vite 8 构建。它不在运行时访问数据库或后端；照片数据和站点配置来自构建注入的 `window.__AFILMORY__` runtime namespace。

## 技术栈

### 核心框架

- React 19 与 React Compiler
- TypeScript 5.9
- Vite 8
- React Router 8

### UI 与交互

- Tailwind CSS 4
- Radix UI
- Motion
- `@afilmory/ui`（只从包根入口导入，不使用 UI 包子路径）
- `@afilmory/webgl-viewer`

### 状态和数据

- Jotai
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
│   ├── build-assets.ts         # 编排 OG、feed、sitemap 与逐照片 HTML 产物
│   ├── build-assets-seo.ts     # canonical/OG/JSON-LD/静态照片页纯 helper
│   ├── data-inject.ts          # 注入 manifest loader 和 site config
│   ├── deps.ts                 # vendor chunk 规则
│   ├── locales-json.ts         # i18n JSON key 转换
│   ├── photos-static.ts        # dev 本地原图映射与生产原图复制
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

- `MasonryRoot` 和 `modules/gallery/VirtualMasonry.tsx` 实现自研纯计算虚拟瀑布流（已替代 masonic 库）。
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
- 生产默认生成 Web Delivery Manifest v3：`assets/gallery-index.<hash>.json` 只携带首屏摘要，完整 EXIF/tone/location 按稳定 ID-hash 分片，地图数据独立分片；`window.__AFILMORY__.manifest.promise` 先 fetch index。
- `AFILMORY_EMBED_MANIFEST=true|false` 可覆盖默认策略。
- `PhotoRepository` 对分片做深层校验、并发去重、Abort/重试和原子快照发布；查询返回深冻结只读实体。不要直接 fetch 或 cast 分片 JSON。

PhotoRepository 用法：

```ts
import {
  usePhotoRepository,
  usePhotoRepositorySnapshot,
} from "~/runtime/app-runtime";

const photoRepository = usePhotoRepository();
const photos = usePhotoRepositorySnapshot();
const photo = photos.find((item) => item.id === photoId);
const tags = photoRepository.getAllTags();
```

不要创建模块级照片单例；React tree 内通过 AppRuntime 获取 PhotoRepository。渲染代码通过 `usePhotoRepositorySnapshot()` 订阅真实快照，不使用“订阅版本号再调用 getPhotos”的旁路；后者可能被 React Compiler 缓存旧值。

## 构建流程

### 开发模式

```bash
pnpm dev
```

根脚本会运行 `pnpm --filter @afilmory/web dev`，实际执行 `tsx scripts/dev.ts`：

1. 运行 `apps/web/scripts/precheck.ts`。
2. 本地 provider 直接刷新 manifest；S3 provider 在 bucket 与有效凭据来源可用时刷新。
3. S3 provider 缺少必需配置但已有 `generated/photos-manifest.json` 时，复用现有 manifest。Access key/secret 可同时省略以使用 AWS SDK 默认凭据链，但显式配置时必须成对。
4. 启动 Vite dev server，默认端口 `1924`。

### 生产构建

```bash
pnpm build
```

根脚本实际步骤：

1. `pnpm exec tsx apps/web/scripts/precheck.ts`
2. `pnpm build:web`

workspace 包直接从 TS 源码消费，部署构建不需要额外的 package dist 构建步骤。

`pnpm build:web` 只运行 Vite build，要求 manifest 已存在。`buildAssetsPlugin` 会读取 manifest 并生成 `feed.xml`、`sitemap.xml`、首页 OG 图片及 `photos/<photo-id>/index.html` 静态照片页。

### 输出

```text
apps/web/dist/
├── index.html
├── assets/
│   ├── gallery-index.<hash>.json
│   ├── photo-details.<stable-prefix>.<hash>.json
│   ├── map-details.<hash>.json
│   └── vendor / app chunks
├── thumbnails/
├── photos/<photo-id>/index.html # 每张照片的可抓取静态 HTML shell
├── originals/                  # 仅本地 provider 默认前缀；名称随配置变化
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
- 外置模式通过解析期内联脚本尽早 fetch gallery index；不要再添加参数不一致、会造成重复下载的 preload link。

### `photosStaticPlugin`

- 本地 provider 在 dev server 中把 `LOCAL_PHOTOS_BASE_URL` 映射到 `LOCAL_PHOTOS_PATH`。
- 本地 provider 的生产构建把原图复制到 `dist` 中与 URL 前缀匹配的位置；S3 provider 不复制原图。
- 开发时若 `apps/web/public/<LOCAL_PHOTOS_BASE_URL>` 已存在，会警告并跳过 middleware，由 Vite 静态目录优先提供文件。

### `buildAssetsPlugin`

- 构建期生成 Open Graph PNG。
- 读取 manifest 生成 RSS feed、唯一 URL sitemap 和按拍摄时间稳定排序的照片页。
- 为首页和每张照片生成唯一 canonical、Open Graph/Twitter metadata；照片页还包含 JSON-LD 与 `<noscript>` shell。
- OG 图片由 `@afilmory/build-assets`（`packages/build-assets/src/generate-og-image.ts`）使用 Sharp 和 SVG/text helpers 生成。

### `createDependencyChunksPlugin`

- 将 React、i18n、Motion、Map、HEIC、EXIF、state、UI 等依赖拆成稳定 vendor chunk。
- Radix/overlay 内部 scope 紧密耦合，必须留在同一个 UI chunk。
- 会阻止 vendor→entry 和跨 vendor 静态循环，避免生产启动时出现 ESM bootstrap cycle。

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
- S3 模式原图来自 S3/CDN；本地模式会把原图复制进生产产物。位置隐私模式仅处理 manifest/geocoding，不会清除原图的 EXIF。
- code-inspector-plugin 只在 dev server 中启用，按 `Alt` 点击可跳转源码。

## 更多信息

- [根目录 AGENTS.md](../../AGENTS.md) - 整体架构
- [Vite 文档](https://vite.dev/)
- [React 文档](https://react.dev/)
