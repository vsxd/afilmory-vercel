import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// jsdom lacks Element.prototype.setPointerCapture — shim it for the two projects
// whose components drive Pointer Events (WebGL input controller + dismiss gesture).
const pointerCaptureShim = fileURLToPath(
  new URL("test/setup/pointer-capture-shim.ts", import.meta.url),
);
const failOnConsole = fileURLToPath(
  new URL("test/setup/fail-on-console.ts", import.meta.url),
);
const jsdomStorageShim = fileURLToPath(
  new URL("test/setup/jsdom-storage-shim.ts", import.meta.url),
);

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    // fail-on-console relies on teardown hooks unwinding in reverse order so
    // file-level afterEach/afterAll output is checked before the guard restores.
    sequence: { hooks: "stack" },
    projects: [
      {
        test: {
          name: "schema",
          root: "./packages/schema",
          include: ["src/**/*.test.ts"],
          setupFiles: [failOnConsole],
        },
      },
      {
        test: {
          name: "media",
          root: "./packages/media",
          include: ["src/**/*.test.ts"],
          setupFiles: [failOnConsole],
        },
      },
      {
        test: {
          name: "scripts",
          root: ".",
          include: ["scripts/**/*.test.ts"],
          environment: "node",
          setupFiles: [failOnConsole],
        },
      },
      {
        oxc: {
          jsx: { runtime: "automatic" },
        },
        test: {
          name: "ui",
          root: "./packages/ui",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: [failOnConsole, jsdomStorageShim],
        },
      },
      {
        test: {
          name: "builder",
          root: "./packages/builder",
          include: ["src/**/*.test.ts"],
          setupFiles: [failOnConsole],
        },
      },
      {
        test: {
          name: "build-assets",
          root: "./packages/build-assets",
          include: ["src/**/*.test.ts"],
          environment: "node",
          setupFiles: [failOnConsole],
        },
      },
      {
        oxc: {
          jsx: { runtime: "automatic" },
        },
        test: {
          name: "webgl-viewer",
          root: "./packages/webgl-viewer",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: [failOnConsole, jsdomStorageShim, pointerCaptureShim],
        },
      },
      {
        test: {
          name: "web-build",
          root: "./apps/web",
          include: ["plugins/**/*.test.ts", "scripts/**/*.test.ts"],
          environment: "node",
          setupFiles: [failOnConsole],
        },
      },
      {
        oxc: {
          jsx: { runtime: "automatic" },
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
          setupFiles: [failOnConsole, jsdomStorageShim, pointerCaptureShim],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Vitest 4 uses explicit include patterns to count both covered and
      // untested source files. Keep the full source surface in the denominator.
      include: [
        "packages/*/src/**/*.{ts,tsx}",
        "apps/web/src/**/*.{ts,tsx}",
        "apps/web/plugins/**/*.ts",
        "apps/web/scripts/**/*.ts",
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
        // 配置文件
        "**/*.config.{ts,js,mjs}",
      ],
      // Rebased on Vitest 4's AST remapping without dropping source files or
      // tests; see docs/testing.md for the measured migration baseline.
      thresholds: {
        statements: 70,
        branches: 63,
        functions: 73,
        lines: 70,
      },
    },
  },
});
