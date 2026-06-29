import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { assertManifest } from "@afilmory/schema";
import { DOMParser } from "linkedom";
import type { Plugin } from "vite";

import { siteConfig } from "../../../../site.config.build";
import { MANIFEST_PATH } from "./__internal__/constants";

// ── manifest helpers ──────────────────────────────────────────────────────────

function resolveEmbedPreference(command: "serve" | "build"): boolean {
  const flag = process.env.AFILMORY_EMBED_MANIFEST?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return command === "serve";
}

function getManifestContent(command: "serve" | "build"): string {
  try {
    return JSON.stringify(
      assertManifest(JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"))),
    );
  } catch (error) {
    if (command === "build") {
      throw new Error(
        `[data-inject] Cannot read manifest at ${MANIFEST_PATH}. ` +
          `Run "pnpm build:manifest" before "pnpm build:web". Original error: ${error}`,
      );
    }
    console.warn(
      "[data-inject] Failed to read manifest file (dev mode, using empty object):",
      error,
    );
    return "{}";
  }
}

function escapeInlineScriptJson(json: string): string {
  return json
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function ensureRuntimeScript(): string {
  return `window.__AFILMORY__ = Object.assign({ version: 1 }, window.__AFILMORY__);`;
}

function buildRuntimeAssignment(path: string, json: string): string {
  return `${ensureRuntimeScript()}window.__AFILMORY__.${path} = ${escapeInlineScriptJson(json)};`;
}

// ── site-config helpers ───────────────────────────────────────────────────────

const CONFIG_SCRIPT_ID = "config";
const INJECTED_SCRIPT_ID = "config-runtime";
const MANIFEST_DEV_PUBLIC_PATH = "/__afilmory/photos-manifest.json";

function buildInlineManifestScriptContent(manifestJson: string): string {
  return [
    ensureRuntimeScript(),
    `window.__AFILMORY__.manifest = {`,
    `  mode: 'inline',`,
    `  data: ${escapeInlineScriptJson(manifestJson)},`,
    `};`,
    `window.__AFILMORY__.manifest.promise = Promise.resolve(window.__AFILMORY__.manifest.data);`,
  ].join("");
}

function buildExternalManifestScriptContent(manifestUrl: string): string {
  const safeUrl = JSON.stringify(manifestUrl);

  return [
    ensureRuntimeScript(),
    `window.__AFILMORY__.manifest = window.__AFILMORY__.manifest?.mode === 'external' ? window.__AFILMORY__.manifest : { mode: 'external', url: ${safeUrl} };`,
    `window.__AFILMORY__.manifest.url = ${safeUrl};`,
    `window.__AFILMORY__.manifest.promise ??= (() => {`,
    `  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;`,
    `  const timeoutId = window.setTimeout(() => controller?.abort(), 15000);`,
    `  return fetch(window.__AFILMORY__.manifest.url, {`,
    `    credentials: 'same-origin',`,
    `    cache: 'force-cache',`,
    `    signal: controller ? controller.signal : undefined,`,
    `    headers: { accept: 'application/json' },`,
    `  })`,
    `    .then((response) => {`,
    `      if (!response.ok) {`,
    `        throw new Error(\`[data-inject] Failed to fetch manifest: \${response.status} \${response.statusText}\`.trim());`,
    `      }`,
    `      return response.json();`,
    `    })`,
    `    .finally(() => window.clearTimeout(timeoutId));`,
    `})();`,
  ].join("");
}

// ── combined plugin ───────────────────────────────────────────────────────────

export function dataInjectPlugin(): Plugin {
  let embedManifest: boolean | undefined;
  let emittedManifestAssetFileName: string | null = null;

  const siteConfigScriptContent = buildRuntimeAssignment(
    "config",
    JSON.stringify({
      features: {},
      site: siteConfig,
    }),
  );
  const parser = new DOMParser();
  const getBuildManifestAssetPublicPath = () => {
    if (!emittedManifestAssetFileName) {
      throw new Error(
        "[data-inject] External manifest asset path was not initialized during build.",
      );
    }
    return `/${emittedManifestAssetFileName}`;
  };

  return {
    name: "data-inject",
    enforce: "pre",

    configResolved(config) {
      embedManifest = resolveEmbedPreference(
        config.command as "serve" | "build",
      );
    },

    buildStart() {
      const shouldEmbed = embedManifest ?? resolveEmbedPreference("build");
      emittedManifestAssetFileName = null;

      if (shouldEmbed) {
        return;
      }

      const manifestContent = getManifestContent("build");
      const manifestHash = createHash("sha256")
        .update(manifestContent)
        .digest("hex")
        .slice(0, 10);
      emittedManifestAssetFileName = `assets/photos-manifest.${manifestHash}.json`;

      this.emitFile({
        type: "asset",
        fileName: emittedManifestAssetFileName,
        source: manifestContent,
      });
    },

    configureServer(server) {
      const shouldEmbed =
        embedManifest ??
        resolveEmbedPreference(server.config.command as "serve");
      server.watcher.add(MANIFEST_PATH);

      server.watcher.on("change", (file) => {
        if (file === MANIFEST_PATH) {
          server.config.logger.info(
            "[data-inject] Manifest file changed, triggering full reload",
          );
          // 触发页面重新加载
          server.ws.send({
            type: "full-reload",
          });
        }
      });

      if (shouldEmbed) {
        return;
      }

      server.middlewares.use(MANIFEST_DEV_PUBLIC_PATH, (_req, res) => {
        try {
          const manifestContent = getManifestContent("serve");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(manifestContent);
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    },

    transformIndexHtml(html, ctx) {
      const command: "serve" | "build" = ctx?.server ? "serve" : "build";
      const shouldEmbed = embedManifest ?? resolveEmbedPreference(command);
      embedManifest = shouldEmbed;
      const document = parser.parseFromString(html, "text/html");

      const manifestScriptContent = shouldEmbed
        ? buildInlineManifestScriptContent(getManifestContent(command))
        : buildExternalManifestScriptContent(
            command === "serve"
              ? MANIFEST_DEV_PUBLIC_PATH
              : getBuildManifestAssetPublicPath(),
          );

      const manifestScript = document.querySelector("#manifest");
      if (manifestScript) {
        manifestScript.textContent = manifestScriptContent;
      }

      if (!shouldEmbed) {
        const manifestAssetPublicPath =
          command === "serve"
            ? MANIFEST_DEV_PUBLIC_PATH
            : getBuildManifestAssetPublicPath();
        const preloadLink = document.createElement("link");
        preloadLink.setAttribute("rel", "preload");
        preloadLink.setAttribute("as", "fetch");
        preloadLink.setAttribute("href", manifestAssetPublicPath);
        // crossorigin="anonymous" 让 preload 的模式为 cors + 凭据模式 same-origin，
        // 与运行时 fetch(credentials: "same-origin", 默认 mode: cors) 匹配，preload 才会被复用。
        // （SPA 在 JS 启动后才真正发起该 fetch，浏览器可能仍提示 "not used within a few
        // seconds"，这是客户端渲染的固有时序提示，无害。）
        preloadLink.setAttribute("crossorigin", "anonymous");
        document.head?.append(preloadLink);
      }

      if (!document.querySelector(`#${INJECTED_SCRIPT_ID}`)) {
        const scriptEl = document.createElement("script", "text/javascript");
        scriptEl.id = INJECTED_SCRIPT_ID;
        scriptEl.textContent = siteConfigScriptContent;

        const configScript = document.querySelector(`#${CONFIG_SCRIPT_ID}`);
        if (configScript?.parentNode) {
          configScript.parentNode.insertBefore(
            scriptEl,
            configScript.nextSibling,
          );
        } else if (document.head) {
          document.head.append(scriptEl);
        } else {
          const fallbackParent = document.body ?? document.documentElement;
          fallbackParent?.append(scriptEl);
        }
      }

      return document.toString();
    },
  };
}
