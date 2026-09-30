/* eslint-disable no-console */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { transformWithOxc } from "vite";
import { z } from "zod";

import { createDemoEnvironment, createDemoFixture } from "./demo-server.js";
import { createE2EWebEnvironment } from "./e2e-web-environment.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prefix = "/__device-check";
const maxReportBytes = 20 * 1024;
const count = z.number().int().min(0).max(1_000_000);
const milliseconds = z.number().finite().min(0).max(86_400_000);
const frames = z
  .object({
    count: count.max(60_000),
    p50Ms: milliseconds,
    p95Ms: milliseconds,
    p99Ms: milliseconds,
    maxMs: milliseconds,
    over50Ms: count,
    over100Ms: count,
  })
  .strict()
  .refine(
    (value) =>
      value.p50Ms <= value.p95Ms &&
      value.p95Ms <= value.p99Ms &&
      value.p99Ms <= value.maxMs &&
      value.over100Ms <= value.over50Ms &&
      value.over50Ms <= value.count,
  );
export const deviceReportSchema = z
  .object({
    version: z.literal(1),
    startedAt: z.iso.datetime(),
    userAgent: z.string().max(2048),
    model: z.string().max(100),
    observation: z.enum([
      "unknown",
      "smooth",
      "minor-stutter",
      "frequent-stutter",
      "reload",
    ]),
    notes: z.string().max(500),
    reloads: count,
    metrics: z
      .object({
        durationMs: milliseconds,
        frames,
        sampleLimitReached: z.boolean(),
        longTasks: z
          .object({
            supported: z.boolean(),
            count,
            totalMs: milliseconds,
            maxMs: milliseconds,
          })
          .strict(),
        contextLost: count,
        contextRestored: count,
        pageErrors: count,
        errorCounts: z
          .object({
            runtime: count,
            img: count,
            script: count,
            link: count,
            video: count,
            audio: count,
            other: count,
          })
          .strict()
          .optional(),
        unhandledRejections: count,
        hiddenTransitions: count,
        viewport: z
          .object({
            width: z.number().int().min(1).max(32768),
            height: z.number().int().min(1).max(32768),
            dpr: z.number().finite().positive().max(20),
          })
          .strict(),
      })
      .strict()
      .refine(
        (value) =>
          !value.errorCounts ||
          Object.values(value.errorCounts).reduce(
            (total, errors) => total + errors,
            0,
          ) === value.pageErrors,
      )
      .nullable(),
  })
  .strict();

export function createDeviceBuildEnvironment(
  directory: string,
  realLibrary: boolean,
  manifestPath: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...(realLibrary
      ? createE2EWebEnvironment({ embedManifest: false, source })
      : createDemoEnvironment(manifestPath, source)),
    AFILMORY_EMBED_MANIFEST: "false",
    AFILMORY_MANIFEST_PATH: manifestPath,
    ...(realLibrary
      ? { AFILMORY_PUBLIC_ASSET_DIR: path.join(root, "apps/web/public") }
      : {}),
    DOTENV_CONFIG_PATH: path.join(directory, "environment.env"),
    SITE_NAME: "Afilmory Device Check",
    SITE_TITLE: "Afilmory Device Check",
    SITE_DESCRIPTION: "Local device performance check",
    SITE_LANGUAGE: "zh-CN",
  };
}

