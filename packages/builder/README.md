# Afilmory Builder

`@afilmory/builder` is the build-time photo processing engine for Afilmory Vercel. In the default site configuration it reads source photos from S3-compatible object storage, generates thumbnails and manifest data, and hands a static data set to the web app.

## Current Architecture

```text
src/
├── builder/                 # AfilmoryBuilder orchestration
├── cli.ts                   # Builder CLI used by pnpm build:manifest
├── config/                  # define/load/resolve builder config
├── constants/               # supported image formats
├── core/
│   ├── contracts/           # service, plugin, and processing contracts
│   └── services/            # service registry passed into plugins/pipeline
├── image/                   # EXIF, histogram, thumbnail, image preprocessing
├── logger/                  # tagged consola loggers
├── manifest/                # manifest read/write/migration/version helpers
├── photo/                   # per-photo processing pipeline
├── plugins/                 # storage, geocoding, thumbnail cache, repo sync
├── s3/                      # S3 client construction
├── storage/                 # storage interfaces, manager, S3 provider
├── types/                   # public builder option/config/photo types
├── utils/                   # backoff, clone, semaphore helpers
└── worker/                  # worker pool and cluster pool
```

The shared manifest and photo types are imported from `@afilmory/data`, with builder-specific options kept under `packages/builder/src/types`.

## Default Site Configuration

The root `builder.config.ts` is the source of truth for this repository:

- `output.manifestPath`: `generated/photos-manifest.json`
- `output.thumbnailsDir`: `apps/web/public/thumbnails`
- `output.originalsDir`: `apps/web/public/originals`
- `storage.provider`: `s3`
- `storage.bucket`: `S3_BUCKET_NAME`
- `storage.region`: `S3_REGION`, defaulted by `env.ts` to `us-east-1`
- `storage.endpoint`: `S3_ENDPOINT`, defaulted by `env.ts`
- `storage.customDomain`: optional CDN/public domain
- `repo.enable`: true only when `REPO_URL` and `REPO_TOKEN` (or compatibility aliases) are present

The documented deployment path is S3-only. Some extension points and historical providers still exist in source, but they are not the supported static-site path for this repo.

## CLI Usage

From the repository root:

```bash
pnpm build:manifest
pnpm build:manifest -- --force
pnpm build:manifest -- --force-thumbnails
pnpm build:manifest -- --force-manifest
pnpm build:manifest -- --config
```

The root script sets `BUILDER_CONFIG_PATH=builder.config.ts` and runs the builder CLI through `tsx`.

Build modes:

- `--force`: reprocess all photos.
- `--force-thumbnails`: regenerate thumbnails and ThumbHash data.
- `--force-manifest`: refresh manifest-derived metadata such as EXIF and tone analysis.
- `--no-ui`: disable the TUI and use traditional log output.

## Programmatic Usage

Use `defineBuilderConfig` for config files and `AfilmoryBuilder` for direct orchestration:

```ts
import { AfilmoryBuilder, defineBuilderConfig } from "@afilmory/builder";

export default defineBuilderConfig(() => ({
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

const builder = new AfilmoryBuilder(resolvedConfig);
await builder.buildManifest({
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
});
```

Most repository workflows should use `pnpm build:manifest` instead of constructing the builder manually.

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
  version: string;
  data: PhotoManifestItem[];
  cameras: CameraInfo[];
  lenses: LensInfo[];
};
```

Photo items include `originalUrl`, `thumbnailUrl`, `thumbHash`, EXIF, tone analysis, optional location, optional `video`, and optional `isHDR`.

## Plugins and Cache

Plugins are loaded automatically based on config and explicit `plugins` entries:

- S3 storage plugin for the default storage provider.
- Optional geocoding plugin when configured.
- Optional Git repo sync plugin when `repo.enable` is true.
- Optional thumbnail storage support for cache-aware builds.

`REPO_URL`/`REPO_TOKEN` cache generated manifest/thumbnails in a Git repository. They do not change the source photo storage, which remains S3 for this project.

## Performance Notes

- `system.processing.defaultConcurrency` controls logical processing concurrency.
- Cluster mode is enabled by default in `builder.config.ts` through `system.observability.performance.worker.useClusterMode`.
- S3 downloads use an internal semaphore and network timeout/retry settings.
- Thumbnail, EXIF, and tone-analysis data are reused from the existing manifest where possible.

## Related Docs

- [Photo pipeline](src/photo/README.md)
- [S3 storage provider](src/storage/providers/README.md)
- [Shared data types](../data/src/types.ts)
