import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createE2EWebEnvironment,
  VITE_CONFIG_LOADER_ARGS,
} from "./e2e-web-environment.ts";

describe("createE2EWebEnvironment", () => {
  it("keeps direct Vite entrypoints on the TypeScript-aware runner loader", () => {
    expect(VITE_CONFIG_LOADER_ARGS).toEqual(["--configLoader", "runner"]);
  });

  it("keeps only platform and connectivity variables from the parent", () => {
    const environment = createE2EWebEnvironment({
      embedManifest: true,
      source: {
        ANALYZE: "true",
        FORCE_COLOR: "1",
        HTTPS_PROXY: "https://proxy.fixture.test",
        NO_COLOR: "1",
        PATH: "/fixture/bin",
        S3_SECRET_ACCESS_KEY: "must-not-leak",
        SITE_NAME: "Developer gallery",
        VERCEL_ENV: "production",
      },
    });

    expect(environment).toMatchObject({
      AFILMORY_EMBED_MANIFEST: "true",
      HTTPS_PROXY: "https://proxy.fixture.test",
      PATH: "/fixture/bin",
      SITE_NAME: "Afilmory E2E",
      TZ: "UTC",
    });
    expect(environment).not.toHaveProperty("ANALYZE");
    expect(environment).not.toHaveProperty("NO_COLOR");
    expect(environment).not.toHaveProperty("S3_SECRET_ACCESS_KEY");
    expect(environment).not.toHaveProperty("VERCEL_ENV");
  });

  it("points Vite at committed, isolated fixtures", () => {
    const environment = createE2EWebEnvironment({
      embedManifest: false,
      source: {},
    });

    expect(environment.AFILMORY_EMBED_MANIFEST).toBe("false");
    expect(environment.AFILMORY_MANIFEST_PATH).toBe(
      path.resolve("apps/web/e2e/fixtures/photos-manifest.json"),
    );
    expect(environment.AFILMORY_PUBLIC_ASSET_DIR).toBe(
      path.resolve("apps/web/e2e/fixtures"),
    );
    expect(environment.DOTENV_CONFIG_PATH).toBe(
      path.resolve("apps/web/e2e/fixtures/environment.env"),
    );
  });
});
