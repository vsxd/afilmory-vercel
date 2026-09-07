import { describe, expect, it } from "vitest";

import { findStaticVendorChunkCycle } from "./deps";

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
});
