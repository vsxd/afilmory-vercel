# Contributing

## Setup

```bash
pnpm install --frozen-lockfile
```

This repository is a pnpm workspace. The main app is `apps/web`; photo processing lives in `packages/builder`.

## Common Commands

```bash
pnpm dev
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

`pnpm build` refreshes the photo manifest before building the static site. If you do not have S3 credentials but already have a local `generated/photos-manifest.json`, the build precheck will reuse it.

## Photo Manifest

- `pnpm build:manifest` runs the builder and writes `generated/photos-manifest.json`.
- `pnpm build:web` builds only the Vite app and expects a manifest to already exist.
- `SKIP_MANIFEST_BUILD=true pnpm build` skips the builder intentionally.

## Before Opening a PR

Run:

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

For photo viewer or WebGL changes, include the relevant viewer tests and `@afilmory/webgl-viewer` verification in the PR notes.
