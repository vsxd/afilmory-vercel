import { CURRENT_MANIFEST_VERSION } from "@afilmory/schema";
import { describe, expect, it } from "vitest";

import { CURRENT_MANIFEST_VERSION as ReExportedVersion } from "./version.js";

describe("manifest/version re-export", () => {
  it("re-exports the canonical manifest version value from the schema package", () => {
    expect(ReExportedVersion).toBe(CURRENT_MANIFEST_VERSION);
  });

  it("exposes a positive integer version number", () => {
    expect(typeof ReExportedVersion).toBe("number");
    expect(Number.isInteger(ReExportedVersion)).toBe(true);
    expect(ReExportedVersion).toBeGreaterThan(0);
  });
});
