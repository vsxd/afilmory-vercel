# Code Review: Architecture Refactor Follow-up

## Scope

Review target covers the previous architecture-related changes:

- Builder/Web path centralization
- Data-layer runtime manifest decoupling
- Architecture guard script
- Web global type boundary updates

## Findings & Decisions

### 1) Architecture guard script testability

- **Issue**: `scripts/check-architecture.ts` originally mixed FS scanning, validation logic, and CLI output in one file, making unit testing difficult.
- **Risk**: Rules could regress silently because only end-to-end invocation was verifiable.
- **Action**: Extracted pure validation logic to `scripts/check-architecture-lib.ts` and kept `scripts/check-architecture.ts` as thin IO/CLI wrapper.

### 2) Data loader factory null semantics

- **Issue**: `createRuntimePhotoLoader(manifest ?? resolveRuntimeManifest())` treated explicit `null` and omitted parameter the same.
- **Risk**: Callers could not intentionally construct an empty loader when runtime manifest exists.
- **Action**: Updated `createRuntimePhotoLoader` to distinguish:
  - argument omitted => resolve runtime manifest,
  - argument provided (including `null`) => use provided value.

### 3) Test coverage gap

- **Issue**: No unit tests for newly introduced architectural seams.
- **Risk**: Refactor behavior (especially resolution order and layering checks) may break unnoticed.
- **Action**: Added unit tests for:
  - runtime manifest resolution order,
  - photo loader domain behavior,
  - architecture validator graph rules.

## Residual Risks (Not changed in this round)

1. `PhotoLoader` constructor still emits logs in test/runtime paths; could be further abstracted behind logger injection.
2. architecture check currently scans only top-level `apps/*` and `packages/*`; nested workspace conventions would require extending scanner strategy.

## Verification

All new tests pass, and lint/type-check/architecture checks pass.
