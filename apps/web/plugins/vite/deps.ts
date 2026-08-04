import { gzipSync } from "node:zlib";

import type { Plugin, UserConfig } from "vite";

import { setCriticalPrecacheFiles } from "./__internal__/precache-policy";

export type DependencyChunkGroup = {
  name: string;
  patterns: string[];
};

/**
 * Cross-vendor static cycles are unsafe with manual chunks: evaluation may
 * reach an imported binding before the exporting vendor chunk initializes it.
 * Return the first dangerous cycle so the production build can fail closed.
 */
export function findStaticVendorChunkCycle(
  importsByChunk: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const states = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];

  const visit = (fileName: string): string[] | null => {
    states.set(fileName, "visiting");
    stack.push(fileName);

    for (const importedFile of importsByChunk.get(fileName) ?? []) {
      if (!importsByChunk.has(importedFile)) continue;

      const state = states.get(importedFile);
      if (!state) {
        const nestedCycle = visit(importedFile);
        if (nestedCycle) return nestedCycle;
        continue;
      }

      if (state === "visiting") {
        const cycleStart = stack.lastIndexOf(importedFile);
        const cycle = [...stack.slice(cycleStart), importedFile];
        const vendorChunks = new Set(
          cycle.filter((item) => item.startsWith("vendor/")),
        );
        if (vendorChunks.size >= 2) return cycle;
      }
    }

    stack.pop();
    states.set(fileName, "visited");
    return null;
  };

  for (const fileName of importsByChunk.keys()) {
    if (states.has(fileName)) continue;
    const cycle = visit(fileName);
    if (cycle) return cycle;
  }

  return null;
}

function getNodeModulePackageName(id: string): string | null {
  const modulePath = id.split("/node_modules/").at(-1);
  if (!modulePath) return null;

  const [firstSegment, secondSegment] = modulePath.split("/");
  if (!firstSegment || firstSegment === ".pnpm") return null;

  if (firstSegment.startsWith("@") && secondSegment) {
    return `${firstSegment}/${secondSegment}`;
  }

  return firstSegment;
}

function matchesPattern(packageName: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    return packageName.startsWith(pattern.slice(0, -1));
  }

  return packageName === pattern;
}

