import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { PluginOption } from "vite";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import { checker } from "vite-plugin-checker";
import { createHtmlPlugin } from "vite-plugin-html";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";

import PKG from "../../package.json";
import { siteConfig } from "../../site.config.build";
import { astPlugin } from "./plugins/vite/ast";
import { buildAssetsPlugin } from "./plugins/vite/build-assets";
import { dataInjectPlugin } from "./plugins/vite/data-inject";
import { createDependencyChunksPlugin } from "./plugins/vite/deps";
import { localesJsonPlugin } from "./plugins/vite/locales-json";
import { photosStaticPlugin } from "./plugins/vite/photos-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ReactCompilerConfig = {
  /* ... */
};

const staticWebBuildPlugins: PluginOption[] = [
  dataInjectPlugin(),
  photosStaticPlugin(),

  VitePWA({
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
      maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
      skipWaiting: true,
      // 优化预缓存策略：只缓存关键资源
      globPatterns: [
        "**/*.{js,css,html}", // 核心资源
        "**/assets/photos-manifest.*.json", // 默认外置 manifest 是启动关键数据
        "**/favicon*.{ico,png}", // 网站图标
        "**/android-chrome-*.png", // PWA 图标
        "**/apple-touch-icon.png", // iOS 图标
      ],
      globIgnores: [
        "**/*.{jpg,jpeg}", // 大图片不预缓存
        "**/vendor/heic-*.js", // 按需加载的 HEIC 解码器
        "**/vendor/exiftool-*.js", // 按需加载的 EXIF 解析器
        "**/assets/maplibre-gl-*.js", // 地图库按需加载
        "**/assets/map-*.js", // 地图相关代码按需加载
        "**/vendor/map-*.js", // 地图库独立 vendor chunk 按需加载
        "**/assets/vendor/map*.css", // 地图库样式按需加载
        "**/og-image-*.png", // OG 图片不需要预缓存
        "**/*.map", // Source maps 不需要缓存
      ],
      runtimeCaching: [
        // 字体缓存策略
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-cache",
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365, // 365 天
            },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "gstatic-fonts-cache",
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365, // 365 天
            },
          },
        },
        // 图片缓存策略：使用 StaleWhileRevalidate 提升体验
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif)$/,
          handler: "StaleWhileRevalidate",
          options: {
            cacheName: "images-cache",
            expiration: {
              maxEntries: 150, // 增加缓存条目
              maxAgeSeconds: 60 * 60 * 24 * 30, // 30 天
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
        // S3 图片缓存策略（针对静态博客的图片存储）
        {
          urlPattern: /^https?:\/\/.*\.(s3|amazonaws|cloudfront|cdn)\..*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "s3-images-cache",
            expiration: {
              maxEntries: 200,
              maxAgeSeconds: 60 * 60 * 24 * 90, // 90 天，S3 图片很少变化
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
      ],
    },
    devOptions: {
      enabled: false, // 开发环境不启用 PWA
    },
  }),

  buildAssetsPlugin(
    {
      title: siteConfig.title,
      description: siteConfig.description,
      siteName: siteConfig.name,
      siteUrl: siteConfig.url,
    },
    siteConfig,
  ),
  createHtmlPlugin({
    minify: {
      collapseWhitespace: true,
      keepClosingSlash: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      minifyCSS: {
        targets: { safari: (16 << 16) | (4 << 8) },
      },
      minifyJS: true,
    },
    inject: {
      data: {
        title: siteConfig.title,
        description: siteConfig.description,
      },
    },
  }),
];

