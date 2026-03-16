# Architecture Review & Best-Practice Optimization

## Executive Summary

当前仓库已经采用了相对清晰的 Monorepo 分层（`apps` + `packages`），并且将共享类型集中在 `@afilmory/data`，这是非常正确的方向。为了把这些“架构约定”从**文档约定**升级为**可执行约束**，本次优化新增了架构守卫脚本：

- 自动检查 workspace 间循环依赖
- 禁止 package 反向依赖 app
- 强制 `@afilmory/data` 维持基础层（不可依赖其他 workspace 包）

## Observed Architecture

```text
apps/web
  └─ depends on packages/*

packages/data   (foundation)
packages/utils  (depends on data)
packages/hooks
packages/ui     (depends on hooks/utils)
packages/webgl-viewer
packages/builder(depends on data/utils)
```

这套结构符合“由下到上依赖”的最佳实践：基础层（data）→ 能力层（utils/hooks）→ 组件层（ui/webgl）→ 应用层（web）。

## Risks Before Optimization

1. **缺少自动化约束**
   - 当前主要依靠团队约定来保持分层，随着包增多，容易出现“悄悄跨层依赖”。
2. **循环依赖回归风险**
   - 之前已完成一次循环依赖解耦，但没有持续守卫，后续改动可能引入回归。
3. **基础层漂移风险**
   - `@afilmory/data` 作为类型源头，应尽量稳定、零反向依赖。

## Refactor / Optimization Applied

### 1) Add architecture guard script

新增 `scripts/check-architecture.ts`，在 CI/本地均可运行：

- 扫描 `apps/*` 与 `packages/*` 的 `package.json`
- 构建 workspace 依赖图
- DFS 检测循环依赖
- 检查 package -> app 的非法依赖
- 检查 `@afilmory/data` 是否依赖其他 workspace 包

### 2) Expose script in root package.json

新增 npm script：

```bash
pnpm check:architecture
```

便于在 CI 或 pre-merge 阶段接入。

## Recommended Next Steps

1. 在 CI 中强制执行 `pnpm check:architecture`
2. 后续可扩展规则：
   - 强制 `apps/*` 不被其他 workspace 依赖
   - 约束 `packages/ui` 不直接依赖 `packages/builder`
3. 若项目继续扩展，可考虑把规则迁移到 dependency-cruiser 或 Nx graph policy。

## Validation

本次变更已通过：

```bash
pnpm check:architecture
```

输出：`✅ 架构检查通过`
