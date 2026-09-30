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

  it("enforces the raw shell budget even when gallery data uses runtime caching", () => {
    setCriticalPrecacheFiles(["assets/index.js"]);
    expect(() =>
      filterCriticalPrecacheManifest(
        [{ url: "assets/index.js", revision: null, size: 101 }],
        100,
      ),
    ).toThrow("PWA critical precache");
  });

  it("uses runtime caching for an oversized index without allocating a large fixture", () => {
    setCriticalPrecacheFiles(["assets/index.js"]);
    const shell = { url: "assets/index.js", revision: null, size: 80 };
    // Workbox provides byte counts; the policy needs no actual JSON payload.
    const index = {
      url: "assets/gallery-index.1234abcd.json",
      revision: null,
      size: 20 * 1024 * 1024,
    };

    const result = filterCriticalPrecacheManifest([shell, index], 100);

    expect(result.manifest).toEqual([shell]);
    expect(result.warnings).toEqual([
      expect.stringContaining(
        "cached when requested under service-worker control",
      ),
    ]);
    expect(() =>
      filterCriticalPrecacheManifest([{ ...shell, size: 101 }, index], 100),
    ).toThrow("PWA critical precache");
  });

  it("retains a small index exactly within the remaining shell budget", () => {
    setCriticalPrecacheFiles(["assets/index.js"]);
    const entries = [
      { url: "assets/index.js", revision: null, size: 80 },
      { url: "/assets/gallery-index.1234abcd.json", revision: null, size: 20 },
    ];

    expect(filterCriticalPrecacheManifest(entries, 100)).toEqual({
      manifest: entries,
      warnings: [],
    });
    expect(filterCriticalPrecacheManifest(entries, 99).manifest).toEqual([
      entries[0],
    ]);
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
