# Afilmory Vercel

English | [简体中文](./README.zh-CN.md)

<p align="center">
  <img src="docs/assets/afilmory-readme.webp" alt="Afilmory" width="100%" />
</p>

<p align="center">
  <strong>A fork of Afilmory optimized for S3-compatible photo storage and static deployment on Vercel</strong>
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

This repository is a customized fork of [Afilmory](https://github.com/Afilmory/afilmory), focused on S3-compatible photo storage and static site deployment. Photos stay in S3 or a compatible object store; the build produces a static web app, generated thumbnails, RSS, sitemap, Open Graph assets, and a JSON photo manifest.

### Differences from the upstream project

- ✅ **S3-first static deployment** - the default site configuration only uses S3-compatible storage for source photos.
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
- 📱 **Responsive masonry layout** - built on Masonic with virtualization for large galleries.
- 🎨 **Modern UI design** - glassmorphic interface built with Tailwind CSS 4, Radix UI primitives, and Motion.
- ⚡ **Incremental builds** - existing manifest data, thumbnails, EXIF, and tone analysis are reused when source photos have not changed.
- 🌐 **Internationalization** - bundled language resources from `locales/app/*.json`.
- 🔗 **Static social assets** - build-time Open Graph image, `feed.xml`, and `sitemap.xml`.

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
- 🌍 **CDN-friendly URLs** - `S3_CUSTOM_DOMAIN` can be used for public photo URLs.
- 📦 **Zero original photo bundling** - original photos remain in object storage; only generated thumbnails and web assets are deployed.
- 🚀 **Static SPA runtime** - production builds default to an external `assets/photos-manifest.<hash>.json` loaded through `window.__MANIFEST_PROMISE__`.

---

## 🖥️ Screenshots

<p align="center">
  <img src="docs/assets/screenshot_0.webp" alt="screenshot_0" width="100%" />
</p>

<p align="center">
  <img src="docs/assets/screenshot_1.webp" alt="screenshot_1" width="100%" />
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

### One-click deploy to Vercel

Click the button below and follow the prompts to configure S3-related environment variables:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel&env=S3_BUCKET_NAME,S3_REGION,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_ENDPOINT,S3_PREFIX,S3_CUSTOM_DOMAIN,S3_EXCLUDE_REGEX,SITE_NAME,SITE_TITLE,SITE_DESCRIPTION,SITE_URL,SITE_ACCENT_COLOR,AUTHOR_NAME,AUTHOR_URL,AUTHOR_AVATAR,SOCIAL_GITHUB,SOCIAL_TWITTER,SOCIAL_RSS,FEED_FOLO_FEED_ID,FEED_FOLO_USER_ID,MAP_STYLE,MAP_PROJECTION&envDescription=S3%20storage%20and%20site%20configurations&envLink=https%3A%2F%2Fgithub.com%2Fvsxd%2Fafilmory-vercel%23-environment-variables&project-name=my-afilmory&repository-name=my-afilmory)

**Deployment steps:**

1. Click the deploy button above.
2. Sign in to Vercel and fork/import the repository.
3. Configure the required S3 variables.
4. Click **Deploy**.
5. The Vercel build runs `scripts/build-static.sh`, which runs the full build when S3 credentials are available.

---

## ⚙️ Environment Variables

Environment overrides are merged into `site.config.ts` by `site.config.build.ts` during build. Client-side code receives the final config through `window.__SITE_CONFIG__`; it does not read `process.env` at runtime.

### Required for S3 source photos

The default static site configuration only supports S3-compatible source photos. These variables are required when the builder refreshes the manifest:

| Variable               | Description          | Example                                    |
| ---------------------- | -------------------- | ------------------------------------------ |
| `S3_BUCKET_NAME`       | S3 bucket name       | `my-photos`                                |
| `S3_ACCESS_KEY_ID`     | S3 access key ID     | `AKIAIOSFODNN7EXAMPLE`                     |
| `S3_SECRET_ACCESS_KEY` | S3 access key secret | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |

### Optional S3 settings

| Variable           | Description               | Default                              | Example                                |
| ------------------ | ------------------------- | ------------------------------------ | -------------------------------------- |
| `S3_REGION`        | S3 region                 | `us-east-1`                          | `us-west-2`                            |
| `S3_ENDPOINT`      | S3 endpoint               | `https://s3.us-east-1.amazonaws.com` | `https://oss-cn-hangzhou.aliyuncs.com` |
| `S3_PREFIX`        | Path prefix for photos    | empty                                | `photos/`                              |
| `S3_CUSTOM_DOMAIN` | Custom CDN domain         | empty                                | `https://cdn.example.com`              |
| `S3_EXCLUDE_REGEX` | Regex for excluding files | empty                                | `.*\.txt$`                             |

