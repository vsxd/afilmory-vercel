# Afilmory Builder

`@afilmory/builder` is the build-time photo processing engine for Afilmory Vercel. It reads source photos from S3-compatible object storage (the default) or a configured local directory, generates thumbnails and manifest data, and hands a static data set to the web app.

## Current Architecture

```text
src/
├── builder/                 # AfilmoryBuilder orchestration
│   └── workflow/            # session, scan, diff, process, assemble, write
├── cli.ts                   # Builder CLI used by pnpm build:manifest
├── config/                  # define/load/resolve builder config
├── constants/               # supported image formats
├── core/
│   ├── contracts/           # service, plugin, and processing contracts
│   └── services/            # service registry passed into plugins/pipeline
├── image/                   # EXIF, histogram, thumbnail, image preprocessing
├── logger/                  # tagged consola loggers
├── manifest/                # manifest v2 read/write/version helpers
├── photo/                   # per-photo processing pipeline
├── plugins/                 # geocoding and artifact helpers
├── s3/                      # S3 client construction
├── storage/                 # storage interfaces, manager, S3 + local providers
├── types/                   # public builder option/config/photo types
├── utils/                   # backoff, clone, semaphore helpers
└── worker/                  # worker pool and cluster pool
```

The shared manifest and photo types are imported from `@afilmory/schema`, with builder-specific options kept under `packages/builder/src/types`.

`AfilmoryBuilder` is intentionally thin. The build run is coordinated through `builder/workflow`: `BuildSession` carries explicit runtime state, `SourceScanner` reads storage objects, `DiffPlanner` decides changed work, `PhotoTaskProcessor` runs worker/cluster execution, `ManifestAssembler` merges existing and processed items, and `ArtifactWriter` saves manifest artifacts. Keep new responsibilities in these workflow modules rather than growing the builder class again.

## Default Site Configuration

The root `builder.config.ts` is the source of truth for this repository:

- `output.manifestPath`: `generated/photos-manifest.json`
- `output.thumbnailsDir`: `apps/web/public/thumbnails`
- `output.originalsDir`: `apps/web/public/originals`
- `storage.provider`: selected by `PHOTO_STORAGE_PROVIDER`, default `s3`
- `storage.bucket`: `S3_BUCKET_NAME`
- `storage.region`: `S3_REGION`, defaulted by `env.ts` to `us-east-1`
- `storage.endpoint`: `S3_ENDPOINT`, defaulted by `env.ts`
- `storage.customDomain`: optional CDN/public domain

The default deployment path uses S3; setting `PHOTO_STORAGE_PROVIDER=local` selects the built-in local adapter. `StorageConfig` is a discriminated union on `provider`; further photo-source support should be added as a new `StorageProvider` implementation dispatched in `StorageManager`, not through a global storage registry.

## Local filesystem provider (zero-credential runs)

The builder also ships a `provider: "local"` storage backend, so a full local run needs no object-storage credentials at all. The root configuration exposes it directly:

```bash
PHOTO_STORAGE_PROVIDER=local
LOCAL_PHOTOS_PATH=photos
LOCAL_PHOTOS_BASE_URL=/originals
```

How the dev story fits together:

1. Put photos in a local directory (the repo-root `photos/` dir matches the defaults).
2. Run `pnpm build:manifest` — the builder scans `LOCAL_PHOTOS_PATH`, generates thumbnails, and writes a manifest whose `originalUrl`s look like `/originals/dir/img.jpg` (the configured URL prefix plus the encoded key).
3. Run `pnpm dev` — `apps/web/plugins/vite/photos-static.ts` serves the configured URL prefix from the configured local directory.
4. Run `pnpm build` for a self-contained static result; the web build copies local originals into `apps/web/dist` under the same URL prefix.

The manifest `source` field records local runs without publishing the machine's absolute source path. `@afilmory/schema`'s `ManifestSource` models `s3`/`local`/`unknown` and preserves the `local` variant on reload.

## Operational environment variables

These environment variables tune a build run without editing `builder.config.ts`. All are optional.

