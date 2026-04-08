import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import { checker } from 'vite-plugin-checker'
import { createHtmlPlugin } from 'vite-plugin-html'
import { VitePWA } from 'vite-plugin-pwa'
import tsconfigPaths from 'vite-tsconfig-paths'

import PKG from '../../package.json'
import { siteConfig } from '../../site.config.build'
import { astPlugin } from './plugins/vite/ast'
import { buildAssetsPlugin } from './plugins/vite/build-assets'
import { dataInjectPlugin } from './plugins/vite/data-inject'
import { createDependencyChunksPlugin } from './plugins/vite/deps'
import { localesJsonPlugin } from './plugins/vite/locales-json'
import { photosStaticPlugin } from './plugins/vite/photos-static'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ReactCompilerConfig = {
  /* ... */
}

const staticWebBuildPlugins: PluginOption[] = [
  dataInjectPlugin(),
  photosStaticPlugin(),

  VitePWA({
    base: '/',
    scope: '/',
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
    manifest: {
      name: siteConfig.title,
      short_name: siteConfig.name,
      description: siteConfig.description,
      theme_color: '#1c1c1e',
      background_color: '#1c1c1e',
      display: 'standalone',
      scope: '/',
      start_url: '/',
      icons: [
        {
          src: 'android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: 'android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: 'apple-touch-icon.png',
          sizes: '180x180',
          type: 'image/png',
        },
      ],
    },
    workbox: {
      maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json}'],
      globIgnores: ['**/*.{jpg,jpeg}', '**/vendor/heic-*.js'], // 忽略大图片文件和按需 HEIC codec
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'google-fonts-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
            },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'gstatic-fonts-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
            },
          },
        },
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'images-cache',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 * 30, // <== 30 days
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
]

// https://vitejs.dev/config/
export default defineConfig(async ({ command }) => {
  const devOnlyPlugins: PluginOption[] = []

  if (command === 'serve') {
    const { codeInspectorPlugin } = await import('code-inspector-plugin')
    devOnlyPlugins.push(
      codeInspectorPlugin({
        bundler: 'vite',
        hotKeys: ['altKey'],
      }),
    )
  }

  return {
    base: '/',
    plugins: [
      ...devOnlyPlugins,
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
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
        { name: 'react', patterns: ['react', 'react-dom', 'react-router', 'scheduler'] },
        { name: 'i18n', patterns: ['i18next', 'i18next-browser-languagedetector', 'react-i18next'] },
        { name: 'motion', patterns: ['motion', 'framer-motion', 'motion-dom', 'motion-utils'] },
        { name: 'swiper', patterns: ['swiper'] },
        { name: 'state', patterns: ['jotai', 'zustand', '@tanstack/*'] },
        {
          name: 'ui',
          patterns: [
            '@radix-ui/*',
            '@floating-ui/*',
            'react-remove-scroll',
            'react-remove-scroll-bar',
            'react-style-singleton',
            'aria-hidden',
            'use-sidecar',
            'use-callback-ref',
            'sonner',
            'vaul',
          ],
        },
        {
          name: 'masonry',
          patterns: [
            'masonic',
            'trie-memoize',
            'raf-schd',
            '@react-hook/*',
            'react-intersection-observer',
            'react-use-measure',
            'usehooks-ts',
          ],
        },
        { name: 'heic', patterns: ['heic-to'] },
        {
          name: 'file-type',
          patterns: [
            'file-type',
            'strtok3',
            'token-types',
            'iobuffer',
            'uint8array-extras',
            'peek-readable',
            'ieee754',
          ],
        },
        { name: 'zoom', patterns: ['react-zoom-pan-pinch'] },
        { name: 'thumbhash', patterns: ['thumbhash'] },
        { name: 'exiftool', patterns: ['@uswriting/exiftool'] },
        { name: 'utils', patterns: ['es-toolkit', 'clsx', 'tailwind-merge', 'tailwind-variants', 'foxact', 'fflate'] },
      ]),
      localesJsonPlugin(),
      tailwindcss(),
      ...staticWebBuildPlugins,
      process.env.analyzer && analyzer(),
    ],
    server: {
      port: 1924, // 1924 年首款 35mm 相机问世
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
      BUILT_DATE: JSON.stringify(new Date().toLocaleDateString()),
      GIT_COMMIT_HASH: JSON.stringify(getGitHash()),
    },
  }
})

function getGitHash() {
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  } catch (e) {
    console.error('Failed to get git hash', e)
    return ''
  }
}
