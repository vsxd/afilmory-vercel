# Afilmory 架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简 monorepo 包结构（6→4），引入 Turborepo，合并 Vite 插件（8→6），建立 Vitest 测试覆盖。

**Architecture:** 三阶段渐进重构。阶段一清理冗余不改结构；阶段二合并 hooks/utils 包并引入 Turbo；阶段三整合 Vite 插件并加测试。每阶段独立可验证可回滚。

**Tech Stack:** pnpm workspace, Turborepo, Vite 7, React 19, Vitest

**Spec:** `docs/superpowers/specs/2026-03-21-architecture-refactoring-design.md`

---

## 文件变更总览

### 阶段一：基础清理
- Modify: `pnpm-workspace.yaml` (添加 exiftool-vendored 到 catalog)
- Modify: `packages/data/package.json` (使用 catalog 版本)
- Modify: `packages/builder/package.json` (使用 catalog 版本)
- Modify: `package.json` (删除 build:static)
- Modify: `scripts/build-static.sh` (简化为调用 pnpm build)
- Modify: `apps/web/package.json` (扩展 format 范围)
- Modify: `apps/web/src/types/map/index.ts` (类型导入改为 @afilmory/data)
- Modify: `apps/web/src/lib/map-utils.ts` (同上)
- Modify: `apps/web/src/types/photo.ts` (同上)
- Modify: `apps/web/src/components/ui/photo-viewer/formatExifData.tsx` (同上)
- Modify: `apps/web/src/components/ui/photo-viewer/ExifPanel.tsx` (同上)
- Delete: `packages/utils/src/tenant.ts`
- Delete: `packages/utils/src/storage-provider.ts`
- Modify: `packages/utils/src/index.ts` (移除 tenant/storage-provider 导出)

### 阶段二：包结构重组 + Turborepo
- Create: `packages/ui/src/hooks/` (从 packages/hooks/src/ 移入 8 个文件)
- Create: `packages/ui/src/utils/cn.ts` (从 packages/utils/src/cn.ts 移入)
- Create: `packages/ui/src/utils/spring.ts` (从 packages/utils/src/spring.ts 移入)
- Create: `packages/data/src/u8array.ts` (从 packages/utils/src/u8array.ts 移入)
- Create: `packages/builder/src/utils/backoff.ts` (从 packages/utils/src/backoff.ts 移入)
- Create: `packages/builder/src/utils/semaphore.ts` (从 packages/utils/src/semaphore.ts 移入)
- Create: `apps/web/plugins/vite/rss.ts` (从 packages/utils/src/rss.ts 移入)
- Modify: `packages/ui/src/index.ts` (添加 hooks 和 utils 导出)
- Modify: `packages/ui/package.json` (添加 es-toolkit 依赖，移除 @afilmory/hooks/@afilmory/utils)
- Modify: `packages/data/src/index.ts` (添加 u8array 导出)
- Modify: `packages/builder/src/index.ts` (删除 export * from '@afilmory/utils')
- Modify: `packages/builder/package.json` (移除 @afilmory/utils 依赖)
- Modify: `packages/builder/src/storage/providers/s3-provider.ts` (修复导入路径)
- Modify: `packages/builder/src/photo/image-pipeline.ts` (修复导入路径)
- Modify: `packages/builder/src/photo/data-processors.ts` (修复导入路径)
- Modify: `packages/builder/src/photo/geocoding.ts` (使用统一 sleep)
- Modify: 25 个 `packages/ui/src/**` 文件 (导入从 @afilmory/utils 改为相对路径)
- Modify: 1 个 `packages/ui/src/**` 文件 (导入从 @afilmory/hooks 改为相对路径)
- Modify: 23 个 `apps/web/src/**` 文件 (导入从 @afilmory/utils 改为 @afilmory/ui)
- Modify: `apps/web/package.json` (移除 @afilmory/hooks/@afilmory/utils 依赖)
- Modify: `package.json` (移除 @afilmory/hooks 依赖，添加 turbo)
- Delete: `packages/hooks/` (整个目录)
- Delete: `packages/utils/` (整个目录)
- Create: `turbo.json`

