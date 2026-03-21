# Afilmory Vercel

English | [简体中文](./README.zh-CN.md)

<p align="center">
  <img src="docs/assets/afilmory-readme.webp" alt="Afilmory" width="100%" />
</p>

<p align="center">
  <strong>A fork of Afilmory optimized for S3-compatible storage and static deployment on Vercel</strong>
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

This repository is a customized fork of [Afilmory](https://github.com/Afilmory/afilmory), **focused on S3-compatible storage and static deployment on Vercel**.

### Differences from the upstream project

- ✅ **S3-only storage** – Local filesystem and GitHub storage backends are removed to keep the deployment bundle as small as possible
- ✅ **Vercel-optimized** – Build process is tuned specifically for Vercel (including the free tier limits)
- ✅ **Simplified configuration** – Leaner build scripts and configuration, easier to get started
- ✅ **One-click deployment** – Ready-to-use Vercel deploy button

### Acknowledgements

Huge thanks to [Innei](https://innei.in) and the Afilmory team for creating this excellent photo gallery generator!

> 💡 If you need all features and the latest updates, please use the [original Afilmory](https://github.com/Afilmory/afilmory).

---

## 🌟 Features

### Core

- 🖼️ **High-performance WebGL renderer** – Custom WebGL viewer with smooth zooming and panning
- 📱 **Responsive masonry layout** – Built on Masonic, adapts to all screen sizes
- 🎨 **Modern UI design** – Glassmorphic design system with Tailwind CSS 4
- ⚡ **Incremental builds** – Smart change detection, only processes new or modified photos
- 🌐 **Internationalization** – Built-in multi-language support
- 🔗 **OpenGraph support** – Beautiful social share previews

### Image processing

- 🔄 **HEIC/HEIF support** – Automatically convert Apple device photos
- 📷 **TIFF support** – Automatically convert professional photo formats
- 🖼️ **Smart thumbnail generation** – Multiple thumbnail sizes for optimized loading
- 📊 **EXIF display** – Full capture metadata: camera, focal length, aperture and more
- 🌈 **Blurhash placeholders** – Pleasant progressive image loading
- 📱 **Live Photo support** – Detect and display iPhone Live Photos
- ☀️ **HDR support** – Display HDR images

### Advanced features

- 🎛️ **Fujifilm film simulation** – Read and display Fuji film simulation metadata
- 🔍 **Fullscreen viewer** – Gesture-friendly image viewer
- 🏷️ **Filesystem-based tags** – Auto-generate tags from folder structure
- ⚡ **Concurrent processing** – Multi-process / multi-threaded build pipeline
- 📷 **Photo sharing** – Share to social media or embed elsewhere
- 🗺️ **Interactive map** – MapLibre-based map for photos with GPS coordinates

### S3 storage features

- ☁️ **S3-compatible storage only** – Works with AWS S3, MinIO, Aliyun OSS, Tencent COS and other S3-compatible services
- 🌍 **CDN-friendly** – Supports custom CDN domains
- 📦 **Zero photo bundling** – Photos are never bundled into the static build
- 🚀 **Fast deployment** – Small build output, ideal for static hosting

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

- [Official Demo](https://afilmory.innei.in) – Official Afilmory demo
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
1. Click the "Deploy with Vercel" button above
2. Sign in to your Vercel account
3. Fork this repo to your GitHub account
4. Configure required environment variables (see [Environment Variables](#-environment-variables))
5. Click **Deploy**
6. Wait for the build to finish (first build usually takes 5–10 minutes)

---

## ⚙️ Environment Variables

> **💡 Recommended:** For easier customization and deployment, it is **strongly recommended** to configure all site-specific settings via environment variables.

### Priority

Environment variables > `site.config.ts` defaults

This means:
- ✅ If an environment variable is set, it takes precedence
- ✅ If not set, the fallback is the default in `site.config.ts`

### Required (S3 storage)

This project **only supports S3-compatible storage**. The following variables are required:

| Variable | Description | Example |
|---------|-------------|---------|
| `S3_BUCKET_NAME` | S3 bucket name | `my-photos` |
| `S3_REGION` | S3 region | `us-east-1` |
| `S3_ACCESS_KEY_ID` | S3 access key ID | `AKIAIOSFODNN7EXAMPLE` |
| `S3_SECRET_ACCESS_KEY` | S3 access key secret | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |

### Optional (S3 advanced options)

| Variable | Description | Default | Example |
|---------|-------------|---------|---------|
| `S3_ENDPOINT` | S3 endpoint | `https://s3.us-east-1.amazonaws.com` | `https://oss-cn-hangzhou.aliyuncs.com` |
| `S3_PREFIX` | Path prefix for photos | empty | `photos/` |
| `S3_CUSTOM_DOMAIN` | Custom CDN domain | empty | `https://cdn.example.com` |
| `S3_EXCLUDE_REGEX` | Regex for excluding files | empty | `.*\.txt$` |

### Recommended (site info)

**Strongly recommended** to configure these via environment variables so you can update them from the Vercel dashboard without redeploying code:

| Variable | Description | Example |
|---------|-------------|---------|
| `SITE_NAME` | Site name | `My Photo Gallery` |
| `SITE_TITLE` | Site title | `My Photo Gallery` |
| `SITE_DESCRIPTION` | Site description | `Capturing beautiful moments in life` |
| `SITE_URL` | Site URL | `https://your-site.vercel.app` |
| `SITE_ACCENT_COLOR` | Accent color (hex) | `#007bff` |

### Recommended (author info)

| Variable | Description | Example |
|---------|-------------|---------|
| `AUTHOR_NAME` | Author name | `Your Name` |
| `AUTHOR_URL` | Author website | `https://your-website.com` |
| `AUTHOR_AVATAR` | Author avatar URL | `https://avatar-url.com/avatar.png` |

### Optional (social links)

| Variable | Description | Example |
|---------|-------------|---------|
| `SOCIAL_GITHUB` | GitHub username | `your-github-username` |
| `SOCIAL_TWITTER` | Twitter/X handle | `your-twitter-username` |
| `SOCIAL_RSS` | Enable RSS | `true` or `false` |

### Optional (Feed)

| Variable | Description | Example |
|---------|-------------|---------|
| `FEED_FOLO_FEED_ID` | Folo Feed ID | `your-feed-id` |
| `FEED_FOLO_USER_ID` | Folo User ID | `your-user-id` |

### Optional (map)

| Variable | Description | Default | Possible values |
|---------|-------------|---------|-----------------|
| `MAP_STYLE` | Map style | `builtin` | `builtin` or custom URL |
| `MAP_PROJECTION` | Map projection | `mercator` | `globe` or `mercator` |

### Examples

#### Configure in Vercel

1. Go to your project dashboard
2. Open **Settings → Environment Variables**
3. Add the variables listed above
4. Saving will trigger a new deployment

#### Local development

Create a `.env` file:

```bash
cp .env.template .env
```

Edit `.env` and fill in your values:

```bash
# S3 storage (required)
S3_BUCKET_NAME=my-photos
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key

# Site info (recommended)
SITE_NAME=My Photo Gallery
SITE_TITLE=My Photo Gallery
SITE_DESCRIPTION=Capturing beautiful moments in life
SITE_URL=https://your-site.vercel.app

# Author info (recommended)
AUTHOR_NAME=Your Name
AUTHOR_URL=https://your-website.com
AUTHOR_AVATAR=https://avatar-url.com/avatar.png

# Social (optional)
SOCIAL_GITHUB=your-github-username
SOCIAL_RSS=true
```

---

## 💻 Local Development

### Prerequisites

- Node.js 18+
- pnpm 10+
- S3-compatible object storage (required)

### Install dependencies

```bash
# Clone the repo
git clone https://github.com/vsxd/afilmory-vercel.git
cd afilmory-vercel

# Install dependencies
pnpm install
```

### Prepare S3 and upload your photos

Upload your photos to an S3-compatible object storage. Supported formats:

- JPG / JPEG
- PNG
- HEIC (Apple devices)
- TIFF
- Live Photos (iPhone)

**Important:** This project only supports S3-compatible storage; photos are **not** bundled into the build output.

### Build and preview

```bash
# Full build (generate manifest/thumbnails + build frontend)
pnpm build

# Only generate manifest and thumbnails
pnpm build:manifest

# Only build the frontend app from an existing manifest
pnpm build:web

# Local preview
pnpm preview
```

Open http://localhost:4173 to see your gallery.

---

## 📦 Deployment

### Deploy to Vercel (recommended)

#### Option A: Deploy button

Click the "Deploy with Vercel" button at the top of this README.

#### Option B: Import from GitHub

1. Push this project to your own GitHub repo
2. Go to [vercel.com](https://vercel.com) and import the repo
3. Configure environment variables (see [Environment Variables](#-environment-variables))
4. Click **Deploy**
5. Every push to `main` will trigger an automatic redeploy

#### Option C: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Make sure your local .env is configured
# Deploy to production
vercel --prod
```

### Other static hosts

The project builds to static assets under `apps/web/dist`. You can deploy that folder to:

- **Cloudflare Pages**
- **Netlify**
- **GitHub Pages**
- **Any static hosting provider**

**Build command:** `pnpm build`  
**Output directory:** `apps/web/dist`

---

## 📋 CLI Commands

### Development & build

```bash
# Development (does NOT process photos, uses existing manifest)
pnpm dev

# Full build (process photos + build frontend)
pnpm build

# Only process photos / generate manifest
pnpm build:manifest

# Only build the frontend app
pnpm build:web

# Preview build output
pnpm preview
```

### Manifest build options

```bash
# Force re-process all photos
pnpm build:manifest -- --force

# Only regenerate thumbnails
pnpm build:manifest -- --force-thumbnails

# Only regenerate manifest
pnpm build:manifest -- --force-manifest
```

---

## 🔄 Updating Photos

### Add new photos

1. Upload new photos to your S3 bucket
2. Push code to GitHub (to trigger Vercel) or run `vercel --prod`
3. Vercel will automatically rebuild and redeploy

Incremental builds will automatically detect new/changed photos and only process the changed ones.

---

## 🏗️ Tech Stack

### Frontend

- **React 19** – with React Compiler
- **TypeScript** – type-safe codebase
- **Vite 7** – build tool
- **Tailwind CSS 4** – styling
- **Radix UI** – accessible UI primitives
- **Jotai** – state management
- **TanStack Query** – data fetching
- **React Router 7** – routing
- **i18next** – i18n

### Build system

- **Node.js** – runtime
- **Sharp** – image processing
- **AWS SDK** – S3 operations
- **Worker Threads** – concurrency
- **EXIF-Reader** – EXIF extraction

### Storage

Supported S3-compatible services:

- **AWS S3** – Amazon S3
- **MinIO** – open-source object storage
- **Aliyun OSS** – Alibaba Cloud Object Storage
- **Tencent COS** – Tencent Cloud Object Storage
- Other S3-compatible providers

---

## 📁 Project Structure

```text
afilmory/
├── apps/
│   └── web/                   # 🎨 Frontend SPA
├── packages/
│   ├── builder/               # 🔨 Photo processing tools
│   ├── webgl-viewer/          # 🖼️ WebGL viewer
│   ├── data/                  # 📊 Shared types and manifest parsing
│   └── ui/                    # 🎨 Shared UI primitives and hooks
├── generated/                 # 📄 Generated manifest output
├── site.config.ts             # ⚙️ Site defaults
├── site.config.build.ts       # ⚙️ Build-time config injection
├── builder.config.ts          # ⚙️ Builder configuration
└── vercel.json                # 📦 Vercel deployment config
```

---

## 🎨 Customization

### Change accent color

Edit `site.config.ts`:

```typescript
export const siteConfig: SiteConfig = {
  // ...
  accentColor: '#ff6b6b',
}
```

### Custom map style

```json
{
  "map": ["maplibre"],
  "mapStyle": "https://your-map-style.json",
  "mapProjection": "globe"
}
```

### Internationalization

Language files are located under `apps/web/public/locales/`.

To add a new language:

1. Create a new language directory (e.g. `fr/`)
2. Copy and translate `common.json`
3. Register the language code in `apps/web/src/lib/i18n.ts`

---

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

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
- **Static deployment guide**: [DEPLOY_STATIC.md](./DEPLOY_STATIC.md)
- **Issue tracker**: [GitHub Issues](https://github.com/vsxd/afilmory-vercel/issues)
- **Original author blog**: [innei.in](https://innei.in)

---

## 💝 Thanks

- Thanks to [Innei](https://innei.in) and the Afilmory team for the original project
- Thanks to all photographers using this project
- Thanks to all open-source contributors

---

<p align="center">
  <sub>If this project helps you, please consider giving it a ⭐️ on GitHub!</sub>
</p>

