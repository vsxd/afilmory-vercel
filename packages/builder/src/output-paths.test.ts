import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createDefaultOutputSettings,
  getScopedBuilderOutputSettings,
  monorepoRoot,
  normalizeBuilderOutputSettings,
  runWithBuilderOutputSettings,
  webAppDir,
} from "./output-paths.js";
import type { BuilderOutputSettings } from "./types/config.js";

describe("module-level paths", () => {
  it("resolves monorepoRoot to an absolute path", () => {
    expect(path.isAbsolute(monorepoRoot)).toBe(true);
  });

  it("derives webAppDir as apps/web under the monorepo root", () => {
    expect(webAppDir).toBe(path.join(monorepoRoot, "apps", "web"));
  });
});

describe("createDefaultOutputSettings", () => {
  it("builds the conventional default layout under the monorepo root", () => {
    const settings = createDefaultOutputSettings();

    expect(settings.manifestPath).toBe(
      path.join(monorepoRoot, "generated", "photos-manifest.json"),
    );
    expect(settings.thumbnailsDir).toBe(
      path.join(webAppDir, "public", "thumbnails"),
    );
    expect(settings.originalsDir).toBe(
      path.join(webAppDir, "public", "originals"),
    );
    expect(settings.geocodingCachePath).toBe(
      path.join(monorepoRoot, "generated", "geocoding-cache.json"),
    );
  });

  it("places the geocoding cache next to the manifest", () => {
    const settings = createDefaultOutputSettings();
    expect(path.dirname(settings.geocodingCachePath as string)).toBe(
      path.dirname(settings.manifestPath),
    );
  });
});

describe("normalizeBuilderOutputSettings", () => {
  it("resolves relative paths against the current working directory", () => {
    const result = normalizeBuilderOutputSettings({
      manifestPath: "rel/manifest.json",
      thumbnailsDir: "rel/thumbs",
      originalsDir: "rel/originals",
    });

    expect(result.manifestPath).toBe(path.resolve("rel/manifest.json"));
    expect(result.thumbnailsDir).toBe(path.resolve("rel/thumbs"));
    expect(result.originalsDir).toBe(path.resolve("rel/originals"));
    expect(path.isAbsolute(result.geocodingCachePath as string)).toBe(true);
  });

  it("normalizes already-absolute paths (collapsing . and ..)", () => {
    const result = normalizeBuilderOutputSettings({
      manifestPath: "/data/out/../manifest.json",
      thumbnailsDir: "/data/./thumbs",
      originalsDir: "/data/originals",
    });

    expect(result.manifestPath).toBe("/data/manifest.json");
    expect(result.thumbnailsDir).toBe("/data/thumbs");
    expect(result.originalsDir).toBe("/data/originals");
  });

  it("defaults the geocoding cache to sit beside the resolved manifest", () => {
    const result = normalizeBuilderOutputSettings({
      manifestPath: "/data/generated/manifest.json",
      thumbnailsDir: "/data/thumbs",
      originalsDir: "/data/originals",
    });

    expect(result.geocodingCachePath).toBe(
      "/data/generated/geocoding-cache.json",
    );
  });

  it("resolves an explicitly-provided geocoding cache path", () => {
    const result = normalizeBuilderOutputSettings({
      manifestPath: "/data/manifest.json",
      thumbnailsDir: "/data/thumbs",
      originalsDir: "/data/originals",
      geocodingCachePath: "/elsewhere/cache/../geo.json",
    });

    expect(result.geocodingCachePath).toBe("/elsewhere/geo.json");
  });
});

describe("runWithBuilderOutputSettings / getScopedBuilderOutputSettings", () => {
  const sample: BuilderOutputSettings = {
    manifestPath: "/data/generated/manifest.json",
    thumbnailsDir: "/data/thumbs",
    originalsDir: "/data/originals",
  };

  it("throws when accessed outside of a scope", () => {
    expect(() => getScopedBuilderOutputSettings()).toThrow(
      /Output settings are not available/,
    );
  });

  it("exposes the normalized settings inside a synchronous scope", () => {
    const observed = runWithBuilderOutputSettings(sample, () =>
      getScopedBuilderOutputSettings(),
    );

    expect(observed).toEqual(normalizeBuilderOutputSettings(sample));
    // The defaulted geocoding cache path is filled in by normalization.
    expect((observed as BuilderOutputSettings).geocodingCachePath).toBe(
      "/data/generated/geocoding-cache.json",
    );
  });

  it("returns the callback's value", () => {
    const value = runWithBuilderOutputSettings(sample, () => 42);
    expect(value).toBe(42);
  });

  it("propagates the scope through async callbacks and clears it afterward", async () => {
    const observed = await runWithBuilderOutputSettings(sample, async () => {
      await Promise.resolve();
      return getScopedBuilderOutputSettings();
    });

    expect(observed).toEqual(normalizeBuilderOutputSettings(sample));
    // Scope is gone once the async run settles.
    expect(() => getScopedBuilderOutputSettings()).toThrow(
      /Output settings are not available/,
    );
  });

  it("supports nested scopes and restores the outer scope afterward", () => {
    const inner: BuilderOutputSettings = {
      manifestPath: "/inner/manifest.json",
      thumbnailsDir: "/inner/thumbs",
      originalsDir: "/inner/originals",
    };

    runWithBuilderOutputSettings(sample, () => {
      expect(getScopedBuilderOutputSettings().manifestPath).toBe(
        "/data/generated/manifest.json",
      );

      runWithBuilderOutputSettings(inner, () => {
        expect(getScopedBuilderOutputSettings().manifestPath).toBe(
          "/inner/manifest.json",
        );
      });

      // Outer scope restored after the inner run returns.
      expect(getScopedBuilderOutputSettings().manifestPath).toBe(
        "/data/generated/manifest.json",
      );
    });
  });
});
