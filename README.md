# Afilmory Vercel

English | [简体中文](./README.zh-CN.md)

<p align="center">
  <img src="docs/assets/afilmory-readme.webp" alt="Afilmory" width="100%" />
</p>

<p align="center">
  <strong>An S3-first photo gallery with a zero-credential local mode and static Vercel deployment</strong>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-live-demo">Live Demo</a>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel&env=S3_BUCKET_NAME,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_ENDPOINT,S3_PREFIX,S3_CUSTOM_DOMAIN,S3_EXCLUDE_REGEX,SITE_NAME,SITE_TITLE,SITE_DESCRIPTION,SITE_URL,SITE_ACCENT_COLOR,AUTHOR_NAME,AUTHOR_URL,AUTHOR_AVATAR,SOCIAL_GITHUB,SOCIAL_TWITTER,SOCIAL_RSS,FEED_FOLO_FEED_ID,FEED_FOLO_USER_ID,MAP_STYLE,MAP_PROJECTION&envDescription=S3%20storage%20and%20site%20configurations&envLink=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel%23-environment-variables&project-name=my-afilmory&repository-name=my-afilmory">
    <img src="https://vercel.com/button" alt="Deploy with Vercel"/>
  </a>
</p>

---

## 📖 About This Project

This repository is a customized fork of [Afilmory](https://github.com/Afilmory/afilmory), focused on static site deployment. Source photos can stay in S3-compatible object storage (the deployment default) or come from a local directory for a self-contained, zero-credential build. The build produces a static web app, generated thumbnails, RSS, sitemap, Open Graph assets, and a JSON photo manifest.

### Differences from the upstream project

- ✅ **S3-first static deployment** - S3-compatible storage remains the default, with an explicit local-filesystem mode for self-contained builds.
- ✅ **Vercel-ready build** - `vercel.json` runs `scripts/build-static.sh` and outputs `apps/web/dist`.
- ✅ **Manifest-driven runtime** - the browser reads generated JSON data instead of calling a database or backend service.
- ✅ **Optional remote metadata cache** - `REPO_URL` and `REPO_TOKEN` can persist generated manifest/thumbnails between CI builds.
- ✅ **One-click deployment** - the Vercel deploy button is ready for the required S3 environment variables.

### Acknowledgements

Huge thanks to [Innei](https://innei.in) and the Afilmory team for creating this excellent photo gallery generator.

> 💡 If you need the complete upstream feature set and latest upstream changes, use the [original Afilmory](https://github.com/Afilmory/afilmory).

---

## 🌟 Features

### Core

- 🖼️ **High-performance WebGL renderer** - custom React 19 WebGL viewer with smooth zooming, panning, tiled loading, and fallback error callbacks.
- 📱 **Responsive masonry layout** - custom pure-computed virtual masonry with integer-pixel geometry and no scroll-time DOM measurement.
- 🎨 **Modern UI design** - glassmorphic interface built with Tailwind CSS 4, Radix UI primitives, and Motion.
- ⚡ **Incremental builds** - existing manifest data, thumbnails, EXIF, and tone analysis are reused when source photos have not changed.
- 🌐 **Internationalization** - bundled language resources from `locales/app/*.json`.
- 🔗 **Crawler-ready photo pages** - build-time home Open Graph image, per-photo canonical/OG/JSON-LD HTML shells, `feed.xml`, and `sitemap.xml`.

### Image processing

- 🔄 **HEIC/HEIF/HIF support** - Apple formats are converted during processing.
- 📷 **TIFF/TIF, WebP, BMP, PNG, JPG/JPEG support** - supported extensions are defined in `packages/builder/src/constants/index.ts`.
- 🖼️ **Generated thumbnails** - thumbnails are written to `apps/web/public/thumbnails` and included in the static output.
- 📊 **EXIF display** - metadata is extracted with `exiftool-vendored` in the builder and can be inspected in the web viewer.
- 🌈 **ThumbHash placeholders** - compact placeholders are stored as `thumbHash` in the manifest for progressive loading.
- 📱 **Live Photo and Motion Photo support** - sidecar video pairs and embedded motion-photo metadata are represented as manifest video sources.
- ☀️ **HDR metadata support** - Ultra HDR gain map metadata is detected when present.

### Storage and runtime

- ☁️ **S3-compatible source photos** - works with AWS S3, MinIO, Aliyun OSS, Tencent COS, and other S3-compatible services.
- 💻 **Local-filesystem source photos** - set `PHOTO_STORAGE_PROVIDER=local` to build without object-storage credentials.
- 🌍 **CDN-friendly URLs** - `S3_CUSTOM_DOMAIN` can be used for public photo URLs.
- 📦 **Provider-aware static output** - S3 originals remain in object storage; local-mode originals are copied into the static output under their configured URL prefix.
- 🚀 **Progressive static runtime** - production emits a small content-addressed `gallery-index` plus stable ID-hash photo-detail shards and a map shard. Routes hydrate only the data they need through `window.__AFILMORY__.manifest`.

---

## 🖥️ Screenshots

<p align="center">
  <img src="docs/assets/screenshot-gallery.webp" alt="Gallery masonry view" width="100%" />
</p>

<p align="center">
  <img src="docs/assets/screenshot-viewer.webp" alt="Photo viewer with EXIF panel" width="100%" />
</p>

---

## 🎯 Live Demo

- [Official Demo](https://afilmory.innei.in) - Official Afilmory demo
- [Xudong's Lens](https://lens.misfork.com)
- [Gallery by mxte](https://gallery.mxte.cc)
- [Photography by pseudoyu](https://photography.pseudoyu.com)
- [Afilmory by magren](https://afilmory.magren.cc)

---

## 🚀 Quick Start

To explore the complete UI without credentials or personal photos:

```bash
pnpm install
pnpm dev:demo
```

This serves the committed synthetic gallery at `http://127.0.0.1:1924` and
does not read `.env`, S3 credentials, or your generated manifest.

### One-click deploy to Vercel

Click the button below and follow the prompts to configure S3-related environment variables:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel&env=S3_BUCKET_NAME,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_ENDPOINT,S3_PREFIX,S3_CUSTOM_DOMAIN,S3_EXCLUDE_REGEX,SITE_NAME,SITE_TITLE,SITE_DESCRIPTION,SITE_URL,SITE_ACCENT_COLOR,AUTHOR_NAME,AUTHOR_URL,AUTHOR_AVATAR,SOCIAL_GITHUB,SOCIAL_TWITTER,SOCIAL_RSS,FEED_FOLO_FEED_ID,FEED_FOLO_USER_ID,MAP_STYLE,MAP_PROJECTION&envDescription=S3%20storage%20and%20site%20configurations&envLink=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel%23-environment-variables&project-name=my-afilmory&repository-name=my-afilmory)

**Deployment steps:**

1. Click the deploy button above.
2. Sign in to Vercel and fork/import the repository.
3. Configure the S3 bucket and either an explicit key pair or another supported AWS credential source.
4. Click **Deploy**.
5. The Vercel build runs `scripts/build-static.sh`, which runs `pnpm build`; precheck refreshes the manifest when the bucket and credential source are valid.

---

## ⚙️ Environment Variables

Environment overrides are merged into `site.config.ts` by `site.config.build.ts` during build. Client-side code receives the final config through `window.__AFILMORY__.config`; it does not read `process.env` at runtime.

### Photo source selection

| Variable                 | Description                                       | Default      |
| ------------------------ | ------------------------------------------------- | ------------ |
| `PHOTO_STORAGE_PROVIDER` | Source adapter: `s3` or `local`                   | `s3`         |
| `LOCAL_PHOTOS_PATH`      | Local source directory, relative to the repo root | `photos`     |
| `LOCAL_PHOTOS_BASE_URL`  | URL prefix used for local originals               | `/originals` |

Local mode needs no S3 credentials:

```bash
PHOTO_STORAGE_PROVIDER=local
LOCAL_PHOTOS_PATH=photos
LOCAL_PHOTOS_BASE_URL=/originals
```

Put source images under `LOCAL_PHOTOS_PATH`. The dev server serves them at
`LOCAL_PHOTOS_BASE_URL`; production builds copy them into `apps/web/dist` at
the matching path. Keep the reserved-route-safe `/originals` default unless
your static host is configured for another non-reserved public path. Custom
prefixes use portable ASCII path segments; `/photos`, `/assets`, `/thumbnails`,
and `/vendor` belong to the application.

### S3 source configuration

When `PHOTO_STORAGE_PROVIDER=s3`, only the bucket name is always required:

| Variable         | Description    | Example     |
| ---------------- | -------------- | ----------- |
| `S3_BUCKET_NAME` | S3 bucket name | `my-photos` |

`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are an optional pair. Set both
when using explicit credentials; setting only one is a configuration error. If
both are omitted, the AWS SDK default credential chain is used (shared
config/SSO, Web Identity, ECS/EC2 roles, and other supported sources). Most
non-AWS S3-compatible services still require the explicit pair.

### Optional S3 settings

| Variable           | Description               | Default                              | Example                                |
| ------------------ | ------------------------- | ------------------------------------ | -------------------------------------- |
| `S3_REGION`        | S3 region                 | `us-east-1`                          | `us-west-2`                            |
| `S3_ENDPOINT`      | S3 endpoint               | `https://s3.us-east-1.amazonaws.com` | `https://oss-cn-hangzhou.aliyuncs.com` |
| `S3_PREFIX`        | Path prefix for photos    | empty                                | `photos/`                              |
| `S3_CUSTOM_DOMAIN` | Custom CDN domain         | empty                                | `https://cdn.example.com`              |
| `S3_EXCLUDE_REGEX` | Regex for excluding files | empty                                | `.*\.txt$`                             |

> ⚠️ **CORS requirement for the full-resolution viewer.** The WebGL viewer
> fetches the original image bytes via `fetch`/XHR, so the host that serves your
> originals (`S3_CUSTOM_DOMAIN` or the S3 endpoint) **must return an
> `Access-Control-Allow-Origin` header that allows your site origin (`SITE_URL`)**
> whenever the two are different origins (e.g. `cdn.example.com` vs
> `gallery.example.com`). Thumbnails are same-origin (`/thumbnails`) and need no
> CORS, so a missing CORS header shows as: thumbnails load fine but opening a
> photo gets stuck on "Failed to load image". This also affects local
> `vite preview` against a CDN that only allow-lists your production domain.

### Optional CI metadata cache

| Variable           | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `REPO_URL`         | Git repository used to cache generated `photos-manifest.json` and thumbnails |
| `REPO_TOKEN`       | Token used by the artifact cache script when pushing cache updates           |
| `BUILDER_REPO_URL` | Backward-compatible alias for `REPO_URL`                                     |
| `GIT_TOKEN`        | Backward-compatible alias for `REPO_TOKEN`                                   |

This cache is not a photo storage backend. Source photos still come from the configured S3 or local provider.

### Site configuration

| Variable            | Description      | Example                               |
| ------------------- | ---------------- | ------------------------------------- |
| `SITE_NAME`         | Site name        | `My Photo Gallery`                    |
| `SITE_TITLE`        | Site title       | `My Photo Gallery`                    |
| `SITE_DESCRIPTION`  | Site description | `Capturing beautiful moments in life` |
| `SITE_URL`          | Site URL         | `https://your-site.vercel.app`        |
| `SITE_ACCENT_COLOR` | Accent color     | `#007bff`                             |

| Variable        | Description       | Example                     |
| --------------- | ----------------- | --------------------------- |
| `AUTHOR_NAME`   | Author name       | `Your Name`                 |
| `AUTHOR_URL`    | Author website    | `https://your-website.com`  |
| `AUTHOR_AVATAR` | Author avatar URL | `https://example.com/a.png` |

| Variable         | Description      | Example                 |
| ---------------- | ---------------- | ----------------------- |
| `SOCIAL_GITHUB`  | GitHub username  | `your-github-username`  |
| `SOCIAL_TWITTER` | Twitter/X handle | `your-twitter-username` |
| `SOCIAL_RSS`     | Enable RSS link  | `true` or `false`       |

| Variable            | Description  | Example        |
| ------------------- | ------------ | -------------- |
| `FEED_FOLO_FEED_ID` | Folo Feed ID | `your-feed-id` |
| `FEED_FOLO_USER_ID` | Folo User ID | `your-user-id` |

| Variable         | Description    | Default    | Possible values         |
| ---------------- | -------------- | ---------- | ----------------------- |
| `MAP_STYLE`      | Map style      | `builtin`  | `builtin` or custom URL |
| `MAP_PROJECTION` | Map projection | `mercator` | `globe` or `mercator`   |

### Location privacy and optional geocoding

`PHOTO_LOCATION_MODE=coarse` is the privacy-preserving default. Public
coordinates are rounded to two decimal places (kilometre scale) before they
enter the manifest or leave the builder. Use `strip` to publish no coordinates
or place names. `exact` publishes camera GPS unchanged and should be used only
with the informed consent of photographed people and property owners.

Reverse geocoding is **disabled by default** because it sends the selected
location to an external provider. Set `GEOCODING_ENABLED=true` to opt in and
set `GEOCODING_USER_AGENT` to a real identifier per the
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
(max 1 request/second). `GEOCODING_PROVIDER=mapbox` plus `MAPBOX_TOKEN` is an
alternative. `strip` always suppresses geocoding; `coarse` never sends exact
camera coordinates. See `.env.template` for all privacy and provider options.

### Local `.env`

```bash
cp .env.template .env
```

Example:

```bash
PHOTO_STORAGE_PROVIDER=s3
S3_BUCKET_NAME=my-photos
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key

SITE_NAME=My Photo Gallery
SITE_TITLE=My Photo Gallery
SITE_DESCRIPTION=Capturing beautiful moments in life
SITE_URL=https://your-site.vercel.app

AUTHOR_NAME=Your Name
AUTHOR_URL=https://your-website.com
AUTHOR_AVATAR=https://example.com/avatar.png

SOCIAL_GITHUB=your-github-username
SOCIAL_RSS=true
```

For a zero-credential local setup, replace the S3 block with the three local
variables shown under [Photo source selection](#photo-source-selection).

---

## 💻 Local Development

### Prerequisites

- Node.js `^20.19.0 || >=22.12.0` (Vite 8 requirement)
- pnpm 10.19.0
- Either S3-compatible object storage or a local photo directory

### Install dependencies

```bash
git clone https://github.com/vsxd/afilmory-vercel.git
cd afilmory-vercel
pnpm install
```

### Prepare source photos

Use an S3-compatible object store, or set `PHOTO_STORAGE_PROVIDER=local` and put photos under `LOCAL_PHOTOS_PATH`. Supported image extensions are `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.tiff`, `.tif`, `.heic`, `.heif`, and `.hif`.

In S3 mode the manifest points to S3/CDN URLs and originals are not bundled. In local mode the build copies originals into `apps/web/dist` under `LOCAL_PHOTOS_BASE_URL` so the resulting site remains self-contained.

### Build and preview

```bash
# Development server. Runs precheck first.
pnpm dev

# Full static build: precheck, then Vite web build. Workspace packages are
# consumed from TypeScript source, so deployments never build package dist/.
pnpm build

# Refresh manifest and thumbnails only.
pnpm build:manifest

# Build only the frontend from an existing manifest.
pnpm build:web

# Preview apps/web/dist locally.
pnpm preview

# Regenerate favicon assets into apps/web/public.
pnpm generate:favicon
```

All `@afilmory/*` packages are workspace-internal — they are consumed directly
from TypeScript source and are not published to npm.

Open http://localhost:4173 after `pnpm preview`.

### Manifest build behavior

- `pnpm dev` and `pnpm build` run `apps/web/scripts/precheck.ts` first.
- In local mode, precheck runs the builder directly and does not require S3 credentials.
- If the S3 bucket and a valid credential source are available, precheck refreshes the manifest through the builder.
- If required S3 configuration is missing but `generated/photos-manifest.json` exists, precheck reuses the existing manifest.
- If the builder fails, preview builds continue only when the manifest currently on disk still passes strict validation. Precheck never rolls back the JSON file by itself, because a late builder failure may occur after the new manifest was atomically committed and old content-addressed thumbnails were collected.
- `SKIP_MANIFEST_BUILD=true pnpm build` intentionally skips builder refresh.
- Production web builds convert the Builder's manifest v2 into Web Delivery Manifest v3: a hashed gallery index, immutable stable-ID detail shards, and a map shard. Set `AFILMORY_EMBED_MANIFEST=true` to inline v2 for constrained deployments or `false` to force progressive external loading.

### Manifest CLI options

```bash
pnpm build:manifest -- --force
pnpm build:manifest -- --force-thumbnails
pnpm build:manifest -- --force-manifest
```

---

## 📦 Deployment

### Deploy to Vercel

Vercel uses:

- **Build command:** `sh scripts/build-static.sh`
- **Output directory:** `apps/web/dist`

When `REPO_URL` and `REPO_TOKEN` are configured, `scripts/build-static.sh` restores the cached manifest and thumbnails before running the build, then pushes refreshed artifacts. Treat the separate cache repository as private: `exact` mode may also cache precise coordinates. `coarse` and `strip` never transfer `geocoding-cache.json` and remove legacy exact caches at this boundary. The cache defaults to the dedicated `afilmory-cache` branch, requires a least-privilege token, and refuses source/protected branches. See the [cache security guide](docs/cache-security.md).

`scripts/build-static.sh` always runs `pnpm build`; all freshness and fallback decisions live in `apps/web/scripts/precheck.ts`. When required S3 configuration is missing but a reusable `generated/photos-manifest.json` exists, precheck reuses it so preview deployments still succeed. Production deploys (`VERCEL_ENV=production`, or `REQUIRE_FRESH_BUILD=true` on other platforms) fail instead of publishing a stale manifest.

CI/Vercel builds also fail when shipped Project Code differs from the advertised Git revision. Commit the deployment source, or set `AFILMORY_CORRESPONDING_SOURCE_URL` to a public archive/tree containing the exact deployed source. Local dirty-tree builds remain available for preview and are labeled as non-exact in the footer.

For local-provider deployments, make `LOCAL_PHOTOS_PATH` available in the build
workspace. The build copies those originals into the static output; do not add
private photos to a public repository by accident.

### Other static hosts

Deploy the contents of `apps/web/dist` to any static hosting provider:

- Cloudflare Pages
- Netlify
- GitHub Pages
- Any static host that can serve a SPA fallback to `index.html`

Use `pnpm build` as the build command.

---

## 🔄 Updating Photos

1. Upload new or changed photos to your S3 bucket, or update `LOCAL_PHOTOS_PATH` in local mode.
2. Trigger a new deployment or run `pnpm build:manifest`.
3. The builder compares source object metadata with the existing manifest and processes only changed work when possible.

---

## 🏗️ Tech Stack

### Frontend

- React 19 with React Compiler
- TypeScript 5.9
- Vite 8
- Tailwind CSS 4
- Radix UI
- Motion
- Jotai
- React Router 8
- i18next and react-i18next
- MapLibre GL and react-map-gl

### Build system

- Node.js
- pnpm workspace
- Sharp for image processing and generated OG images
- exiftool-vendored for EXIF extraction
- AWS SDK v3 for S3 access
- node:cluster worker processes or an in-process concurrency pool
- thumbhash for compact image placeholders

---

## 📁 Project Structure

```text
afilmory/
├── apps/
│   └── web/                   # Frontend SPA
├── packages/
│   ├── build-assets/          # Build-time OG image, feed.xml, and sitemap.xml generation
│   ├── builder/               # Photo processing and manifest builder
│   ├── media/                 # Zero-dependency thumbhash byte/hex codec leaf
│   ├── schema/                # Manifest contract: types + strict/lenient parsers
│   ├── ui/                    # Shared UI primitives and hooks
│   └── webgl-viewer/          # WebGL image viewer package
├── docs/
│   ├── assets/                # README images
│   ├── CONTRIBUTING.md        # Contributor setup and workflow
│   ├── rss-exif-extension.md  # RSS EXIF extension notes
│   ├── security-notes.md      # Security-relevant configuration notes
│   └── testing.md             # Vitest and Playwright test/CI guide
├── generated/                 # Generated photos-manifest.json
├── locales/app/               # i18n JSON resources
├── scripts/                   # Build-time helper scripts
├── site.config.ts             # Client-safe site defaults
├── site.config.build.ts       # Build-time environment merge
├── builder.config.ts          # S3-backed builder configuration
└── vercel.json                # Static deployment configuration
```

---

## 🎨 Customization

### Change accent color

Use `SITE_ACCENT_COLOR` or edit `site.config.ts`:

```typescript
export const siteConfig: SiteConfig = {
  // ...
  accentColor: "#ff6b6b",
};
```

### Custom map style

Use `MAP_STYLE` and `MAP_PROJECTION`, or edit `site.config.ts`:

```typescript
export const siteConfig: SiteConfig = {
  // ...
  map: ["maplibre"],
  mapStyle: "https://your-map-style.json",
  mapProjection: "globe",
};
```

### Internationalization

Language files are located under `locales/app/*.json`. To add a language:

1. Add the new JSON file under `locales/app`.
2. Import and register it in `apps/web/src/@types/resources.ts`.
3. Add the language code to `apps/web/src/@types/constants.ts`.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome.

See the [Contributing Guide](docs/CONTRIBUTING.md) for setup and verification,
the [Security Policy](SECURITY.md) for private reporting, and the
[Code of Conduct](CODE_OF_CONDUCT.md) for community expectations.

---

## 📄 License

This project is based on [Afilmory](https://github.com/Afilmory/Afilmory) and follows the same licenses:

**Attribution Network License (ANL) v1.0**

- **Library code**: MIT
- **Project code**: AGPL-3.0-or-later with UI attribution requirement

See [LICENSE](LICENSE), the machine-readable [ANL-MANIFEST](ANL-MANIFEST), and
the [licensing map](docs/licensing.md) for details.

---

## 🔗 Related Links

- **Original Afilmory**: [github.com/Afilmory/Afilmory](https://github.com/Afilmory/Afilmory)
- **Official demo**: [afilmory.innei.in](https://afilmory.innei.in)
- **Issue tracker**: [GitHub Issues](https://github.com/vsxd/afilmory-vercel/issues)
- **Original author blog**: [innei.in](https://innei.in)

---

## 💝 Thanks

- Thanks to [Innei](https://innei.in) and the Afilmory team for the original project.
- Thanks to all photographers using this project.
- Thanks to all open-source contributors.

<p align="center">
  <sub>If this project helps you, please consider giving it a star on GitHub.</sub>
</p>
