/**
 * prod-smoke webServer 入口（见 playwright.config.ts 的 prod-smoke project）：
 * 用固定的合成 fixture 走一遍真实生产构建，再以 vite preview 伺服 dist。
 * dev server 跑不到的生产专属行为——外部 manifest 资产 + index.html 内联
 * fetch 脚本、手动 vendor 分块、压缩产物、PWA Service Worker——只有这条
 * 路径能在真实浏览器里验证。
 *
 * 步骤：
 * 1. 通过 AFILMORY_MANIFEST_PATH 让构建直接读取提交的合成 fixture，不改写
 *    generated/photos-manifest.json。
 * 2. vite build（显式 AFILMORY_EMBED_MANIFEST=false，固定验证外部 manifest 模式）。
 * 3. 把 fixture 缩略图拷进 dist/thumbnails/，让页面加载零 404，spec 才能
 *    严格断言无 console error。
 * 4. vite preview 伺服 dist，Playwright 轮询 baseURL 直到就绪。
 *
 * vite 通过 node 直接执行其 bin，绕开对 PATH 里 pnpm 的依赖（本地 nvm
 * lazy-loader 环境下 webServer 子进程可能解析不到 pnpm）。
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createE2EWebEnvironment,
  resolveViteBin,
  VITE_CONFIG_LOADER_ARGS,
} from "./e2e-web-environment.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps/web");
const distDir = path.join(webDir, "dist");
const fixturesDir = path.join(webDir, "e2e/fixtures");

const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT = process.env.E2E_PROD_PORT ?? "4174";

const viteBin = resolveViteBin();

const buildEnvironment = createE2EWebEnvironment({ embedManifest: false });

// 2. Real production build (minified bundle, manual chunks, PWA SW,
//    hashed external-manifest asset, inline fetch script in dist/index.html).
const build = spawnSync(
  process.execPath,
  [viteBin, "build", ...VITE_CONFIG_LOADER_ARGS],
  {
    cwd: webDir,
    env: buildEnvironment,
    stdio: "inherit",
  },
);
if (build.status !== 0) {
  // 顶层 throw：非零退出且不再往下执行（拷贝缩略图 / 启动 preview）。
  throw new Error(`vite build failed with exit code ${build.status ?? "null"}`);
}

// 3. Ship the fixture thumbnails (含 Live Photo 的 .webm 视频) inside dist so
//    the gallery grid loads real files（no route stubs → Service Worker
//    接管后的请求也不会 404）。
cpSync(path.join(fixturesDir, "thumbnails"), path.join(distDir, "thumbnails"), {
  recursive: true,
});
// 4. Serve dist; Playwright owns this process's lifetime (kills the tree).
const preview = spawn(
  process.execPath,
  [
    viteBin,
    "preview",
    ...VITE_CONFIG_LOADER_ARGS,
    "--host",
    PREVIEW_HOST,
    "--port",
    PREVIEW_PORT,
    "--strictPort",
  ],
  { cwd: webDir, env: buildEnvironment, stdio: "inherit" },
);
preview.on("exit", (code) => {
  // 子进程退出后本进程事件循环随之排空，自然以该码退出（勿用 process.exit，
  // 避免截断尚未 flush 的 stdio）。
  process.exitCode = code ?? 0;
});
preview.on("error", (error) => {
  console.error(`[e2e] Failed to start Vite preview: ${error.message}`);
  process.exitCode = 1;
});
// Playwright 关停 webServer 时向进程组发信号：转发给 preview；事件循环
// 随后自然排空。
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    preview.kill(signal);
  });
}
