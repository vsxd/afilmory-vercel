import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SOURCE_ROOTS = [
  "apps",
  "packages",
  "builder.config.ts",
  "site.config.ts",
  "site.config.build.ts",
];
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".ts",
  ".tsx",
]);

type Rule = {
  allow?: (relativePath: string) => boolean;
  message: string;
  pattern: RegExp;
};

const rules: Rule[] = [
  {
    pattern: new RegExp("@afilmory/" + "data"),
    message:
      "Internal packages must import schema or media packages instead of the legacy data package.",
  },
  {
    pattern: /@afilmory\/schema/,
    message: "packages/ui must not depend on manifest schema types.",
    allow: (file) => !file.startsWith("packages/ui/"),
  },
  {
    pattern: /from\s+["']zustand(?:\/[^"']*)?["']/,
    message: "UI state must use Jotai; Zustand imports are not allowed.",
  },
  {
    pattern:
      /__CONFIG__|__SITE_CONFIG__|__MANIFEST__|__MANIFEST_URL__|__MANIFEST_PROMISE__|__AFILMORY_STARTUP__|__AFILMORY_CRITICAL_ROUTE_PRELOAD_CLEANUP__|window\.router/,
    message: "Browser globals must live under window.__AFILMORY__.",
    allow: (file) => file === "apps/web/e2e/runtime-state.spec.ts",
  },
  {
    pattern:
      /globalThis\.__afilmory|StorageFactory|StorageRegistry|StorageProviderFactory|registerStorageProvider|registerProvider/,
    message:
      "Do not reintroduce builder global registries or legacy singleton storage hooks.",
  },
  {
    pattern:
      /github-repo-sync|plugins\/storage\/(?:github|eagle|local|s3)|(?:GitHub|Eagle|Local)StorageProvider|provider:\s*["'](?:github|eagle|local)["']/,
    message:
      "Builder core is S3-only; non-S3 storage providers are not allowed.",
  },
  {
    pattern: /EventBus|event-bus/,
    message: "Do not reintroduce the browser EventBus singleton.",
  },
  {
    pattern:
      /WorkerPool|ClusterPool|processPhoto|thumbnailExists|handleDeletedPhotos|saveManifest/,
    message:
      "AfilmoryBuilder must delegate scanning, planning, processing, assembly, and artifact writes to builder/workflow modules.",
    allow: (file) => file !== "packages/builder/src/builder/builder.ts",
  },
  {
    pattern: /image-convert|video-converter|motion-photo-extractor|file-type/,
    message:
      "ImageLoaderManager must stay a thin orchestrator; fetch, conversion, and video logic belong in dedicated services.",
    allow: (file) => file !== "apps/web/src/lib/image-loader-manager.ts",
  },
  {
    pattern: /texture\.worker\?raw|\.\/shaders/,
    message:
      "WebGLImageViewerEngine must use renderer and worker bridge modules instead of importing shader or worker internals directly.",
    allow: (file) =>
      file !== "packages/webgl-viewer/src/WebGLImageViewerEngine.ts",
  },
];

function* walk(target: string): Generator<string> {
  const fullPath = path.join(ROOT, target);
  if (!fs.existsSync(fullPath)) return;

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    yield fullPath;
    return;
  }

  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "generated" ||
      entry.name === ".cache"
    ) {
      continue;
    }

    const next = path.join(target, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      yield* walk(next);
    } else {
      yield path.join(ROOT, next);
    }
  }
}

const failures: string[] = [];

for (const sourceRoot of SOURCE_ROOTS) {
  for (const file of walk(sourceRoot)) {
    const relativePath = path.relative(ROOT, file);
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;

    const content = fs.readFileSync(file, "utf-8");
    for (const rule of rules) {
      if (rule.allow?.(relativePath)) continue;
      if (rule.pattern.test(content)) {
        failures.push(`${relativePath}: ${rule.message}`);
      }
    }
  }
}

/* eslint-disable no-console */

if (failures.length > 0) {
  console.error("[architecture] Boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("[architecture] Boundary check passed.");
}
