# Afilmory 项目架构重构设计

## 背景

Afilmory 是一个纯静态部署的摄影博客（支持 Vercel 一键部署），从有后端的项目改造而来。当前 monorepo 包含 6 个内部包 + 1 个 web 应用，技术栈为 Vite 7 + React 19 + Tailwind 4。

后端代码已完全移除，但包结构、构建脚本、依赖管理中仍存在历史遗留的冗余和不合理之处。

## 目标

- 精简包结构：从 6 个包减至 4 个
- 引入 Turborepo 增量构建
- 合并冗余 Vite 插件
- 建立基础测试覆盖
- 全程保证现有功能和行为不变

## 当前架构

### 包结构

```
packages/
├── builder/        # 照片构建 CLI（S3 扫描、EXIF、缩略图、manifest）
├── data/           # 类型定义 + PhotoLoader
├── hooks/          # 8 个 React hooks
├── ui/             # UI 组件库（Radix UI 封装）
├── utils/          # 工具函数（clsxm、Spring、RSS、并发控制等）
└── webgl-viewer/   # WebGL 3D 查看器
```

### 数据流

```
S3 照片源 → builder CLI → manifest.json → Vite 注入 → React 渲染
```

### 已识别问题

1. 依赖重复：exiftool-vendored 在 data 和 builder 中重复
2. 构建脚本冗余：build 和 build:static 完全相同
3. 类型导入混乱：web 从 builder 导入类型，应从 data 导入
4. 包过度拆分：hooks 和 utils 体量小，独立成包增加维护成本
5. 10 个自定义 Vite 插件文件（其中 2 个废弃未使用），部分功能重叠
6. 无测试覆盖

## 执行策略

分 3 个阶段推进，每阶段独立可验证，出问题可单独回滚。

---

## 阶段一：基础清理

目标：消除冗余，理顺依赖，不改变包结构。

### 1.1 依赖去重

- `exiftool-vendored` 版本统一：builder 和 data 都直接依赖 `exiftool-vendored`，通过 pnpm catalog 统一版本号。data 仅做类型导入，builder 使用运行时 `ExifTool` 类。不让 data 重新导出运行时代码，避免 web 应用被拉入原生二进制依赖。

### 1.2 构建脚本整理

- 删除根目录 `build:static` 脚本（与 `build` 完全相同）
- `scripts/build-static.sh` 改为调用 `pnpm build`
- 统一 `apps/web` 的 `format` 脚本范围（当前只覆盖 `src/**/*.ts`，应扩展到 tsx/json/css）

### 1.3 类型导入归位

- `apps/web` 中从 `@afilmory/builder` 导入的类型（`PhotoManifestItem`、`FujiRecipe`、`PickedExif` 等）统一改为从 `@afilmory/data` 导入
- `@afilmory/builder` 保留对这些类型的重新导出，确保向后兼容

### 1.4 清理后端遗留

- 检查 `@afilmory/utils` 中的 `tenant.ts`（slug 验证）和 `storage-provider.ts`（存储提供商常量）
- 如果在前端代码中未使用则移除

### 验证标准

- `pnpm build` 成功
- 构建产物与重构前一致
- 所有导入路径正确解析

---

## 阶段二：包结构重组 + Turborepo

目标：从 6 个包精简到 4 个，引入增量构建。

### 2.1 合并 @afilmory/hooks → @afilmory/ui

- 8 个 hooks 全部是纯 React hooks，无外部 `@afilmory/*` 依赖
- 移入 `packages/ui/src/hooks/` 目录
- `@afilmory/ui` 重新导出所有 hooks
- 更新所有 `from '@afilmory/hooks'` 导入为 `from '@afilmory/ui'`
- 删除 `packages/hooks/` 包

hooks 清单：
- `useControlled` — 受控/非受控组件状态管理
- `useControlledState` — 受控状态
- `useInputComposition` — 输入法组合事件
- `useIsOnline` — 网络在线状态
- `useMeasure` — 元素尺寸测量（依赖 es-toolkit debounce）
- `usePrevious` — 前一个值
- `useRefValue` — Ref 值同步
- `useTypeScriptCallback` — TypeScript 类型安全回调

### 2.2 拆解 @afilmory/utils → 按归属分散

按使用场景将工具函数分散到对应的包中：

