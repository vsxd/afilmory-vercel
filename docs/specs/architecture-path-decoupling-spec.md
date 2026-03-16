# Spec: Builder/Web 路径耦合解耦（Architecture-Level Refactor）

## 1. 背景与问题定义

当前代码中，Builder 与 Web 的产物路径通过硬编码字符串分散在多个模块：

- `src/data/photos-manifest.json`
- `public/thumbnails`
- `public/originals`

这会带来三个架构问题：

1. **耦合过深**：Builder 逻辑直接绑定 `apps/web` 的目录结构。
2. **可迁移性弱**：若未来 Web app 路径调整（如 `apps/site`），需要多点修改。
3. **一致性风险**：不同模块使用不同路径来源，易产生路径漂移。

## 2. 目标（Goals）

- 提供 **单一来源（Single Source of Truth）** 的路径定义。
- 支持环境变量覆盖，提升独立调试和未来迁移能力。
- 让 Vite 插件通过包导出解析 manifest 路径，避免依赖 monorepo 相对路径。

## 3. 非目标（Non-Goals）

- 不调整 manifest 数据结构。
- 不变更 builder 的业务流程（扫描、提取 EXIF、缩略图生成）。
- 不引入新的外部依赖。

## 4. 方案设计

### 4.1 Builder 路径中心化

在 `packages/builder/src/path.ts` 中统一导出：

- `WEB_WORKDIR`
- `MANIFEST_PATH`
- `THUMBNAILS_DIR`
- `ORIGINALS_DIR`

并支持：

- `AFILMORY_WEB_DIR` 覆盖默认 `apps/web` 路径。

### 4.2 消费方改造

替换各模块中的硬编码路径拼接，统一依赖路径常量：

- `manifest/manager.ts`
- `manifest/migrate.ts`
- `image/thumbnail.ts`
- `photo/data-processors.ts`
- `storage/providers/eagle-provider.ts`
- `plugins/github-repo-sync.ts`

### 4.3 Web Vite 插件解耦

`apps/web/plugins/vite/__internal__/constants.ts`：

- `MANIFEST_PATH` 改为通过 `require.resolve('@afilmory/data/manifest')` 解析。
- 增加 `AFILMORY_MANIFEST_PATH` 作为显式覆盖。
- `MONOREPO_ROOT_PATH` 增加 `AFILMORY_MONOREPO_ROOT` 覆盖。

## 5. 验证策略

1. ESLint 校验改动文件。
2. Builder TypeScript 编译校验。
3. 架构守卫校验（`pnpm check:architecture`）。

## 6. 回滚策略

若出现路径异常，回滚至此前版本并优先检查以下环境变量是否设置错误：

- `AFILMORY_WEB_DIR`
- `AFILMORY_MANIFEST_PATH`
- `AFILMORY_MONOREPO_ROOT`
