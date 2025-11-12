# AGENTS - Web Frontend Application

## 应用概述

这是 Afilmory 的前端 SPA 应用，使用 React 19 + Vite 7 构建，提供现代化的照片浏览体验。

## 技术栈

### 核心框架
- **React 19** - 最新版本，包含 React Compiler
- **TypeScript 5.9** - 类型安全
- **Vite 7** - 快速构建工具

### UI 框架
- **Tailwind CSS 4** - 原子化 CSS
- **Radix UI** - 无障碍组件库
- **Motion** (Framer Motion fork) - 动画库

### 状态管理
- **Jotai** - 原子化状态管理
- **TanStack Query** - 服务端状态和数据获取
- **Zustand** - 轻量状态管理

### 路由
- **React Router 7** - 类型安全的路由

### 国际化
- **i18next** - 多语言支持
- **react-i18next** - React 集成

### 地图
- **MapLibre GL** - 开源地图库
- **react-map-gl** - React 封装

## 项目结构

```
apps/web/
├── src/
│   ├── pages/              # 页面组件
│   │   ├── (root)/         # 主要页面
│   │   │   ├── index/      # 首页（照片网格）
│   │   │   ├── map/        # 地图视图
│   │   │   └── about/      # 关于页面
│   │   └── (debug)/        # 调试页面（CI 时删除）
│   ├── components/         # 业务组件
│   │   ├── feed/           # 照片流组件
│   │   ├── map/            # 地图相关组件
│   │   └── viewer/         # 照片查看器
│   ├── lib/                # 工具和配置
│   │   ├── i18n.ts         # 国际化配置
│   │   ├── query-client.ts # TanStack Query 配置
│   │   └── router.tsx      # 路由配置
│   ├── data/               # 数据层
│   │   └── photos-manifest.json  # 照片元数据（构建时生成）
│   ├── hooks/              # 自定义 Hooks
│   ├── store/              # 全局状态
│   └── main.tsx            # 入口文件
├── public/                 # 静态资源
│   ├── photos/             # 照片（构建时生成）
│   ├── thumbnails/         # 缩略图（构建时生成）
│   ├── locales/            # 语言文件
│   └── favicon.ico
├── plugins/                # Vite 插件
│   └── vite/
│       ├── manifest-inject.ts      # 注入 manifest
│       ├── photos-static.ts        # 复制照片资源
│       ├── feed-sitemap.ts         # 生成 sitemap/feed
│       └── og-image-plugin.ts      # 生成 OG 图片
├── index.html
├── vite.config.ts
└── package.json
```

## 核心功能

### 1. 照片网格 (Masonry Layout)

使用 `masonic` 库实现瀑布流布局：

```typescript
import { Masonic } from 'masonic'

<Masonic
  items={photos}
  columnGutter={8}
  columnWidth={250}
  render={PhotoCard}
/>
```

**特性**:
- 响应式列数
- 虚拟滚动优化
- 图片懒加载
- Blurhash 占位图

### 2. WebGL 图片查看器

自定义 WebGL 组件 (`@afilmory/webgl-viewer`):

```typescript
import { WebGLViewer } from '@afilmory/webgl-viewer'

<WebGLViewer
  src={photo.url}
  alt={photo.title}
  maxZoom={5}
  minZoom={0.5}
/>
```

**特性**:
- GPU 加速渲染
- 流畅缩放和平移
- 手势支持（触摸屏）
- 键盘快捷键

### 3. 地图视图

使用 MapLibre 展示带 GPS 信息的照片：

```typescript
import Map from 'react-map-gl/maplibre'
import { Marker } from 'react-map-gl'

<Map
  mapStyle={mapStyle}
  initialViewState={viewState}
>
  {photos.map(photo => (
    <Marker
      key={photo.id}
      longitude={photo.gps.longitude}
      latitude={photo.gps.latitude}
    >
      <PhotoPin photo={photo} />
    </Marker>
  ))}
</Map>
```

### 4. 数据加载

使用 `PhotoLoader` 单例加载照片数据：

```typescript
import { PhotoLoader } from '@afilmory/data'

const loader = PhotoLoader.getInstance()

// 获取所有照片
const photos = await loader.getAllPhotos()

// 分页加载
const page = await loader.getPhotos({ page: 1, pageSize: 20 })

// 按标签过滤
const tagged = await loader.getPhotosByTag('travel')

// 搜索
const results = await loader.searchPhotos('sunset')
```

## 设计系统

### Glassmorphic Depth Design

层次化的毛玻璃设计：

```css
/* Layer 1: 基础背景 */
.layer-1 {
  background: rgba(28, 28, 30, 0.8);
  backdrop-filter: blur(20px);
}

/* Layer 2: 浮层 */
.layer-2 {
  background: rgba(44, 44, 46, 0.85);
  backdrop-filter: blur(30px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Layer 3: 强调层 */
.layer-3 {
  background: rgba(58, 58, 60, 0.9);
  backdrop-filter: blur(40px);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
}
```

### 主题色

从 `config.json` 读取 `accentColor`，动态应用到：
- 按钮和链接
- 进度条
- 选中状态
- 悬停效果

## 构建流程

### 开发模式

```bash
pnpm dev
```

启动 Vite 开发服务器在 http://localhost:1924

**特性**:
- HMR 热更新
- React Fast Refresh
- TypeScript 类型检查
- 代码审查工具

### 生产构建

```bash
pnpm build
```

**构建步骤**:

