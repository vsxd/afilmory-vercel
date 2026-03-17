# Spec: Data 层运行时 Manifest 访问重构（职责拆分 + 类型边界收敛）

## 1. 背景

目前 `@afilmory/data` 的 `PhotoLoader` 同时承担了三类职责：

1. 运行时环境探测（`window` / 全局变量读取）
2. Manifest 读取与容错
3. 领域查询（按 id 查询、标签聚合、相机/镜头列表）

这导致 Data 层存在以下架构问题：

- **职责混杂**：环境接入逻辑与领域查询逻辑耦合在一个类构造函数中。
- **类型边界不清晰**：大量 `any` 与 `(window as any)`，弱化了跨包类型约束。
- **应用层反向依赖风险**：`apps/web/src/global.d.ts` 通过 builder 内部路径拿 `AfilmoryManifest` 类型，不符合“共享类型由 data 提供”的分层原则。

## 2. 目标

- 将“运行时 Manifest 接入”从 `PhotoLoader` 中拆出为独立模块。
- 保留现有调用方式（`photoLoader.getPhotos()`）的兼容性。
- 将 Web 全局类型声明收敛到 `@afilmory/data/types`，消除对 builder 内部路径的依赖。

## 3. 非目标

- 不改动 manifest 结构。
- 不改动 UI 或路由行为。
- 不引入新的运行时依赖。

## 4. 设计

### 4.1 新增 Runtime Manifest Source 模块

新增 `packages/data/src/runtime-manifest.ts`：

- 定义统一的运行时全局接口 `RuntimeManifestGlobal`。
- 提供 `resolveRuntimeManifest()`：
  - 按优先级读取 `window.__MANIFEST__` -> `globalThis.__MANIFEST__`。
  - 返回强类型 `AfilmoryManifest | null`。

### 4.2 拆分 PhotoLoader 领域层

将 `PhotoLoader` 重构为纯领域查询对象：

- 构造函数接收 `AfilmoryManifest | null`，不再直接探测环境。
- 增加工厂函数 `createPhotoLoader(manifest?: AfilmoryManifest | null)`。
- 默认 singleton `photoLoader` 使用 `resolveRuntimeManifest()` 生成，保持现有 API 不变。

### 4.3 Web 类型边界修复

`apps/web/src/global.d.ts`：

- 将 `AfilmoryManifest` 类型来源由 builder 内部路径改为 `@afilmory/data/types`。
- 声明 `Window.__MANIFEST__?: AfilmoryManifest`，减少 `any` 透传。

## 5. 迁移策略

- 对调用方无破坏性迁移：旧代码继续使用 `photoLoader`。
- 新场景可逐步使用 `createPhotoLoader(...)`（例如测试或 SSR 场景注入 manifest）。

## 6. 验证

1. lint 相关改动文件。
2. `apps/web` 与 `packages/data` 类型检查。
3. `pnpm check:architecture` 验证分层规则未回退。
