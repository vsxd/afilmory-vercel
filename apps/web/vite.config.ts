import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import type { PluginOption } from "vite";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import { checker } from "vite-plugin-checker";
import { createHtmlPlugin } from "vite-plugin-html";
import tsconfigPaths from "vite-tsconfig-paths";

import PKG from "../../package.json";
import { siteConfig } from "../../site.config.build";
import { astPlugin } from "./plugins/vite/ast";
import { buildAssetsPlugin } from "./plugins/vite/build-assets";
import { dependencyChunkGroups } from "./plugins/vite/chunks";
import { dataInjectPlugin } from "./plugins/vite/data-inject";
import { createDependencyChunksPlugin } from "./plugins/vite/deps";
import { localesJsonPlugin } from "./plugins/vite/locales-json";
import { photosStaticPlugin } from "./plugins/vite/photos-static";
import { createAfilmoryPwaPlugin } from "./plugins/vite/pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ReactCompilerConfig = {
  /* ... */
};

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

const staticWebBuildPlugins: PluginOption[] = [
  dataInjectPlugin(),
  photosStaticPlugin(),

  createAfilmoryPwaPlugin(siteConfig),

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
  const tailwindcss = await loadTailwindcssPlugin();

  if (command === "serve") {
    silenceUnavailableNodeLocalStorageWarning();
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

      createDependencyChunksPlugin(dependencyChunkGroups),
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

async function loadTailwindcssPlugin() {
  // Tailwind 4.1.x calls the deprecated module.register() during import on Node 26.
  const previousNoDeprecation = process.noDeprecation;
  process.noDeprecation = true;
  try {
    return (await import("@tailwindcss/vite")).default;
  } finally {
    process.noDeprecation = previousNoDeprecation;
  }
}
