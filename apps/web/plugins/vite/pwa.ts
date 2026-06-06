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
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif)$/,
          handler: "StaleWhileRevalidate",
          options: {
            cacheName: AFILMORY_RUNTIME_CACHE_NAMES[2],
            expiration: {
              maxEntries: 150,
              maxAgeSeconds: 60 * 60 * 24 * 30,
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
        {
          urlPattern: /^https?:\/\/.*\.(s3|amazonaws|cloudfront|cdn)\..*/i,
          handler: "CacheFirst",
          options: {
            cacheName: AFILMORY_RUNTIME_CACHE_NAMES[3],
            expiration: {
              maxEntries: 200,
              maxAgeSeconds: 60 * 60 * 24 * 90,
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
