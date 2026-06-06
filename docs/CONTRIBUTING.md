# Contributing

## Setup

This repository is a pnpm workspace. The main app is `apps/web`; photo processing lives in `packages/builder`; shared manifest/photo schema lives in `packages/schema`; pure media helpers live in `packages/media`.

Prerequisites:

- Node.js `^20.19.0 || >=22.12.0`
- pnpm 10.19.0

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

## Common Commands

```bash
pnpm dev
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

`pnpm dev` and `pnpm build` run `apps/web/scripts/precheck.ts` first. When S3 credentials are present, precheck refreshes `generated/photos-manifest.json`; when credentials are missing but an existing manifest is available, it reuses that manifest.

## Photo Manifest

- `pnpm build:manifest` runs the builder and writes `generated/photos-manifest.json` plus generated thumbnails.
- `pnpm build:web` builds only the Vite app and expects a manifest to already exist.
- `SKIP_MANIFEST_BUILD=true pnpm build` skips the builder intentionally.
- Production web builds load the manifest through `window.__AFILMORY__.manifest`; the default production mode emits a hashed `assets/photos-manifest.<hash>.json` file.

## Before Opening a PR

Run:

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

For photo viewer or WebGL changes, include the relevant viewer tests and `@afilmory/webgl-viewer` verification in the PR notes.