### 阶段三：Vite 插件整合 + 测试
- Delete: `apps/web/plugins/vite/i18n-hmr.ts`
- Delete: `apps/web/plugins/vite/locales.ts`
- Create: `apps/web/plugins/vite/data-inject.ts` (合并 manifest-inject + site-config-inject)
- Create: `apps/web/plugins/vite/build-assets.ts` (合并 og-image + feed-sitemap)
- Delete: `apps/web/plugins/vite/manifest-inject.ts`
- Delete: `apps/web/plugins/vite/site-config-inject.ts`
- Delete: `apps/web/plugins/vite/og-image-plugin.ts`
- Delete: `apps/web/plugins/vite/feed-sitemap.ts`
- Modify: `apps/web/vite.config.ts` (更新插件导入)
- Create: `vitest.workspace.ts`
- Modify: `package.json` (添加 vitest 依赖和 test 脚本)
- Create: `packages/data/src/__tests__/photo-loader.test.ts`
- Create: `packages/ui/src/hooks/__tests__/useControlled.test.ts`
- Create: `packages/ui/src/hooks/__tests__/useMeasure.test.ts`

---

## 阶段一：基础清理

### Task 1: 统一 exiftool-vendored 版本（pnpm catalog）

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/data/package.json`
- Modify: `packages/builder/package.json`

- [ ] **Step 1: 在 pnpm-workspace.yaml 的 catalog 中添加 exiftool-vendored**

在 `catalog:` 部分添加：
```yaml
  exiftool-vendored: 31.2.0
