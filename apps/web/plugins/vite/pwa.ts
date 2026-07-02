import { VitePWA } from "vite-plugin-pwa";

import type { SiteConfig } from "../../../../site.config";
import { AFILMORY_RUNTIME_CACHE_NAMES } from "../../src/runtime/cache-names";

export function createAfilmoryPwaPlugin(siteConfig: SiteConfig) {
  return VitePWA({
    base: "/",
    scope: "/",
    injectRegister: false,
    registerType: "autoUpdate",
    includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
    manifest: {
      name: siteConfig.title,
      short_name: siteConfig.name,
      description: siteConfig.description,
      theme_color: "#1c1c1e",
      background_color: "#1c1c1e",
      display: "standalone",
      scope: "/",
      start_url: "/",
      icons: [
        {
          src: "android-chrome-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "android-chrome-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
    workbox: {
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      globIgnores: [
        "**/*.{jpg,jpeg}",
        "**/vendor/heic-*.js",
        "**/vendor/exiftool-*.js",
        "**/assets/maplibre-gl-*.js",
        "**/assets/map-*.js",
        "**/vendor/map-*.js",
        "**/assets/vendor/map*.css",
        "**/og-image-*.png",
        "**/*.map",
      ],
      globPatterns: [
        "**/*.{js,css,html}",
        "**/assets/photos-manifest.*.json",
        "**/favicon*.{ico,png}",
        "**/android-chrome-*.png",
        "**/apple-touch-icon.png",
      ],
      maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: AFILMORY_RUNTIME_CACHE_NAMES[0],
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365,
            },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: AFILMORY_RUNTIME_CACHE_NAMES[1],
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365,
            },
          },
        },
        // 缩略图：构建期产物、Vercel 侧已是 immutable —— 用 CacheFirst 而非
        // StaleWhileRevalidate（SWR 会在每次展示时都发一次后台革新请求，且旧上限
        // 150 < 照片总数，整个画廊滚一遍就互相挤占、后续变成真回源——正是
        // 「缓存好了还在加载」的主因）。上限取照片数的数倍余量。
        {
          urlPattern: /\/thumbnails\/[^/?]+\.(?:png|jpg|jpeg|webp|avif)$/,
          handler: "CacheFirst",
          options: {
            cacheName: AFILMORY_RUNTIME_CACHE_NAMES[2],
            expiration: {
              maxEntries: 600,
              maxAgeSeconds: 60 * 60 * 24 * 365,
              purgeOnQuotaError: true,
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
        // 其余图片 = 主要是 CDN 原图（几 MB/张，经查看器 XHR 或 <img> 加载）。
        // 旧规则按主机名匹配 s3|amazonaws|cloudfront|cdn，自定义域（如 img.*）
        // 永远不命中，且被前面的通配图片规则遮蔽 → 等于没有原图缓存。改为
        // 兜底 CacheFirst：条目按体积保守设上限，配额吃紧时整体清退。
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif|gif)$/,
          handler: "CacheFirst",
          options: {
            cacheName: AFILMORY_RUNTIME_CACHE_NAMES[3],
            expiration: {
              maxEntries: 40,
              maxAgeSeconds: 60 * 60 * 24 * 90,
              purgeOnQuotaError: true,
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
      ],
      skipWaiting: true,
    },
    devOptions: {
      enabled: false,
    },
  });
}