export function createDependencyChunksPlugin(
  groups: DependencyChunkGroup[],
): Plugin {
  const renderedImports = new Map<string, string[]>();
  const renderedEntries = new Set<string>();
  const renderedCriticalRoutes = new Set<string>();

  const publishRenderedPrecacheGraph = () => {
    const files = new Set<string>();
    const visit = (fileName: string) => {
      if (files.has(fileName)) return;
      files.add(fileName);
      for (const importedFile of renderedImports.get(fileName) ?? []) {
        visit(importedFile);
      }
    };
    for (const fileName of renderedEntries) visit(fileName);
    for (const fileName of renderedCriticalRoutes) visit(fileName);
    if (files.size > 0) setCriticalPrecacheFiles(files);
  };

  return {
    name: "dependency-chunks",
    renderStart() {
      renderedImports.clear();
      renderedEntries.clear();
      renderedCriticalRoutes.clear();
      setCriticalPrecacheFiles([]);
    },
    renderChunk(_code, chunk) {
      renderedImports.set(chunk.fileName, [...chunk.imports]);
      if (chunk.isEntry) renderedEntries.add(chunk.fileName);
      if (
        chunk.facadeModuleId
          ?.replaceAll("\\", "/")
          .endsWith("/src/pages/(main)/layout.tsx")
      ) {
        renderedCriticalRoutes.add(chunk.fileName);
      }
      // renderChunk runs before Workbox starts generating the service worker.
      // Publishing incrementally avoids a generateBundle hook ordering race
      // between Rollup and vite-plugin-pwa.
      publishRenderedPrecacheGraph();
      return null;
    },
    config(config: UserConfig) {
      config.build = config.build || {};
      // The HEIC codec bundle is intentionally loaded on demand and remains large.
      config.build.chunkSizeWarningLimit = 3000;
      config.build.rolldownOptions = config.build.rolldownOptions || {};
      config.build.rolldownOptions.output =
        config.build.rolldownOptions.output || {};

      const { output } = config.build.rolldownOptions;
      const outputConfig = Array.isArray(output) ? output[0] : output;
      // 产物命名模板集中在这里单一来源；vite.config.ts 里的同名字段会被本钩子覆盖。
      outputConfig.entryFileNames = "assets/[name].[hash].js";
      outputConfig.assetFileNames = "assets/[name].[hash:6][extname]";
      // Let Rollup place shared helpers into a neutral shared chunk.
      // Forcing only-explicit manual chunks can make vendor chunks import the entry chunk,
      // which creates bootstrap-time ESM cycles in production.
      outputConfig.chunkFileNames = (chunkInfo) => {
        return chunkInfo.name.startsWith("vendor/")
          ? "[name]-[hash].js"
          : "assets/[name]-[hash].js";
      };

      const getDependencyChunkName = (id: string): string | null => {
        // Vite's preload helper and Rollup's CommonJS helpers are shared by both
        // eager and lazy chunks. If Rollup happens to place either helper inside
        // a large lazy-only vendor chunk (MapLibre was the observed case), the
        // entry chunk acquires a static import to that vendor and Vite emits a
        // modulepreload for the whole feature. Keep runtime glue in a tiny,
        // neutral chunk so feature boundaries stay real rather than cosmetic.
        if (
          id.includes("vite/preload-helper") ||
          id.includes("commonjsHelpers") ||
          id.includes("commonjs-dynamic-modules")
        ) {
          return "vendor/runtime";
        }

        if (!id.includes("/node_modules/")) {
          return null;
        }

        const packageName = getNodeModulePackageName(id);
        if (!packageName) {
          return null;
        }

        const matchedGroup = groups.find((group) =>
          group.patterns.some((pattern) =>
            matchesPattern(packageName, pattern),
          ),
        );
        return matchedGroup ? `vendor/${matchedGroup.name}` : null;
      };

      // Rolldown captures a manual group's dependencies recursively by default.
      // That makes a lazy-only group such as MapLibre absorb React internals and
      // turns the resulting map chunk into a static dependency of the entry.
      // Keep package groups exact and let automatic chunking place their shared
      // dependencies according to the real entry graph.
      outputConfig.codeSplitting = {
        groups: [
          {
            includeDependenciesRecursively: false,
            name: getDependencyChunkName,
          },
        ],
      };
    },
    generateBundle(_outputOptions, bundle) {
      const chunks = Object.values(bundle).filter(
        (item): item is Extract<(typeof bundle)[string], { type: "chunk" }> =>
          item.type === "chunk",
      );
      const chunksByFileName = new Map(
        chunks.map((chunk) => [chunk.fileName, chunk]),
      );
      const entryFiles = new Set(
        chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName),
      );

      const vendorCycle = findStaticVendorChunkCycle(
        new Map(chunks.map((chunk) => [chunk.fileName, chunk.imports])),
      );
      if (vendorCycle) {
        this.error(
          `Static vendor chunk cycle detected: ${vendorCycle.join(" -> ")}. ` +
            "Keep tightly coupled dependencies in one manual chunk.",
        );
      }

      const leakedPrivateRoute = chunks.find((chunk) =>
        /\/src\/pages\/\((?:debug|data)\)\//.test(
          chunk.facadeModuleId?.replaceAll("\\", "/") ?? "",
        ),
      );
      if (leakedPrivateRoute) {
        this.error(
          `Private route leaked into production output: ${leakedPrivateRoute.facadeModuleId}`,
        );
      }

      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk" || !item.fileName.startsWith("vendor/")) {
          continue;
        }

        const importedEntryChunk = [
          ...item.imports,
          ...item.dynamicImports,
        ].find((importedFile) => entryFiles.has(importedFile));

        if (importedEntryChunk) {
          this.error(
            `Vendor chunk ${item.fileName} must not depend on entry chunk ${importedEntryChunk}. ` +
              "This creates a bootstrap cycle and can break production initialization.",
          );
        }
      }

      // Protect the initial dependency closure, not merely individual chunk
      // sizes. A tiny entry can still preload a megabyte through one misplaced
      // helper import. Map/HEIC/raw-EXIF are deliberately lazy product features
      // and must never enter the static entry closure.
      const initialFiles = new Set<string>();
      const visitInitialImport = (fileName: string) => {
        if (initialFiles.has(fileName)) return;
        initialFiles.add(fileName);
        const chunk = chunksByFileName.get(fileName);
        for (const importedFile of chunk?.imports ?? []) {
          visitInitialImport(importedFile);
        }
      };
      for (const entryFile of entryFiles) visitInitialImport(entryFile);

      // The gallery layout is a route-lazy chunk, but bootstrap explicitly
      // awaits it before the first React render. Treat it as part of the real
      // startup closure for both the gzip budget and the PWA app shell.
      const preRenderFiles = new Set(initialFiles);
      const visitPreRenderImport = (fileName: string) => {
        if (preRenderFiles.has(fileName)) return;
        preRenderFiles.add(fileName);
        const chunk = chunksByFileName.get(fileName);
        for (const importedFile of chunk?.imports ?? []) {
          visitPreRenderImport(importedFile);
        }
      };
      const criticalRouteChunks = chunks.filter((chunk) =>
        chunk.facadeModuleId
          ?.replaceAll("\\", "/")
          .endsWith("/src/pages/(main)/layout.tsx"),
      );
      if (criticalRouteChunks.length !== 1) {
        this.error(
          `Expected one critical gallery layout chunk, found ${criticalRouteChunks.length}.`,
        );
      }
      for (const chunk of criticalRouteChunks) {
        visitPreRenderImport(chunk.fileName);
      }

      // Vite records CSS referenced by each chunk outside Rollup's imports
      // graph. Include it in the offline shell allow-list.
      const criticalCss = new Set<string>();
      for (const fileName of preRenderFiles) {
        const metadata = chunksByFileName.get(fileName)?.viteMetadata as
          { importedCss?: Set<string> } | undefined;
        for (const cssFile of metadata?.importedCss ?? []) {
          criticalCss.add(cssFile);
        }
      }
      setCriticalPrecacheFiles([...preRenderFiles, ...criticalCss]);

      const forbiddenInitialPrefixes = [
        "vendor/map-",
        "vendor/heic-",
        "vendor/exiftool-",
      ];
      const leakedLazyChunk = [...preRenderFiles].find((fileName) =>
        forbiddenInitialPrefixes.some((prefix) => fileName.startsWith(prefix)),
      );
      if (leakedLazyChunk) {
        this.error(
          `Lazy-only chunk ${leakedLazyChunk} leaked into the static entry dependency closure.`,
        );
      }

      const initialGzipBytes = [...initialFiles].reduce((total, fileName) => {
        const item = bundle[fileName];
        if (!item) return total;
        const source =
          item.type === "chunk"
            ? item.code
            : typeof item.source === "string"
              ? item.source
              : Buffer.from(item.source);
        return total + gzipSync(source).byteLength;
      }, 0);
      const initialJsBudget = 360 * 1024;
      if (initialGzipBytes > initialJsBudget) {
        this.error(
          `Initial JavaScript closure is ${(initialGzipBytes / 1024).toFixed(1)} KiB gzip; budget is ${initialJsBudget / 1024} KiB.`,
        );
      }

      const preRenderGzipBytes = [...preRenderFiles].reduce(
        (total, fileName) => {
          const item = bundle[fileName];
          if (!item) return total;
          const source =
            item.type === "chunk"
              ? item.code
              : typeof item.source === "string"
                ? item.source
                : Buffer.from(item.source);
          return total + gzipSync(source).byteLength;
        },
        0,
      );
      const preRenderBudget = 420 * 1024;
      if (preRenderGzipBytes > preRenderBudget) {
        this.error(
          `Pre-render JavaScript closure is ${(preRenderGzipBytes / 1024).toFixed(1)} KiB gzip; budget is ${preRenderBudget / 1024} KiB.`,
        );
      }
      this.info(
        `Startup budgets: static ${(initialGzipBytes / 1024).toFixed(1)} KiB gzip; pre-render ${(preRenderGzipBytes / 1024).toFixed(1)} KiB gzip.`,
      );
    },
  };
}
