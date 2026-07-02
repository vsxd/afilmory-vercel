import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// jsdom lacks Element.prototype.setPointerCapture — shim it for the two projects
// whose components drive Pointer Events (WebGL input controller + dismiss gesture).
const pointerCaptureShim = fileURLToPath(
  new URL("test/setup/pointer-capture-shim.ts", import.meta.url),
);

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    projects: [
      {
        test: {
          name: "schema",
          root: "./packages/schema",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "media",
          root: "./packages/media",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "scripts",
          root: ".",
          include: ["scripts/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        esbuild: {
          jsx: "automatic",
        },
        test: {
          name: "ui",
          root: "./packages/ui",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
        },
      },
      {
        test: {
          name: "builder",
          root: "./packages/builder",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        esbuild: {
          jsx: "automatic",
        },
        test: {
          name: "webgl-viewer",
          root: "./packages/webgl-viewer",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: [pointerCaptureShim],
        },
      },
      {
        esbuild: {
          jsx: "automatic",
        },
        resolve: {
          alias: [
            {
              find: /^~\//,
              replacement: `${fileURLToPath(new URL("apps/web/src", import.meta.url))}/`,
            },
            {
              find: /^@locales\//,
              replacement: `${fileURLToPath(new URL("locales", import.meta.url))}/`,
            },
            {
              find: "@pkg",
              replacement: fileURLToPath(
                new URL("apps/web/package.json", import.meta.url),
              ),
            },
            {
              find: "@config",
              replacement: fileURLToPath(
                new URL("site.config.ts", import.meta.url),
              ),
            },
            {
              find: "@env",
              replacement: fileURLToPath(new URL("env.ts", import.meta.url)),
            },
            {
              find: "virtual:pwa-register",
              replacement: fileURLToPath(
                new URL(
                  "apps/web/src/test/stubs/pwa-register.ts",
                  import.meta.url,
                ),
              ),
            },
          ],
        },
        test: {
          name: "web",
          root: "./apps/web",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: [pointerCaptureShim],
        },
      },
    ],
    coverage: {
      // 报告优先（非强制门禁）：先建立可见的基线，后续再决定阈值。
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      // all: true —— 把未被任何测试导入的源文件也计入分母，
      // 这样未覆盖模块会显示成 0%，基线才真实。
      all: true,
      include: [
        "packages/*/src/**/*.{ts,tsx}",
        "apps/web/src/**/*.{ts,tsx}",
        "scripts/**/*.ts",
      ],
      exclude: [
        // 测试与测试基建本身
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/__tests__/**",
        "**/__mocks__/**",
        "**/test/**",
        "apps/web/e2e/**",
        // 构建产物与依赖
        "**/dist/**",
        "**/node_modules/**",
        // 纯类型 / 声明，无可执行逻辑
        "**/*.d.ts",
        "**/types.ts",
        "**/types/**",
        "packages/builder/src/plugins/types.ts",
        // 仅做 re-export 的桶文件，覆盖率无意义
        "**/index.ts",
        // 配置文件
        "**/*.config.{ts,js,mjs}",
      ],
    },
  },
});