- `BUILDER_WORKER_COUNT` — child-process count (positive integer). Defaults to half the available CPU parallelism, rounded up and capped at 4. Each child handles at most 2 tasks concurrently; the global task budget is capped at 8 and the available CPU parallelism. Increasing the process count alone does not increase that global budget.
- `BUILDER_USE_CLUSTER_MODE` — `true` (default) runs the multi-process cluster pool; set it to `false` to fall back to a single-process concurrency pool when the current Node environment cannot clone plugin hooks into workers.
- `BUILDER_FAIL_ON_PHOTO_ERROR` — `false` by default, so the build still publishes the remaining photos when some fail. Set it to `true` for strict mode: any photo failure exits the build with a non-zero status code.
- `THUMBNAIL_STORAGE_CLEANUP` — controls remote thumbnail orphan cleanup. Defaults to a dry-run that only reports orphaned thumbnails; set it to `true` to actually delete them from remote storage.

## CLI Usage

From the repository root:

```bash
pnpm build:manifest
pnpm build:manifest -- --force
pnpm build:manifest -- --force-thumbnails
pnpm build:manifest -- --force-manifest
pnpm build:manifest -- --config
```

The root script runs the builder CLI through `tsx`. The config file is `builder.config.ts` at the repo root, found by c12's `builder` name convention.

Build modes:

- `--force`: reprocess all photos.
- `--force-thumbnails`: regenerate thumbnails and ThumbHash data.
- `--force-manifest`: refresh manifest-derived metadata such as EXIF and tone analysis.
- `--no-ui`: disable the TUI and use traditional log output.

## Programmatic Usage

Use `defineBuilderConfig` for config files and `AfilmoryBuilder` for direct orchestration:

```ts
import {
  AfilmoryBuilder,
  defineBuilderConfig,
  resolveBuilderConfig,
} from "@afilmory/builder";

const config = defineBuilderConfig(() => ({
  storage: {
    provider: "s3",
    bucket: process.env.S3_BUCKET_NAME,
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  output: {
    manifestPath: "generated/photos-manifest.json",
    thumbnailsDir: "apps/web/public/thumbnails",
    originalsDir: "apps/web/public/originals",
  },
}));

const builder = new AfilmoryBuilder(resolveBuilderConfig(config));
await builder.buildManifest({
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
});
```

Most repository workflows should use `pnpm build:manifest` instead of constructing the builder manually.

The package root is intentionally narrow. It exposes the builder class,
configuration helpers, official plugins, and the types needed to configure or
observe a build. Internal workflow modules, image pipeline helpers, worker
pools, and storage managers are not public API.

## Processing Pipeline

For each changed photo, the builder:

1. Downloads the original source object through the configured storage manager.
2. Preprocesses supported formats, including HEIC/HEIF/HIF and BMP conversion paths.
3. Extracts image metadata with Sharp.
4. Generates a 600px-wide JPEG thumbnail and ThumbHash placeholder data.
5. Extracts EXIF with `exiftool-vendored`.
6. Detects Ultra HDR gain map metadata and Motion Photo metadata.
7. Detects Live Photo sidecar video pairs.
8. Calculates histogram/tone analysis.
9. Builds a `PhotoManifestItem`.
10. Emits plugin lifecycle hooks and writes the final manifest.

Existing manifest items are reused when the source object's modified time, size, and etag indicate no relevant change.

## Manifest Output

The builder writes an `AfilmoryManifest`:

```ts
type AfilmoryManifest = {
  schema: "afilmory.manifest";
  version: 2;
  generatedAt: string;
  source: ManifestSource; // s3, local, or unknown; defined by @afilmory/schema
  photos: PhotoManifestItem[];
  indexes: {
    cameras: CameraInfo[];
    lenses: LensInfo[];
  };
};
```

Photo items include `originalUrl`, `thumbnailUrl`, `thumbHash`, EXIF, tone analysis, optional location, optional `video`, and optional `isHDR`.

## Plugins and Cache

Plugins are loaded from explicit `plugins` entries:

- Optional geocoding plugin when configured.
- Optional thumbnail artifact upload support for cache-aware builds.

## Performance Notes

- `system.processing.worker.globalTaskConcurrency` sets the shared task budget for either execution mode; `system.processing.defaultConcurrency` is the fallback when that budget is absent. A programmatic `concurrencyLimit` overrides both for one run.
- `system.processing.worker` holds `processCount`, `workerConcurrency`, and `globalTaskConcurrency` for cluster execution.
- Cluster mode is enabled by default in `builder.config.ts` through `system.processing.worker.useClusterMode`.
- S3 downloads use an internal semaphore and network timeout/retry settings.
- Thumbnail, EXIF, and tone-analysis data are reused from the existing manifest where possible.

## Related Docs

- [Photo pipeline](src/photo/README.md)
- [Storage providers (S3 + local filesystem)](src/storage/providers/README.md)
- [Shared schema package](../schema/README.md)
