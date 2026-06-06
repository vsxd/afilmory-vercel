import { describe, expect, it } from "vitest";

import {
  AFILMORY_MANIFEST_SCHEMA,
  createEmptyManifest,
  createManifest,
  parseManifest,
} from "../index";

describe("manifest v2 schema", () => {
  it("creates an empty v2 manifest", () => {
    const manifest = createEmptyManifest();

    expect(manifest.schema).toBe(AFILMORY_MANIFEST_SCHEMA);
    expect(manifest.version).toBe(2);
    expect(manifest.photos).toEqual([]);
    expect(manifest.indexes).toEqual({ cameras: [], lenses: [] });
  });

  it("parses a valid v2 manifest", () => {
    const input = createManifest({
      generatedAt: "2026-06-06T00:00:00.000Z",
      source: { provider: "s3", bucket: "photos", region: "us-east-1" },
      photos: [{ id: "photo" } as never],
      indexes: {
        cameras: [{ make: "Sony", model: "A7C", displayName: "Sony A7C" }],
      },
    });

    expect(parseManifest(input)).toEqual(input);
  });

  it("does not migrate legacy manifests", () => {
    expect(
      parseManifest({ version: "v10", data: [{ id: "legacy" }] }).photos,
    ).toEqual([]);
  });
});
