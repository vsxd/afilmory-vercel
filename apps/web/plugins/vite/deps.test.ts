import type { UserConfig } from "vite";
import { describe, expect, it } from "vitest";

import {
  getCriticalPrecacheFiles,
  setCriticalPrecacheFiles,
} from "./__internal__/precache-policy";
import { dependencyChunkGroups } from "./chunks";
import {
  createDependencyChunksPlugin,
  findStaticVendorChunkCycle,
} from "./deps";

describe("findStaticVendorChunkCycle", () => {
  it("reports a static cycle spanning multiple vendor chunks", () => {
    const imports = new Map<string, string[]>([
      ["assets/entry.js", ["vendor/ui-a.js"]],
      ["vendor/ui-a.js", ["assets/shared.js"]],
      ["assets/shared.js", ["vendor/ui-b.js"]],
      ["vendor/ui-b.js", ["vendor/ui-a.js"]],
    ]);

    expect(findStaticVendorChunkCycle(imports)).toEqual([
      "vendor/ui-a.js",
      "assets/shared.js",
      "vendor/ui-b.js",
      "vendor/ui-a.js",
    ]);
  });

  it("reports a file-type cycle through an automatically generated shared chunk", () => {
    expect(
      findStaticVendorChunkCycle(
        new Map([
          ["assets/entry.js", ["vendor/file-type-a.js"]],
          ["vendor/file-type-a.js", ["assets/shared.js"]],
          ["assets/shared.js", ["vendor/file-type-a.js"]],
        ]),
      ),
    ).toEqual([
      "vendor/file-type-a.js",
      "assets/shared.js",
      "vendor/file-type-a.js",
    ]);
  });

  it("allows acyclic graphs", () => {
    expect(
      findStaticVendorChunkCycle(
        new Map([
          ["assets/entry.js", ["vendor/ui.js"]],
          ["vendor/ui.js", []],
        ]),
      ),
    ).toBeNull();
  });

  it("rejects the MapLibre vendor/shared-style initialization cycle", () => {
    expect(
      findStaticVendorChunkCycle(
        new Map([
          ["assets/explore.js", ["vendor/map-a.js", "assets/style.js"]],
          ["vendor/map-a.js", ["assets/style.js"]],
          ["assets/style.js", ["vendor/map-a.js"]],
        ]),
      ),
    ).toEqual(["vendor/map-a.js", "assets/style.js", "vendor/map-a.js"]);
  });

  it("rejects observer hooks calling a CommonJS initializer in the viewer route which imports them", () => {
    expect(
      findStaticVendorChunkCycle(
        new Map([
          ["assets/photo.js", ["vendor/observers-a.js"]],
          ["vendor/observers-a.js", ["assets/photo.js"]],
        ]),
      ),
    ).toEqual(["assets/photo.js", "vendor/observers-a.js", "assets/photo.js"]);
  });
});

it("keeps eagerly initialized dependency families in the same vendor group", async () => {
  const config: UserConfig = {};
  const plugin = createDependencyChunksPlugin(dependencyChunkGroups);
  if (typeof plugin.config !== "function")
    throw new Error("Missing config hook");
  await plugin.config.call({} as never, config, {
    command: "build",
    mode: "production",
  });
  const output = config.build?.rolldownOptions?.output;
  const outputConfig = Array.isArray(output) ? output[0] : output;
  const codeSplitting = outputConfig?.codeSplitting;
  if (typeof codeSplitting !== "object")
    throw new Error("Missing chunk groups");
  const group = codeSplitting.groups?.[0];
  const getChunkName = group?.name;
  if (typeof getChunkName !== "function")
    throw new Error("Missing chunk group callback");
  const chunkingContext = { getModuleInfo: () => null };

  for (const packagePath of [
    "maplibre-gl/dist/maplibre-gl.mjs",
    "react-map-gl/dist/maplibre.js",
    "@vis.gl/react-maplibre/dist/index.js",
    "@vis.gl/react-maplibre/dist/components/map.js",
  ]) {
    expect(
      getChunkName(
        `/repo/node_modules/.pnpm/package/node_modules/${packagePath}`,
        chunkingContext,
      ),
    ).toBe("vendor/map");
  }
  // The deep-photo entry can win the initial parallel import race. Keeping the
  // eager CommonJS wrapper with usehooks-ts prevents a vendor -> route back edge.
  for (const packagePath of [
    "usehooks-ts/dist/index.js",
    "lodash.debounce/index.js",
  ]) {
    expect(
      getChunkName(
        `/repo/node_modules/.pnpm/package/node_modules/${packagePath}`,
        chunkingContext,
      ),
    ).toBe("vendor/observers");
  }
  expect(group?.includeDependenciesRecursively).toBe(false);
  expect(
    getChunkName("/repo/apps/web/src/lib/map/maplibre.ts", chunkingContext),
  ).toBeNull();
});

it("registers search and late-rendered static dependencies before generateBundle", async () => {
  const plugin = createDependencyChunksPlugin(dependencyChunkGroups);
  const { renderChunk } = plugin;
  if (typeof renderChunk !== "function")
    throw new Error("Missing renderChunk hook");
  const render = async (
    fileName: string,
    imports: string[],
    facadeModuleId: string | null = null,
    isEntry = false,
  ) => {
    await renderChunk.call(
      {} as never,
      "",
      { fileName, imports, facadeModuleId, isEntry } as never,
      {} as never,
      {} as never,
    );
  };
  setCriticalPrecacheFiles([]);
  try {
    await render("assets/entry.js", [], null, true);
    await render(
      "assets/gallery.js",
      [],
      "/repo/apps/web/src/pages/(main)/layout.tsx",
    );
    await render(
      "assets/search.js",
      ["vendor/observers-a.js"],
      "C:\\repo\\apps\\web\\src\\modules\\gallery\\command-palette\\CommandPalette.tsx",
    );
    // Workbox may consume the graph before generateBundle. Search is already
    // a bootstrap requirement; its later-rendered dependency closure must join it.
    await render("vendor/observers-a.js", ["vendor/runtime-a.js"]);
    await render("vendor/runtime-a.js", []);
    await render(
      "assets/explore.js",
      ["vendor/map-a.js"],
      "/repo/apps/web/src/pages/explore/index.tsx",
    );
    expect(new Set(getCriticalPrecacheFiles())).toEqual(
      new Set([
        "assets/entry.js",
        "assets/gallery.js",
        "assets/search.js",
        "vendor/observers-a.js",
        "vendor/runtime-a.js",
      ]),
    );
  } finally {
    setCriticalPrecacheFiles([]);
  }
});