1. **预检查** (`scripts/precheck.ts`)
   - 检查 `photos-manifest.json` 是否存在
   - 检查 `config.json` 配置

2. **Vite 构建**
   - 代码分割和 Tree-shaking
   - 资源优化和压缩
   - 生成 source maps

3. **自定义插件处理**
   - `manifestInjectPlugin`: 注入 manifest
   - `photosStaticPlugin`: 复制照片资源
   - `ogImagePlugin`: 生成 OG 图片
   - `feedSitemapPlugin`: 生成 sitemap.xml 和 feed.json

4. **PWA 处理**
   - 生成 Service Worker
   - 生成 Web App Manifest

**输出**:
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── [chunk]-[hash].js
├── photos/
│   └── thumbnails/
├── manifest.json
├── sitemap.xml
├── feed.json
└── og-image.png
```

## Vite 插件

### 1. manifestInjectPlugin

将 `photos-manifest.json` 注入到构建产物：

```typescript
export function manifestInjectPlugin(): Plugin {
  return {
    name: 'manifest-inject',
    transformIndexHtml(html) {
      const manifest = fs.readFileSync('src/data/photos-manifest.json', 'utf-8')
      return html.replace(
        '</body>',
        `<script>window.__MANIFEST__=${manifest}</script></body>`
      )
    }
  }
}
```

### 2. photosStaticPlugin

复制照片资源到构建目录：

```typescript
export function photosStaticPlugin(): Plugin {
  return {
    name: 'photos-static',
    closeBundle() {
      // 复制 public/photos 到 dist/photos
      // 复制 public/thumbnails 到 dist/thumbnails
    }
  }
}
```

### 3. ogImagePlugin

生成 Open Graph 预览图：

```typescript
export function ogImagePlugin(config: SiteConfig): Plugin {
  return {
    name: 'og-image',
    async closeBundle() {
      // 使用 satori 生成 SVG
      // 使用 resvg 转换为 PNG
      // 输出到 dist/og-image.png
    }
  }
}
```

## 性能优化

### 代码分割

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-map': ['maplibre-gl', 'react-map-gl'],
          'vendor-image': ['heic-to'],
        }
      }
    }
  }
})
```

### 图片懒加载

```typescript
import { useInView } from 'react-intersection-observer'

function PhotoCard({ photo }) {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  })

  return (
    <div ref={ref}>
      {inView && <img src={photo.thumbnail} />}
    </div>
  )
}
```

### React Compiler

项目启用了 React 19 Compiler，自动优化组件：

```javascript
// babel.config.js
plugins: [
  ['babel-plugin-react-compiler', ReactCompilerConfig]
]
```

## 国际化

### 语言文件

```
public/locales/
├── en/
│   └── common.json
├── zh-CN/
│   └── common.json
└── ja/
    └── common.json
```

### 使用方式

```typescript
import { useTranslation } from 'react-i18next'

function Component() {
  const { t } = useTranslation()

  return <h1>{t('welcome')}</h1>
}
```

### 添加新语言

1. 在 `public/locales/` 创建语言目录
2. 复制 `common.json` 并翻译
3. 在 `src/lib/i18n.ts` 中添加语言代码

## 调试和开发

### 调试页面

开发环境包含调试页面 (`src/pages/(debug)`):

- `/debug/photos` - 照片列表调试
- `/debug/viewer` - 查看器调试
- `/debug/map` - 地图调试

**注意**: CI 环境会自动删除调试页面。

### 代码审查

开发时按 `Alt` 键点击组件可跳转到源码（code-inspector-plugin）。

### React DevTools

支持 React 19 DevTools，可以查看：
- 组件树
- Props 和 State
- React Query 缓存
- Jotai atoms

## 常见任务

### 添加新页面

1. 在 `src/pages/(root)/` 创建目录
2. 添加 `index.tsx` 和路由文件
3. 在 `src/lib/router.tsx` 注册路由

### 添加新组件

```bash
src/components/
└── feature-name/
    ├── index.tsx          # 组件入口
    ├── component.tsx      # 主组件
    ├── hooks.ts           # 自定义 hooks
    └── styles.module.css  # 样式（如需要）
```

### 添加全局状态

```typescript
// src/store/app.ts
import { atom } from 'jotai'

export const viewModeAtom = atom<'grid' | 'list'>('grid')
```

### 调用 API

```typescript
import { useQuery } from '@tanstack/react-query'

function usePhotos() {
  return useQuery({
    queryKey: ['photos'],
    queryFn: async () => {
      const loader = PhotoLoader.getInstance()
      return loader.getAllPhotos()
    }
  })
}
```

## 环境变量

构建时注入的变量（在 `vite.config.ts`）：

```typescript
define: {
  APP_DEV_CWD: JSON.stringify(process.cwd()),
  APP_NAME: JSON.stringify(PKG.name),
  BUILT_DATE: JSON.stringify(new Date().toLocaleDateString()),
  GIT_COMMIT_HASH: JSON.stringify(getGitHash()),
}
```

使用：

```typescript
declare const GIT_COMMIT_HASH: string
declare const BUILT_DATE: string

console.log(`Build: ${BUILT_DATE} (${GIT_COMMIT_HASH})`)
```

## 更多信息

- [根目录 AGENTS.md](../../AGENTS.md) - 整体架构
- [部署指南](../../DEPLOY_STATIC.md) - 部署说明
- [Vite 文档](https://vitejs.dev/)
- [React 19 文档](https://react.dev/)