// https://vitejs.dev/config/
export default defineConfig(async ({ command }) => {
  const devOnlyPlugins: PluginOption[] = [];

  if (command === "serve") {
    const { codeInspectorPlugin } = await import("code-inspector-plugin");
    devOnlyPlugins.push(
      codeInspectorPlugin({
        bundler: "vite",
        hotKeys: ["altKey"],
      }),
    );
  }

  return {
    base: "/",
    plugins: [
      ...devOnlyPlugins,
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler", ReactCompilerConfig]],
        },
      }),

      astPlugin,
      tsconfigPaths(),
      checker({
        typescript: true,
        enableBuild: true,
        root: __dirname,
      }),

      createDependencyChunksPlugin([
        {
          name: "react",
          patterns: ["react", "react-dom", "react-router", "scheduler"],
        },
        {
          name: "i18n",
          patterns: [
            "i18next",
            "i18next-browser-languagedetector",
            "react-i18next",
          ],
        },
        {
          name: "motion",
          patterns: ["motion", "framer-motion", "motion-dom", "motion-utils"],
        },
        { name: "swiper", patterns: ["swiper"] },
        { name: "state", patterns: ["jotai", "zustand", "@tanstack/*"] },
        {
          name: "ui",
          patterns: [
            "@radix-ui/*",
            "@floating-ui/*",
            "react-remove-scroll",
            "react-remove-scroll-bar",
            "react-style-singleton",
            "aria-hidden",
            "use-sidecar",
            "use-callback-ref",
            "sonner",
            "vaul",
          ],
        },
        {
          name: "masonry",
          patterns: [
            "masonic",
            "trie-memoize",
            "raf-schd",
            "@react-hook/*",
            "react-intersection-observer",
            "react-use-measure",
            "usehooks-ts",
          ],
        },
        // 地图库单独分块，因为体积较大且不是所有用户都会使用
        { name: "map", patterns: ["maplibre-gl", "react-map-gl"] },
        { name: "heic", patterns: ["heic-to"] },
        {
          name: "file-type",
          patterns: [
            "file-type",
            "strtok3",
            "token-types",
            "iobuffer",
            "uint8array-extras",
            "peek-readable",
            "ieee754",
            "fflate",
          ],
        },
        { name: "zoom", patterns: ["react-zoom-pan-pinch"] },
        { name: "thumbhash", patterns: ["thumbhash"] },
        { name: "exiftool", patterns: ["@uswriting/exiftool"] },
        {
          name: "utils",
          patterns: [
            "es-toolkit",
            "clsx",
            "tailwind-merge",
            "tailwind-variants",
            "foxact",
          ],
        },
      ]),
      localesJsonPlugin(),
      tailwindcss(),
      ...staticWebBuildPlugins,
      process.env.analyzer && analyzer(),
    ],
    server: {
      port: 1924, // 1924 年首款 35mm 相机问世
    },
    build: {
      cssTarget: "safari16.4",
      // 启用 CSS 代码分割
      cssCodeSplit: true,
      // 优化 chunk 大小警告阈值
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // 优化资源命名，便于缓存
          assetFileNames: "assets/[name].[hash][extname]",
          chunkFileNames: "assets/[name].[hash].js",
          entryFileNames: "assets/[name].[hash].js",
          // 手动分块策略
          manualChunks: (id: string) => {
            // 将 node_modules 中的大型库单独分块
            if (
              id.includes("node_modules") && // WebGL 查看器单独分块
              id.includes("@afilmory/webgl-viewer")
            ) {
              return "webgl-viewer";
            }
            // 地图相关库已在 createDependencyChunksPlugin 中处理
            // 其他 vendor 代码由 createDependencyChunksPlugin 处理
          },
        },
      },
    },
    css: {
      lightningcss: {
        targets: { safari: (16 << 16) | (4 << 8) },
        errorRecovery: true,
      },
    },
    define: {
      APP_DEV_CWD: JSON.stringify(process.cwd()),
      APP_NAME: JSON.stringify(PKG.name),
      BUILT_DATE: JSON.stringify(new Date().toISOString()),
      GIT_COMMIT_HASH: JSON.stringify(getGitHash()),
    },
  };
});

function getGitHash() {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch (e) {
    console.error("Failed to get git hash", e);
    return "";
  }
}