function panelHtml(token: string, realLibrary: boolean) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Afilmory 实机验证</title><style>
  *{box-sizing:border-box}body{margin:0;background:#141414;color:#fff;font:14px system-ui;height:100dvh;display:flex;flex-direction:column}header{padding:8px max(10px,env(safe-area-inset-left));border-bottom:1px solid #444}button,input,select,textarea{font:inherit;border:1px solid #666;border-radius:6px;padding:8px;color:inherit;background:#292929}button{min-height:44px}button:disabled{opacity:.4}#status{font-size:12px;line-height:1.4;margin:5px 0}details{max-height:35dvh;overflow:auto}label{display:block;margin:6px 0}input,select,textarea{width:100%}iframe{flex:1;min-height:0;width:100%;border:0;background:#111}summary{cursor:pointer}small{color:#bbb}
  </style></head><body><header><div><button id="start" disabled>开始</button> <button id="stop" disabled>结束</button> <button id="save" disabled>保存到 Mac</button> <small>${realLibrary ? "现有图库" : "合成样例"}</small></div><p id="status" role="status">正在加载应用…</p><details><summary>设备与观察 / 操作步骤</summary><p>开始后：滚动画廊 → 打开照片、缩放、切换几张并关闭 → 地图平移缩放 → 返回画廊 → 结束。</p><label>iPhone 型号（手填）<input id="model" maxlength="100" placeholder="例如 iPhone 15 Pro"></label><label>体验<select id="observation"><option value="unknown">未填写</option><option value="smooth">流畅</option><option value="minor-stutter">偶有卡顿</option><option value="frequent-stutter">明显卡顿</option><option value="reload">页面刷新或退出</option></select></label><label>卡顿/刷新观察（不填照片信息）<textarea id="notes" maxlength="500" rows="2"></textarea></label><small>记录帧间隔与错误次数；不读取照片内容、EXIF、错误文本。Safari 未开放的 heap/GPU 内存不在测量范围。切后台不计入长帧；刷新可能丢失该段指标。</small></details></header><iframe title="Afilmory 实际应用" src="/" allow="fullscreen"></iframe><script type="module">import {installDevicePanel} from "${prefix}/client.js";installDevicePanel(${JSON.stringify(token)});</script></body></html>`;
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

function reply(
  response: ServerResponse,
  status: number,
  body: string,
  type = "text/plain; charset=utf-8",
) {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function readReport(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxReportBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(new Error("too large"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/** Reject traversal before URL normalization, then enforce the real filesystem boundary. */
export async function resolveDeviceAsset(
  distDirectory: string,
  rawUrl: string,
  htmlNavigation: boolean,
): Promise<string | null> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawUrl.split("?", 1)[0]);
  } catch {
    return null;
  }
  if (
    !pathname.startsWith("/") ||
    pathname.includes("\\") ||
    pathname.includes("\0") ||
    pathname
      .split("/")
      .some((segment) => segment === ".." || segment.startsWith("."))
  )
    return null;
  const dist = await fs.realpath(distDirectory);
  let candidate = path.resolve(dist, `.${pathname}`);
  if (candidate !== dist && !candidate.startsWith(`${dist}${path.sep}`))
    return null;
  try {
    if ((await fs.stat(candidate)).isDirectory())
      candidate = path.join(candidate, "index.html");
    const real = await fs.realpath(candidate);
    return real.startsWith(`${dist}${path.sep}`) &&
      (await fs.stat(real)).isFile()
      ? real
      : null;
  } catch {
    if (
      htmlNavigation &&
      !path.extname(pathname) &&
      !pathname.startsWith("/assets/") &&
      !pathname.startsWith("/originals/") &&
      !pathname.startsWith("/thumbnails/")
    ) {
      const index = await fs.realpath(path.join(dist, "index.html"));
      return index.startsWith(`${dist}${path.sep}`) ? index : null;
    }
    return null;
  }
}

export function createDeviceCheckServer(options: {
  distDirectory: string;
  reportDirectory: string;
  token: string;
  clientScript: string;
  realLibrary: boolean;
  onReport?: (file: string, report: z.infer<typeof deviceReportSchema>) => void;
}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://device-check.local");
      const cookie = request.headers.cookie
        ?.split(";")
        .some(
          (part) => part.trim() === `afilmory_device_session=${options.token}`,
        );
      const isEntry = url.pathname === prefix || url.pathname === `${prefix}/`;
      if (
        isEntry &&
        request.method === "GET" &&
        url.searchParams.get("token") === options.token
      ) {
        response.setHeader(
          "Set-Cookie",
          `afilmory_device_session=${options.token}; HttpOnly; SameSite=Strict; Path=/`,
        );
        response.setHeader("Referrer-Policy", "no-referrer");
        reply(
          response,
          200,
          panelHtml(options.token, options.realLibrary),
          "text/html; charset=utf-8",
        );
        return;
      }
      if (!cookie) {
        reply(response, 403, "Open the device-check link printed on the Mac.");
        return;
      }
      if (url.pathname === `${prefix}/report`) {
        if (
          request.method !== "POST" ||
          request.headers["x-device-token"] !== options.token ||
          request.headers["content-type"]?.split(";", 1)[0] !==
            "application/json"
        ) {
          reply(response, 403, "Report not authorized");
          return;
        }
        if (Number(request.headers["content-length"]) > maxReportBytes) {
          request.resume();
          reply(response, 413, "Report too large");
          return;
        }
        let body: string;
        try {
          body = await readReport(request);
        } catch {
          reply(response, 413, "Report too large");
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          reply(response, 400, "Invalid report");
          return;
        }
        const result = deviceReportSchema.safeParse(parsed);
        if (!result.success) {
          reply(response, 400, "Invalid report fields");
          return;
        }
        const file = path.join(
          options.reportDirectory,
          `report-${Date.now()}-${randomBytes(4).toString("hex")}.json`,
        );
        await fs.writeFile(
          file,
          JSON.stringify(
            {
              ...result.data,
              library: options.realLibrary ? "existing" : "synthetic",
              receivedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
          { mode: 0o600, flag: "wx" },
        );
        options.onReport?.(file, result.data);
        reply(response, 201, '{"saved":true}', "application/json");
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        reply(response, 405, "Method not allowed");
        return;
      }
      if (isEntry) {
        reply(
          response,
          200,
          panelHtml(options.token, options.realLibrary),
          "text/html; charset=utf-8",
        );
        return;
      }
      if (url.pathname === `${prefix}/client.js`) {
        reply(
          response,
          200,
          options.clientScript,
          "text/javascript; charset=utf-8",
        );
        return;
      }
      // Keep navigation instrumented. PWA/offline behavior is tested separately;
      // ordinary LAN HTTP does not support service workers on iPhone anyway.
      if (url.pathname === "/sw.js" || url.pathname.startsWith(`${prefix}/`)) {
        reply(response, 404, "Not found");
        return;
      }
      const file = await resolveDeviceAsset(
        options.distDirectory,
        request.url ?? "/",
        request.headers.accept?.includes("text/html") ?? false,
      );
      if (!file) {
        reply(response, 404, "Not found");
        return;
      }
      const type =
        mimeTypes[path.extname(file).toLowerCase()] ??
        "application/octet-stream";
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (path.extname(file) === ".html") {
        const html = await fs.readFile(file, "utf8");
        const probe = `<script type="module">import {installDeviceProbe} from "${prefix}/client.js";installDeviceProbe();</script>`;
        reply(
          response,
          200,
          request.method === "HEAD"
            ? ""
            : html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${probe}`),
          type,
        );
        return;
      }
      const { size } = await fs.stat(file);
      let start = 0;
      let end = size - 1;
      const { range } = request.headers;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) {
          start = match[1]
            ? Number(match[1])
            : Math.max(0, size - Number(match[2]));
          end =
            match[1] && match[2]
              ? Math.min(size - 1, Number(match[2]))
              : size - 1;
        } else start = size;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= size
        ) {
          response.setHeader("Content-Range", `bytes */${size}`);
          reply(response, 416, "Invalid range");
          return;
        }
        response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      }
      response.writeHead(range ? 206 : 200, {
        "Content-Type": type,
        "Content-Length": size ? end - start + 1 : 0,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      });
      if (request.method === "HEAD" || size === 0) {
        response.end();
        return;
      }
      const stream = createReadStream(file, { start, end });
      response.once("close", () => stream.destroy());
      stream.once("error", () => response.destroy());
      stream.pipe(response);
    } catch {
      if (!response.headersSent) reply(response, 500, "Device server error");
      else response.destroy();
    }
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "4176" },
      "real-library": { type: "boolean", default: false },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Port must be 1–65535");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "afilmory-device-build-"),
  );
  const reportDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "afilmory-device-reports-"),
  );
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let fixture: Awaited<ReturnType<typeof createDemoFixture>> | undefined;
  let server: ReturnType<typeof createDeviceCheckServer> | undefined;
  try {
    await fs.writeFile(path.join(directory, "environment.env"), "");
    if (!values["real-library"]) fixture = await createDemoFixture();
    const manifestPath =
      fixture?.manifestPath ??
      path.join(root, "generated/photos-manifest.json");
    console.info(
      `Building a temporary production ${values["real-library"] ? "existing-library" : "synthetic"} site (inputs remain unchanged)…`,
    );
    if (abort.signal.aborted) return;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          path.join(root, "scripts/device-check-build.ts"),
          directory,
          values["real-library"] ? "real" : "synthetic",
        ],
        {
          cwd: root,
          env: createDeviceBuildEnvironment(
            directory,
            values["real-library"],
            manifestPath,
          ),
          stdio: "ignore",
        },
      );
      const stopBuild = () => child.kill("SIGTERM");
      abort.signal.addEventListener("abort", stopBuild, { once: true });
      child.once("error", reject);
      child.once("exit", (code) => {
        abort.signal.removeEventListener("abort", stopBuild);
        code === 0
          ? resolve()
          : reject(
              new Error(
                `Production build failed (exit ${code ?? "signal"}). Run the standard checks for diagnostics.`,
              ),
            );
      });
    });
    if (abort.signal.aborted) return;
    const clientPath = path.join(root, "scripts/device-check-client.ts");
    const client = await transformWithOxc(
      await fs.readFile(clientPath, "utf8"),
      clientPath,
      { target: "safari16.4" },
    );
    if (abort.signal.aborted) return;
    const token = randomBytes(24).toString("hex");
    server = createDeviceCheckServer({
      distDirectory: path.join(directory, "dist"),
      reportDirectory,
      token,
      clientScript: client.code,
      realLibrary: values["real-library"],
      onReport: (file, report) =>
        console.info(
          `Saved ${file} | samples=${report.metrics?.frames.count ?? 0}, p95=${report.metrics?.frames.p95Ms ?? "unavailable"}ms, reloads=${report.reloads}`,
        ),
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(port, values.host, resolve);
    });
    if (abort.signal.aborted) return;
    const hosts =
      values.host === "0.0.0.0"
        ? [
            "127.0.0.1",
            ...Object.values(os.networkInterfaces()).flatMap(
              (entries) =>
                entries
                  ?.filter(
                    (entry) => entry.family === "IPv4" && !entry.internal,
                  )
                  .map((entry) => entry.address) ?? [],
            ),
          ]
        : [values.host];
    for (const host of new Set(hosts))
      console.info(`Open: http://${host}:${port}${prefix}/?token=${token}`);
    console.info(
      `Reports: ${reportDirectory}\nUse the Mac's LAN/hotspot address on iPhone. Ctrl+C stops the server; reports remain.`,
    );
    await new Promise<void>((resolve) => {
      if (abort.signal.aborted) resolve();
      else
        abort.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  } catch (error) {
    if (!abort.signal.aborted) throw error;
  } finally {
    const closingServer = server;
    if (closingServer)
      await new Promise<void>((resolve) => {
        closingServer.close(() => resolve());
        closingServer.closeAllConnections();
      });
    await fixture?.cleanup();
    await fs.rm(directory, { recursive: true, force: true });
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    console.info(
      `Temporary build removed. Reports retained: ${reportDirectory}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Device check failed",
    );
    process.exitCode = 1;
  });
}
