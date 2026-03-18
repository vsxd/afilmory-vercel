# Spec: Data Query Kernel Refactor (No-Behavior-Change)

## Context

After splitting runtime manifest resolution from `PhotoLoader`, the data layer still mixed query algorithms and side-effect outputs in a single class implementation.

## Goals

1. Keep runtime behavior unchanged for application callers.
2. Further separate **query kernel** (pure functions) from **orchestration** (`PhotoLoader`).
3. Improve deterministic testing and reduce implicit console side effects in tests.

## Design

- Introduce `packages/data/src/manifest-queries.ts` with pure functions:
  - `createPhotoMap(photos)`
  - `collectSortedTags(photos)`
- Keep `PhotoLoader` API stable while:
  - delegating query work to pure functions,
  - adding optional `PhotoLoaderLogger` injection (defaults to `console`).
- Keep `createPhotoLoader` backward compatible while supporting optional logger.
- Add `resolveRuntimeManifestFrom(runtimeGlobal)` pure helper in runtime manifest module;
  preserve existing `resolveRuntimeManifest()` behavior by delegating to it.

## Validation

- Unit tests for new query kernel.
- Unit tests for loader behavior with injected logger.
- Existing architecture checks and web type-check must still pass.
