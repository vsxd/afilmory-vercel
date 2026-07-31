import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import type { PluginOption } from "vite";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import { checker } from "vite-plugin-checker";
import { createHtmlPlugin } from "vite-plugin-html";
import tsconfigPaths from "vite-tsconfig-paths";

import { env } from "../../env";
import { siteConfig } from "../../site.config.build";
import { buildAssetsPlugin } from "./plugins/vite/build-assets";
import { dependencyChunkGroups } from "./plugins/vite/chunks";
import { dataInjectPlugin } from "./plugins/vite/data-inject";
import { createDependencyChunksPlugin } from "./plugins/vite/deps";
import { localesJsonPlugin } from "./plugins/vite/locales-json";
import { photosStaticPlugin } from "./plugins/vite/photos-static";
import { createAfilmoryPwaPlugin } from "./plugins/vite/pwa";
import { virtualRoutesPlugin } from "./plugins/vite/routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// process.noDeprecation is a real Node API that @types/node 24 doesn't declare.
const proc = process as NodeJS.Process & { noDeprecation?: boolean };

async function loadTailwindcssPlugin() {
  // Tailwind 4.1.x calls the deprecated module.register() during import on Node 26.
  const previousNoDeprecation = proc.noDeprecation;
  proc.noDeprecation = true;
  try {
    return (await import("@tailwindcss/vite")).default;
  } finally {
    proc.noDeprecation = previousNoDeprecation;
  }
}

// The runner config loader closes after evaluating this module, so config-time
// dependencies must be resolved before Vite invokes the exported config hook.
const tailwindcss = await loadTailwindcssPlugin();

const ReactCompilerConfig = {/* ... */};

function silenceUnavailableNodeLocalStorageWarning() {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  if (!descriptor || !("get" in descriptor) || !descriptor.configurable) {
    return;
  }

  // code-inspector probes localStorage while loading in Node. On Node 22 this
  // getter emits an ExperimentalWarning unless --localstorage-file is provided.
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: descriptor.enumerable,
    value: undefined,
    writable: true,
  });
}

async function loadCodeInspectorPlugin() {
  silenceUnavailableNodeLocalStorageWarning();
  return (await import("code-inspector-plugin")).codeInspectorPlugin;
}

// The runner config loader closes after evaluating this module, so dev-only
// dependencies also need to resolve before Vite invokes the config hook.
const codeInspectorPlugin = await loadCodeInspectorPlugin();

const staticWebBuildPlugins: PluginOption[] = [
  dataInjectPlugin(),
  photosStaticPlugin({
    provider: env.PHOTO_STORAGE_PROVIDER,
    localPhotosPath: env.LOCAL_PHOTOS_PATH,
    baseUrl: env.LOCAL_PHOTOS_BASE_URL,
  }),

  createAfilmoryPwaPlugin(siteConfig, env.LOCAL_PHOTOS_BASE_URL),

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
    devOnlyPlugins.push(
      codeInspectorPlugin({
        bundler: "vite",
        hotKeys: ["altKey"],
      }),
    );
  }

  return {
    base: "/",
    // Swiper exposes optional React bindings without declaring React as a peer.
    // Resolve them from the app root and keep one React instance in the bundle.
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    plugins: [
      ...devOnlyPlugins,
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler", ReactCompilerConfig]],
        },
      }),

      tsconfigPaths(),
      virtualRoutesPlugin(),
      checker({
        typescript: true,
        enableBuild: true,
        root: __dirname,
      }),

      createDependencyChunksPlugin(dependencyChunkGroups),
      localesJsonPlugin(),
      tailwindcss(),
      ...staticWebBuildPlugins,
      process.env.analyzer ? analyzer() : undefined,
    ],
    server: {
      port: 1924, // 1924 年首款 35mm 相机问世
    },
    build: {
      cssTarget: "safari16.4",
      // 启用 CSS 代码分割
      cssCodeSplit: true,
      // 产物命名与分块策略统一由 createDependencyChunksPlugin 设置，
      // 在此处声明会被其 config() 钩子静默覆盖。
    },
    css: {
      lightningcss: {
        targets: { safari: (16 << 16) | (4 << 8) },
        errorRecovery: true,
      },
    },
  };
});
