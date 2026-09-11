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

For a zero-credential first look, run `pnpm dev:demo`. It uses only the
committed synthetic fixture and never reads a private `.env` or generated
manifest.

## Common Commands

```bash
pnpm dev
pnpm dev:demo
pnpm contracts
pnpm lint
pnpm format:check
pnpm type-check
pnpm test
pnpm build
```

`pnpm dev` and `pnpm build` run `apps/web/scripts/precheck.ts` first. With `PHOTO_STORAGE_PROVIDER=local`, precheck refreshes from `LOCAL_PHOTOS_PATH` without S3 credentials. In the default S3 mode, `S3_BUCKET_NAME` is required; the access key and secret are optional as a pair, and omitting both uses the AWS SDK default credential chain. Missing required configuration may reuse an existing manifest outside strict production builds.

## Photo Manifest

- `pnpm build:manifest` runs the builder and writes `generated/photos-manifest.json` plus generated thumbnails.
- `pnpm build:web` builds only the Vite app and expects a manifest to already exist.
- `SKIP_MANIFEST_BUILD=true pnpm build` skips the builder intentionally.
- Production web builds load data through `window.__AFILMORY__.manifest`; the default production mode emits Web Delivery Manifest v3 (`gallery-index`, stable photo-detail shards, and a map shard) while the Builder's disk contract remains manifest v2.
- Local-provider web builds copy `LOCAL_PHOTOS_PATH` into the static output under `LOCAL_PHOTOS_BASE_URL`; S3 originals remain remote.

## Before Opening a PR

Run:

```bash
pnpm contracts
pnpm lint
pnpm format:check
pnpm type-check
pnpm test:coverage
pnpm coverage:check:partitions
pnpm deploy:smoke
```

For photo viewer or WebGL changes, include the relevant viewer tests and `@afilmory/webgl-viewer` verification in the PR notes.

When a schema or E2E fixture generator changes, run `pnpm check:fixtures` and
commit the deterministic synthetic result. Never derive test fixtures from a
real photo library: filenames, EXIF, URLs, and GPS are personal data.

## Contributions and DCO

Inbound contributions use the same terms as the path being changed, as mapped
by `ANL-MANIFEST`. By opening a pull request, you confirm that you have the right
to submit the contribution under those terms. The project does not require a
separate CLA.

DCO 1.1 sign-off is supported as an optional commit-level record of that
confirmation. Use `git commit -s` to add `Signed-off-by: Name <email>` when you
want that record. Because sign-off is optional, CI does not reject otherwise
valid contributions without it; the PR authorship confirmation remains
required. See [licensing.md](licensing.md) for the path classification.

## Security and community

Read the [Security Policy](../SECURITY.md) before reporting a vulnerability and never post secrets,
private manifests, photo URLs, or exact coordinates in an issue. All project
spaces follow the [Code of Conduct](../CODE_OF_CONDUCT.md). Notable Project Code changes belong in the
Unreleased section of [CHANGELOG.md](../CHANGELOG.md); releases follow [releasing.md](releasing.md).