| 工具 | 目标位置 | 原因 |
|------|---------|------|
| `clsxm`、`focusInput`、`focusRing`、`hasErrorInput` | `@afilmory/ui/src/utils/` | UI 样式工具，ui 和 web 共用，放入 ui 作为公共出口 |
| `Spring` | `@afilmory/ui/src/utils/` | 动画预设，ui 和 web 共用，放入 ui 作为公共出口 |
| `generateRSSFeed` | `apps/web/plugins/vite/` 同目录 | 仅 Vite 插件使用 |
| `compressUint8Array`、`decompressUint8Array` | `@afilmory/data/src/` | 跨包共享（builder、ui、web 均使用），放入数据层 |
| `backoffDelay`、`sleep`、`Semaphore` | `@afilmory/builder/src/utils/` | 构建时并发控制（注意：`geocoding.ts` 中有内联 `sleep` 实现，迁移后统一使用此工具函数） |
| `tenant.ts`、`storage-provider.ts` | 移除（阶段一确认） | 后端遗留 |

最终删除 `packages/utils/` 包。

注意：`@afilmory/builder` 中存在通过相对路径直接引用 utils 源码的情况（如 `s3-provider.ts` 中 `import { backoffDelay } from '../../../../utils/src/backoff.js'`），迁移时需同步修复为包内导入。

此外，`@afilmory/builder/src/index.ts` 中有 `export * from '@afilmory/utils'`，删除 utils 包后此行会报错。需在迁移时删除该重新导出，并确保所有通过 builder 间接使用 utils 的消费者已迁移到新的导入路径。

### 2.3 引入 Turborepo

添加 `turbo.json`：

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "cache": true
    },
    "type-check": {
      "dependsOn": ["^build"],
      "cache": true
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": true
    }
  }
}
```

根 `package.json` 添加 `turbo` 依赖，构建命令改为 `turbo run build`。

### 2.4 合并后的包结构

```
packages/
├── builder/        # 构建工具（+ backoff/semaphore/sleep）
├── data/           # 类型中心 + PhotoLoader + u8array 编解码
├── ui/             # UI 组件 + hooks + UI utils（clsxm/Spring）
└── webgl-viewer/   # WebGL 3D 查看器
```

### 验证标准

- `pnpm build` 成功（通过 Turbo）
- 所有导入路径正确解析
- 开发环境 `pnpm dev` 正常运行
- 构建产物与重构前一致

---

## 阶段三：Vite 插件整合 + 测试

目标：减少插件数量，建立基础测试覆盖。

### 3.1 合并数据注入插件

`manifestInjectPlugin` + `siteConfigInjectPlugin` → `dataInjectPlugin`

合并理由：
- 都在 HTML 中注入 `<script>` 全局变量
- 都需要读取文件并序列化为 JSON
- 合并后统一处理 `__MANIFEST__` 和 `__SITE_CONFIG__`
- 开发环境的 manifest 文件监听 + HMR 保持不变

### 3.2 合并构建时生成插件

`ogImagePlugin` + `createFeedSitemapPlugin` → `buildAssetsPlugin`

合并理由：
- 都在构建阶段执行（`buildStart` / `generateBundle`）
- 都调用 `scripts/` 下的生成脚本
- 合并后统一执行：favicon、OG 图片、RSS feed、sitemap
- `transformIndexHtml` 中统一注入 OG meta 标签

### 3.3 保持独立的插件

- `astPlugin` — AST 代码转换，有特定处理阶段
- `createDependencyChunksPlugin` — Rollup 输出配置
- `localesJsonPlugin` — `enforce: 'pre'` 资源预处理
- `photosStaticPlugin` — 开发服务器中间件

### 3.4 删除废弃插件

经验证，`i18n-hmr.ts` 和 `locales.ts` 均未在 `vite.config.ts` 中注册，属于废弃代码，直接删除。

### 3.5 最终插件结构（8 个在用 → 6 个）

```
apps/web/plugins/vite/
├── ast.ts              # AST 代码优化
├── build-assets.ts     # 构建时生成（OG/favicon/RSS/sitemap）
├── data-inject.ts      # 数据注入（manifest + site config）
├── deps.ts             # 依赖 chunk 分割
├── locales-json.ts     # 本地化 JSON 预处理
└── photos-static.ts    # 开发环境照片静态服务
```

### 3.6 引入 Vitest

- 根目录添加 `vitest` 依赖和 `vitest.workspace.ts`
- 测试覆盖范围：
  - `@afilmory/data` — PhotoLoader 查询方法（getPhotos、getPhoto、getAllTags 等）
  - `@afilmory/builder` — 图像处理核心逻辑（EXIF 提取、哈希计算）
  - `@afilmory/ui` — 合并进来的 hooks（useControlled、useMeasure 等）
- Turbo 中 `test` 任务开启缓存

### 验证标准

- `pnpm build` 成功
- 构建产物与重构前一致（特别是 OG 图片、RSS、sitemap）
- 开发环境 manifest 注入和 HMR 正常
- `pnpm test` 全部通过

---

## 风险控制

- 每个阶段完成后验证构建产物一致性
- 每个阶段独立提交，可单独回滚
- 插件合并时保留原有的所有功能分支和边界条件处理
- 类型导入变更通过 TypeScript 编译器验证正确性