### Optional CI metadata cache

| Variable           | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `REPO_URL`         | Git repository used to cache generated `photos-manifest.json` and thumbnails |
| `REPO_TOKEN`       | Token used by the cache sync plugin when pushing cache updates               |
| `BUILDER_REPO_URL` | Backward-compatible alias for `REPO_URL`                                     |
| `GIT_TOKEN`        | Backward-compatible alias for `REPO_TOKEN`                                   |

This cache is not a photo storage backend. Source photos still come from S3.

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

### Local `.env`

```bash
cp .env.template .env
```

Example:

```bash
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

---

## 💻 Local Development

### Prerequisites

- Node.js `^20.19.0 || >=22.12.0` (Vite 7 requirement)
- pnpm 10.19.0
- S3-compatible object storage for manifest refreshes

### Install dependencies

```bash
git clone https://github.com/vsxd/afilmory-vercel.git
cd afilmory-vercel
pnpm install
```

### Prepare S3 and upload photos

Upload your photos to an S3-compatible object storage. Supported image extensions are `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.tiff`, `.tif`, `.heic`, `.heif`, and `.hif`.

Original photos are not bundled into `apps/web/dist`; the manifest points to S3/CDN URLs and the build output contains generated thumbnails.

### Build and preview

```bash
# Development server. Runs precheck first.
pnpm dev

# Full static build: precheck, package builds, then Vite web build.
pnpm build

# Refresh manifest and thumbnails only.
pnpm build:manifest

# Build only the frontend from an existing manifest.
pnpm build:web

# Preview apps/web/dist locally.
pnpm preview
```

Open http://localhost:4173 after `pnpm preview`.

### Manifest build behavior

- `pnpm dev` and `pnpm build` run `apps/web/scripts/precheck.ts` first.
- If S3 credentials are complete, precheck refreshes the manifest through the builder.
- If S3 credentials are missing but `generated/photos-manifest.json` exists, precheck reuses the existing manifest.
- If the builder fails but an existing manifest is present, precheck falls back to that manifest and prints a warning.
- `SKIP_MANIFEST_BUILD=true pnpm build` intentionally skips builder refresh.
- Production web builds emit an external hashed manifest asset by default; set `AFILMORY_EMBED_MANIFEST=true` to inline it or `false` to force external loading.

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

`scripts/build-static.sh` runs `pnpm build` when required S3 credentials are present. If S3 credentials are missing but a reusable `generated/photos-manifest.json` exists, it runs `pnpm build:web` so preview deployments can still succeed.

### Other static hosts

Deploy the contents of `apps/web/dist` to any static hosting provider:

- Cloudflare Pages
- Netlify
- GitHub Pages
- Any static host that can serve a SPA fallback to `index.html`

Use `pnpm build` as the build command.

---

## 🔄 Updating Photos

1. Upload new or changed photos to your S3 bucket.
2. Trigger a new deployment or run `pnpm build:manifest`.
3. The builder compares source object metadata with the existing manifest and processes only changed work when possible.

---

## 🏗️ Tech Stack

### Frontend

- React 19 with React Compiler
- TypeScript 5.9
- Vite 7
- Tailwind CSS 4
- Radix UI
- Motion
- Jotai and Zustand
- TanStack Query
- React Router 7
- i18next and react-i18next
- MapLibre GL and react-map-gl

### Build system

- Node.js
- pnpm workspace
- Sharp for image processing and generated OG images
- exiftool-vendored for EXIF extraction
- AWS SDK v3 for S3 access
- Worker threads or cluster workers for concurrent processing
- thumbhash for compact image placeholders

---

## 📁 Project Structure

```text
afilmory/
├── apps/
│   └── web/                   # Frontend SPA
├── packages/
│   ├── builder/               # Photo processing and manifest builder
│   ├── data/                  # Shared manifest types and parsers
│   ├── ui/                    # Shared UI primitives and hooks
│   └── webgl-viewer/          # WebGL image viewer package
├── docs/
│   ├── assets/                # README images
│   └── rss-exif-extension.md  # RSS EXIF extension notes
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

See [Contributing Guide](docs/CONTRIBUTING.md) for setup, common commands, manifest notes, and PR verification.

---

## 📄 License

This project is based on [Afilmory](https://github.com/Afilmory/Afilmory) and follows the same licenses:

**Attribution Network License (ANL) v1.0**

- **Library code**: MIT
- **Project code**: AGPL-3.0-or-later with UI attribution requirement

See [LICENSE](LICENSE) for details.

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