```

- [ ] **Step 2: 更新 packages/data/package.json 使用 catalog 版本**

```diff
- "exiftool-vendored": "31.2.0"
+ "exiftool-vendored": "catalog:"
```

- [ ] **Step 3: 更新 packages/builder/package.json 使用 catalog 版本**

```diff
- "exiftool-vendored": "31.2.0"
+ "exiftool-vendored": "catalog:"
```

- [ ] **Step 4: 运行 pnpm install 验证**

Run: `pnpm install`
Expected: 无报错，lock 文件更新

- [ ] **Step 5: 提交**

```bash
git add pnpm-workspace.yaml packages/data/package.json packages/builder/package.json pnpm-lock.yaml
git commit -m "chore: unify exiftool-vendored version via pnpm catalog"
```

---

### Task 2: 清理构建脚本

**Files:**
- Modify: `package.json`
- Modify: `scripts/build-static.sh`
- Modify: `apps/web/package.json`

- [ ] **Step 1: 删除根 package.json 中的 build:static 脚本**

从 `scripts` 中移除：
```diff
-    "build:static": "pnpm build:manifest && pnpm build:web",
```

- [ ] **Step 2: 简化 scripts/build-static.sh**

将构建命令替换为直接调用 `pnpm build`：
```diff
- # 构建 manifest
- echo "📦 构建照片 manifest..."
- if ! pnpm build:manifest; then
-   echo "❌ Manifest 构建失败"
-   exit 1
- fi
-
- # 构建前端
- echo "🎨 构建前端应用..."
- if ! pnpm build:web; then
-   echo "❌ 前端构建失败"
-   exit 1
- fi
+ # 执行完整构建
+ echo "📦 构建中..."
+ if ! pnpm build; then
+   echo "❌ 构建失败"
+   exit 1
+ fi
```

- [ ] **Step 3: 扩展 apps/web format 脚本范围**

```diff
- "format": "prettier --write \"src/**/*.ts\" ",
+ "format": "prettier --write \"src/**/*.{ts,tsx,js,jsx,json,css}\"",
```

- [ ] **Step 4: 提交**

```bash
git add package.json scripts/build-static.sh apps/web/package.json
git commit -m "chore: clean up redundant build scripts and fix format scope"
```

---

### Task 3: 类型导入归位（builder → data）

**Files:**
- Modify: `apps/web/src/types/map/index.ts:1`
- Modify: `apps/web/src/lib/map-utils.ts:1`
- Modify: `apps/web/src/types/photo.ts:1`
- Modify: `apps/web/src/components/ui/photo-viewer/formatExifData.tsx:1`
- Modify: `apps/web/src/components/ui/photo-viewer/ExifPanel.tsx:3`

- [ ] **Step 1: 更新 5 个文件的类型导入**

所有 `from '@afilmory/builder'` 改为 `from '@afilmory/data'`：

`apps/web/src/types/map/index.ts`:
```diff
- import type { PhotoManifestItem } from '@afilmory/builder'
+ import type { PhotoManifestItem } from '@afilmory/data'
```

`apps/web/src/lib/map-utils.ts`:
```diff
- import type { PhotoManifestItem, PickedExif } from '@afilmory/builder'
+ import type { PhotoManifestItem, PickedExif } from '@afilmory/data'
```

`apps/web/src/types/photo.ts`:
```diff
- export type { PhotoManifestItem as PhotoManifest } from '@afilmory/builder'
+ export type { PhotoManifestItem as PhotoManifest } from '@afilmory/data'
```

`apps/web/src/components/ui/photo-viewer/formatExifData.tsx`:
```diff
- import type { FujiRecipe, PickedExif } from '@afilmory/builder'
+ import type { FujiRecipe, PickedExif } from '@afilmory/data'
```

`apps/web/src/components/ui/photo-viewer/ExifPanel.tsx`:
```diff
- import type { PhotoManifestItem, PickedExif } from '@afilmory/builder'
+ import type { PhotoManifestItem, PickedExif } from '@afilmory/data'
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `pnpm --filter @afilmory/web type-check`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/types/map/index.ts apps/web/src/lib/map-utils.ts apps/web/src/types/photo.ts apps/web/src/components/ui/photo-viewer/formatExifData.tsx apps/web/src/components/ui/photo-viewer/ExifPanel.tsx
git commit -m "refactor: redirect type imports from builder to data"
```

---

### Task 4: 清理后端遗留代码

**Files:**
- Delete: `packages/utils/src/tenant.ts`
- Delete: `packages/utils/src/storage-provider.ts`
- Modify: `packages/utils/src/index.ts`

- [ ] **Step 1: 确认 tenant.ts 和 storage-provider.ts 在前端无使用**

Run: `grep -r "tenant\|storage-provider\|isTenantSlug\|RESERVED_SLUGS\|STORAGE_PROVIDER" apps/web/src/ packages/ui/src/`
Expected: 无匹配结果

- [ ] **Step 2: 删除文件并更新 index.ts**

删除 `packages/utils/src/tenant.ts` 和 `packages/utils/src/storage-provider.ts`。

从 `packages/utils/src/index.ts` 中移除对应的导出行。

- [ ] **Step 3: 验证构建**

Run: `pnpm build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add packages/utils/
git commit -m "chore: remove unused backend legacy code (tenant, storage-provider)"
```

---

### Task 5: 阶段一验证

- [ ] **Step 1: 完整构建验证**

Run: `pnpm build`
Expected: 构建成功，无错误

- [ ] **Step 2: 检查构建产物**

Run: `ls -la apps/web/dist/index.html`
Expected: 文件存在

- [ ] **Step 3: 打标签**

```bash
git tag refactor/phase1-cleanup
```

---

## 阶段二：包结构重组 + Turborepo

### Task 6: 合并 @afilmory/hooks → @afilmory/ui

**Files:**
- Create: `packages/ui/src/hooks/` (复制 8 个 hook 文件)
- Modify: `packages/ui/src/index.ts` (添加 hooks 导出)
- Modify: `packages/ui/package.json` (添加 es-toolkit 依赖)
- Modify: `packages/ui/src/animate-ui/primitives/radix/switch.tsx` (更新导入)
- Delete: `packages/hooks/`

- [ ] **Step 1: 复制 hooks 文件到 ui 包**

```bash
mkdir -p packages/ui/src/hooks
cp packages/hooks/src/*.ts packages/ui/src/hooks/
```

- [ ] **Step 2: 在 packages/ui/src/index.ts 中添加 hooks 导出**

追加：
```typescript
// Hooks
export { useControlled } from './hooks/useControlled.js'
export { useControlledState } from './hooks/useControlledState.js'
export { useInputComposition } from './hooks/useInputComposition.js'
export { useIsOnline } from './hooks/useIsOnline.js'
export { useMeasure } from './hooks/useMeasure.js'
export { usePrevious } from './hooks/usePrevious.js'
export { useRefValue } from './hooks/useRefValue.js'
export { useTypeScriptCallback } from './hooks/useTypeScriptCallback.js'
```

- [ ] **Step 3: 更新 packages/ui/package.json**

添加 `es-toolkit` 到 dependencies（useMeasure 需要），移除 `@afilmory/hooks`：
```diff
  "dependencies": {
+   "es-toolkit": "catalog:",
-   "@afilmory/hooks": "workspace:*",
```

- [ ] **Step 4: 更新 ui 内部的 hooks 导入**

`packages/ui/src/animate-ui/primitives/radix/switch.tsx`:
```diff
- import { useControlledState } from '@afilmory/hooks'
+ import { useControlledState } from '../../../hooks/useControlledState.js'
```

- [ ] **Step 5: 删除 packages/hooks 目录**

```bash
rm -rf packages/hooks
```

- [ ] **Step 6: 更新根 package.json，移除 @afilmory/hooks**

```diff
  "devDependencies": {
-   "@afilmory/hooks": "workspace:*",
```

- [ ] **Step 7: 更新 apps/web/package.json，移除 @afilmory/hooks**

如果存在 `@afilmory/hooks` 依赖则移除。

- [ ] **Step 8: pnpm install 并验证**

Run: `pnpm install && pnpm build`
Expected: 构建成功

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "refactor: merge @afilmory/hooks into @afilmory/ui"
```

---

### Task 7: 迁移 utils 工具函数到各归属包

**Files:**
- Create: `packages/ui/src/utils/cn.ts`
- Create: `packages/ui/src/utils/spring.ts`
- Create: `packages/data/src/u8array.ts`
- Create: `packages/builder/src/utils/backoff.ts`
- Create: `packages/builder/src/utils/semaphore.ts`
- Create: `apps/web/plugins/vite/rss.ts`
- Modify: `packages/ui/src/index.ts` (添加 utils 导出)
- Modify: `packages/data/src/index.ts` (添加 u8array 导出)
- Modify: `packages/ui/package.json` (添加 clsx, tailwind-merge 依赖，移除 @afilmory/utils)

- [ ] **Step 1: 迁移 UI 工具到 ui 包**

```bash
mkdir -p packages/ui/src/utils
cp packages/utils/src/cn.ts packages/ui/src/utils/cn.ts
cp packages/utils/src/spring.ts packages/ui/src/utils/spring.ts
```

在 `packages/ui/src/index.ts` 追加：
```typescript
// Utils
export { clsxm, focusInput, focusRing, hasErrorInput } from './utils/cn.js'
export { Spring } from './utils/spring.js'
```

更新 `packages/ui/package.json`，添加 `clsx` 和 `tailwind-merge` 到 dependencies，移除 `@afilmory/utils`：
```diff
  "dependencies": {
+   "clsx": "catalog:",
+   "tailwind-merge": "catalog:",
-   "@afilmory/utils": "workspace:*",
```

确认 `clsx` 和 `tailwind-merge` 在 pnpm catalog 中有版本定义，如果没有则添加。

- [ ] **Step 2: 迁移 u8array 到 data 包**

```bash
cp packages/utils/src/u8array.ts packages/data/src/u8array.ts
```

在 `packages/data/src/index.ts` 追加：
```typescript
export { compressUint8Array, decompressUint8Array } from './u8array.js'
```

- [ ] **Step 3: 迁移并发控制工具到 builder 包**

```bash
mkdir -p packages/builder/src/utils
cp packages/utils/src/backoff.ts packages/builder/src/utils/backoff.ts
cp packages/utils/src/semaphore.ts packages/builder/src/utils/semaphore.ts
```

- [ ] **Step 4: 迁移 RSS 生成到 Vite 插件目录**

```bash
cp packages/utils/src/rss.ts apps/web/plugins/vite/rss.ts
```

- [ ] **Step 5: 提交迁移文件**

```bash
git add packages/ui/src/utils/ packages/data/src/u8array.ts packages/builder/src/utils/ apps/web/plugins/vite/rss.ts packages/ui/src/index.ts packages/data/src/index.ts packages/ui/package.json
git commit -m "refactor: migrate utils functions to their owning packages"
```

---

### Task 8: 更新所有导入路径（utils 消费者）

**Files:**
- Modify: 25 个 `packages/ui/src/**` 文件
- Modify: 23 个 `apps/web/src/**` 文件
- Modify: `packages/builder/src/storage/providers/s3-provider.ts`
- Modify: `packages/builder/src/photo/image-pipeline.ts`
- Modify: `packages/builder/src/photo/data-processors.ts`
- Modify: `packages/builder/src/photo/geocoding.ts`
- Modify: `packages/builder/src/index.ts`
- Modify: `apps/web/plugins/vite/feed-sitemap.ts`

- [ ] **Step 1: 更新 ui 包内部导入（@afilmory/utils → 相对路径）**

所有 `packages/ui/src/**` 中的 `from '@afilmory/utils'` 改为相对路径导入。

示例（每个文件按实际相对路径调整）：

`packages/ui/src/dropdown-menu.tsx`:
```diff
- import { clsxm } from '@afilmory/utils'
+ import { clsxm } from './utils/cn.js'
```

`packages/ui/src/thumbhash/index.tsx`:
```diff
- import { clsxm, decompressUint8Array } from '@afilmory/utils'
+ import { clsxm } from '../utils/cn.js'
+ import { decompressUint8Array } from '@afilmory/data'
```

`packages/ui/src/modal/ModalContainer.tsx`:
```diff
- import { clsxm, Spring } from '@afilmory/utils'
+ import { clsxm } from '../utils/cn.js'
+ import { Spring } from '../utils/spring.js'
```

`packages/ui/src/button/Button.tsx`:
```diff
- import { clsxm, focusRing } from '@afilmory/utils'
+ import { clsxm, focusRing } from '../utils/cn.js'
```

对所有 25 个文件执行类似变更。每个文件的相对路径根据其目录深度调整。

- [ ] **Step 2: 更新 apps/web/src 导入（@afilmory/utils → @afilmory/ui）**

所有 `apps/web/src/**` 中的 `from '@afilmory/utils'` 改为 `from '@afilmory/ui'`。

示例：

`apps/web/src/modules/gallery/FloatingActionButton.tsx`:
```diff
- import { clsxm, Spring } from '@afilmory/utils'
+ import { clsxm, Spring } from '@afilmory/ui'
```

`apps/web/src/lib/color.ts`:
```diff
- import { decompressUint8Array } from '@afilmory/utils'
+ import { decompressUint8Array } from '@afilmory/data'
```

注意：`decompressUint8Array` 应从 `@afilmory/data` 导入，不是 `@afilmory/ui`。

对所有 23 个文件执行类似变更。

- [ ] **Step 3: 更新 builder 包导入**

`packages/builder/src/storage/providers/s3-provider.ts`:
```diff
- import { backoffDelay, sleep } from '../../../../utils/src/backoff.js'
- import { Semaphore } from '../../../../utils/src/semaphore.js'
+ import { backoffDelay, sleep } from '../../utils/backoff.js'
+ import { Semaphore } from '../../utils/semaphore.js'
```

`packages/builder/src/photo/image-pipeline.ts`:
```diff
- import { compressUint8Array } from '@afilmory/utils'
+ import { compressUint8Array } from '@afilmory/data'
```

`packages/builder/src/photo/data-processors.ts`:
```diff
- import { decompressUint8Array } from '@afilmory/utils'
+ import { decompressUint8Array } from '@afilmory/data'
```

`packages/builder/src/photo/geocoding.ts` — 删除内联 sleep，使用统一版本：
```diff
- const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
+ import { sleep } from '../utils/backoff.js'
```

- [ ] **Step 4: 清理 builder 的 utils 重新导出**

`packages/builder/src/index.ts`:
```diff
- export * from '@afilmory/utils'
```

- [ ] **Step 5: 更新 feed-sitemap 插件的 RSS 导入**

`apps/web/plugins/vite/feed-sitemap.ts`:
```diff
- const { generateRSSFeed } = await import('@afilmory/utils')
+ const { generateRSSFeed } = await import('./rss.js')
```

- [ ] **Step 6: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit` (或各包的 type-check)
Expected: 无类型错误

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "refactor: update all import paths after utils migration"
```

---

### Task 9: 删除 packages/utils 和 packages/hooks，更新依赖

**Files:**
- Delete: `packages/utils/`
- Modify: `packages/builder/package.json` (移除 @afilmory/utils)
- Modify: `apps/web/package.json` (移除 @afilmory/utils)
- Modify: `package.json` (移除 @afilmory/hooks)

- [ ] **Step 1: 删除 packages/utils**

```bash
rm -rf packages/utils
```

- [ ] **Step 2: 更新 package.json 文件移除 @afilmory/utils 依赖**

`packages/builder/package.json`:
```diff
- "@afilmory/utils": "workspace:*",
```

`apps/web/package.json`:
```diff
- "@afilmory/utils": "workspace:*",
```

- [ ] **Step 3: pnpm install 并验证构建**

Run: `pnpm install && pnpm build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: remove @afilmory/utils and @afilmory/hooks packages"
```

---

### Task 10: 引入 Turborepo

**Files:**
- Create: `turbo.json`
- Modify: `package.json` (添加 turbo 依赖，更新 build 脚本)

- [ ] **Step 1: 创建 turbo.json**

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

- [ ] **Step 2: 添加 turbo 到根 devDependencies**

```diff
  "devDependencies": {
+   "turbo": "^2",
```

- [ ] **Step 3: 更新根 build 脚本使用 turbo**

```diff
- "build": "pnpm build:manifest && pnpm build:web",
+ "build": "pnpm build:manifest && turbo run build --filter=@afilmory/web",
```

注意：`build:manifest` 仍需单独运行（它是 CLI 工具，不是标准 build 任务）。

- [ ] **Step 4: 在 .gitignore 中添加 turbo 缓存目录**

追加：
```
.turbo
```

- [ ] **Step 5: pnpm install 并验证**

Run: `pnpm install && pnpm build`
Expected: 构建成功，Turbo 输出任务执行日志

- [ ] **Step 6: 提交**

```bash
git add turbo.json package.json .gitignore pnpm-lock.yaml
git commit -m "feat: introduce Turborepo for incremental builds"
```

---

### Task 11: 阶段二验证

- [ ] **Step 1: 完整构建验证**

Run: `pnpm build`
Expected: 构建成功

- [ ] **Step 2: 确认包结构**

Run: `ls packages/`
Expected: 只有 `builder/`, `data/`, `ui/`, `webgl-viewer/`

- [ ] **Step 3: 确认无残留导入**

Run: `grep -r "@afilmory/hooks\|@afilmory/utils" apps/web/src/ packages/`
Expected: 无匹配结果

- [ ] **Step 4: 打标签**

```bash
git tag refactor/phase2-restructure
```

---

## 阶段三：Vite 插件整合 + 测试

### Task 12: 删除废弃 Vite 插件

**Files:**
- Delete: `apps/web/plugins/vite/i18n-hmr.ts`
- Delete: `apps/web/plugins/vite/locales.ts`

- [ ] **Step 1: 确认未被引用**

Run: `grep -r "i18n-hmr\|i18nHmr\|customI18nHmr" apps/web/vite.config.ts apps/web/plugins/`
Run: `grep -r "locales\.ts\|localesPlugin" apps/web/vite.config.ts apps/web/plugins/`
Expected: 无匹配（仅在自身文件中）

- [ ] **Step 2: 删除文件**

```bash
rm apps/web/plugins/vite/i18n-hmr.ts apps/web/plugins/vite/locales.ts
```

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore: remove unused Vite plugins (i18n-hmr, locales)"
```

---

### Task 13: 合并数据注入插件（manifest-inject + site-config-inject → data-inject）

**Files:**
- Create: `apps/web/plugins/vite/data-inject.ts`
- Modify: `apps/web/vite.config.ts`
- Delete: `apps/web/plugins/vite/manifest-inject.ts`
- Delete: `apps/web/plugins/vite/site-config-inject.ts`

- [ ] **Step 1: 读取两个源插件的完整代码**

读取 `apps/web/plugins/vite/manifest-inject.ts` 和 `apps/web/plugins/vite/site-config-inject.ts`，理解其完整逻辑。

- [ ] **Step 2: 创建合并后的 data-inject.ts**

创建 `apps/web/plugins/vite/data-inject.ts`，合并两个插件的功能：
- 导出 `dataInjectPlugin()` 函数，返回一个 Vite 插件
- 在 `transformIndexHtml` 中同时注入 `__MANIFEST__` 和 `__SITE_CONFIG__`
- 保留 manifest 的开发环境文件监听和 HMR 逻辑
- 保留 site-config 的注入逻辑
- 插件名改为 `data-inject`

- [ ] **Step 3: 更新 vite.config.ts 导入**

```diff
- import { manifestInjectPlugin } from './plugins/vite/manifest-inject.js'
- import { siteConfigInjectPlugin } from './plugins/vite/site-config-inject.js'
+ import { dataInjectPlugin } from './plugins/vite/data-inject.js'
```

在插件数组中：
```diff
- manifestInjectPlugin(),
- siteConfigInjectPlugin(),
+ dataInjectPlugin(),
```

- [ ] **Step 4: 删除旧插件文件**

```bash
rm apps/web/plugins/vite/manifest-inject.ts apps/web/plugins/vite/site-config-inject.ts
```

- [ ] **Step 5: 验证构建**

Run: `pnpm build`
Expected: 构建成功，index.html 中包含 `__MANIFEST__` 和 `__SITE_CONFIG__` 注入

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor: merge manifest-inject and site-config-inject into data-inject plugin"
```

---

### Task 14: 合并构建时生成插件（og-image + feed-sitemap → build-assets）

**Files:**
- Create: `apps/web/plugins/vite/build-assets.ts`
- Modify: `apps/web/vite.config.ts`
- Delete: `apps/web/plugins/vite/og-image-plugin.ts`
- Delete: `apps/web/plugins/vite/feed-sitemap.ts`

- [ ] **Step 1: 读取两个源插件的完整代码**

读取 `apps/web/plugins/vite/og-image-plugin.ts` 和 `apps/web/plugins/vite/feed-sitemap.ts`，理解其完整逻辑。

- [ ] **Step 2: 创建合并后的 build-assets.ts**

创建 `apps/web/plugins/vite/build-assets.ts`，合并两个插件的功能：
- 导出 `buildAssetsPlugin()` 函数
- `buildStart` 中执行：generateFavicons、generateOGImage、cleanupOldOGImages
- `generateBundle` 中执行：生成 RSS feed、生成 sitemap.xml
- `transformIndexHtml` 中注入 OG meta 标签
- 保留 `apply: 'build'` 限制
- 插件名改为 `build-assets`

- [ ] **Step 3: 更新 vite.config.ts 导入**

```diff
- import { ogImagePlugin } from './plugins/vite/og-image-plugin.js'
- import { createFeedSitemapPlugin } from './plugins/vite/feed-sitemap.js'
+ import { buildAssetsPlugin } from './plugins/vite/build-assets.js'
```

在插件数组中：
```diff
- ogImagePlugin(),
- createFeedSitemapPlugin(),
+ buildAssetsPlugin(),
```

- [ ] **Step 4: 删除旧插件文件**

```bash
rm apps/web/plugins/vite/og-image-plugin.ts apps/web/plugins/vite/feed-sitemap.ts
```

- [ ] **Step 5: 验证构建**

Run: `pnpm build`
Expected: 构建成功，dist 中包含 RSS feed、sitemap.xml、OG 图片、favicon

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor: merge og-image and feed-sitemap into build-assets plugin"
```

---

### Task 15: 引入 Vitest 并编写基础测试

**Files:**
- Create: `vitest.workspace.ts`
- Modify: `package.json` (添加 vitest, @testing-library/react, jsdom)
- Create: `packages/data/src/__tests__/u8array.test.ts`
- Create: `packages/ui/src/hooks/__tests__/useControlled.test.ts`

- [ ] **Step 1: 添加 vitest 依赖**

在根 `package.json` 的 `devDependencies` 中添加：
```diff
+ "vitest": "^3",
+ "@testing-library/react": "^16",
+ "jsdom": "^26",
```

- [ ] **Step 2: 创建 vitest.workspace.ts**

```typescript
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'data',
      root: './packages/data',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'ui',
      root: './packages/ui',
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
    },
  },
])
```

- [ ] **Step 3: 添加 test 脚本到根 package.json**

```diff
  "scripts": {
+   "test": "vitest run",
```

- [ ] **Step 4: 编写 u8array 测试**

创建 `packages/data/src/__tests__/u8array.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import { compressUint8Array, decompressUint8Array } from '../u8array.js'

describe('u8array', () => {
  it('should compress and decompress roundtrip', () => {
    const original = new Uint8Array([0, 127, 255, 1, 128])
    const compressed = compressUint8Array(original)
    const decompressed = decompressUint8Array(compressed)
    expect(decompressed).toEqual(original)
  })

  it('should compress to hex string', () => {
    const input = new Uint8Array([0, 15, 255])
    expect(compressUint8Array(input)).toBe('000fff')
  })

  it('should handle empty array', () => {
    const original = new Uint8Array([])
    const compressed = compressUint8Array(original)
    const decompressed = decompressUint8Array(compressed)
    expect(decompressed).toEqual(original)
  })
})
```

- [ ] **Step 5: 编写 useControlled 测试**

创建 `packages/ui/src/hooks/__tests__/useControlled.test.ts`:
```typescript
import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useControlled } from '../useControlled.js'

describe('useControlled', () => {
  it('should use defaultValue when uncontrolled', () => {
    const { result } = renderHook(() => useControlled({ defaultValue: 'hello' }))
    expect(result.current[0]).toBe('hello')
  })

  it('should use value when controlled', () => {
    const { result } = renderHook(() => useControlled({ value: 'controlled' }))
    expect(result.current[0]).toBe('controlled')
  })

  it('should update state when uncontrolled', () => {
    const { result } = renderHook(() => useControlled({ defaultValue: 'initial' }))
    act(() => { result.current[1]('updated') })
    expect(result.current[0]).toBe('updated')
  })
})
```

- [ ] **Step 6: pnpm install 并运行测试**

Run: `pnpm install && pnpm test`
Expected: 所有测试通过

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: introduce Vitest with basic test coverage for data and ui packages"
```

---

### Task 16: 阶段三验证

- [ ] **Step 1: 完整构建验证**

Run: `pnpm build`
Expected: 构建成功

- [ ] **Step 2: 测试验证**

Run: `pnpm test`
Expected: 所有测试通过

- [ ] **Step 3: 确认插件结构**

Run: `ls apps/web/plugins/vite/`
Expected: `ast.ts`, `build-assets.ts`, `data-inject.ts`, `deps.ts`, `locales-json.ts`, `photos-static.ts`, `rss.ts`

- [ ] **Step 4: 打标签**

```bash
git tag refactor/phase3-plugins-tests
```

---

## 最终验证清单

- [ ] `pnpm install` 无错误
- [ ] `pnpm build` 成功
- [ ] `pnpm test` 全部通过
- [ ] `ls packages/` 只有 builder, data, ui, webgl-viewer
- [ ] `grep -r "@afilmory/hooks\|@afilmory/utils" apps/ packages/` 无结果
- [ ] `ls apps/web/plugins/vite/` 只有 6+1 个文件（6 个插件 + rss.ts）
- [ ] Turbo 缓存正常工作（第二次 build 应该命中缓存）
