import { beforeEach, describe, expect, it } from "vitest";

import {
  filterCriticalPrecacheManifest,
  setCriticalPrecacheFiles,
} from "./precache-policy";

describe("critical PWA precache policy", () => {
  beforeEach(() => setCriticalPrecacheFiles([]));

  it("keeps only the real app shell and gallery index", () => {
    setCriticalPrecacheFiles([
      "assets/index.abc.js",
      "assets/layout-def.js",
      "assets/index.css",
    ]);
    const result = filterCriticalPrecacheManifest([
      { url: "index.html", revision: null, size: 10 },
      { url: "assets/index.abc.js", revision: null, size: 10 },
      { url: "assets/layout-def.js", revision: null, size: 10 },
      { url: "assets/index.css", revision: null, size: 10 },
      { url: "assets/gallery-index.1234abcd.json", revision: null, size: 10 },
      { url: "assets/webgl-preview.deadbeef.js", revision: null, size: 10 },
      { url: "vendor/heic-deadbeef.js", revision: null, size: 10 },
    ]);

    expect(result.manifest.map((entry) => entry.url)).toEqual([
      "index.html",
      "assets/index.abc.js",
      "assets/layout-def.js",
      "assets/index.css",
      "assets/gallery-index.1234abcd.json",
    ]);
  });

  it("fails closed when the build graph was not registered", () => {
    expect(() =>
      filterCriticalPrecacheManifest([
        { url: "index.html", revision: null, size: 1 },
      ]),
    ).toThrow("Critical precache graph was not registered");
  });

  it("enforces a raw transfer budget", () => {
    setCriticalPrecacheFiles(["assets/index.js"]);
    expect(() =>
      filterCriticalPrecacheManifest(
        [{ url: "assets/index.js", revision: null, size: 101 }],
        100,
      ),
    ).toThrow("PWA critical precache");
  });

  it("allows the Rolldown app shell within the default raw byte budget", () => {
    setCriticalPrecacheFiles(["assets/index.js"]);

    expect(
      filterCriticalPrecacheManifest([
        { url: "assets/index.js", revision: null, size: 1_750 * 1024 },
      ]).manifest,
    ).toHaveLength(1);
    expect(() =>
      filterCriticalPrecacheManifest([
        { url: "assets/index.js", revision: null, size: 1_801 * 1024 },
      ]),
    ).toThrow("PWA critical precache");
  });
});
