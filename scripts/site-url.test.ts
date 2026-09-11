import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveSiteUrl } from "./site-url";

const fallback = "http://localhost:1924";

describe("public site URL", () => {
  it("prefers the explicit URL over Vercel metadata", () => {
    expect(
      resolveSiteUrl(
        {
          SITE_URL: " https://photos.example.com/ ",
          VERCEL: "1",
          VERCEL_PROJECT_PRODUCTION_URL: "invalid/hostname",
        },
        fallback,
      ),
    ).toBe("https://photos.example.com/");
  });

  it("uses the stable production hostname even for preview deployments", () => {
    const environment = {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "My-Gallery.vercel.app",
      VERCEL_URL: "my-gallery-random-commit.vercel.app",
    };
    expect(resolveSiteUrl(environment, fallback)).toBe(
      "https://my-gallery.vercel.app",
    );
  });

  it("supports a production custom domain and punycode hostname", () => {
    for (const hostname of ["photos.example.com", "xn--bcher-kva.example"]) {
      expect(
        resolveSiteUrl(
          { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: hostname },
          fallback,
        ),
      ).toBe(`https://${hostname}`);
    }
  });

  it("preserves local defaults and ignores an untrusted non-Vercel hostname", () => {
    expect(resolveSiteUrl({}, fallback)).toBe(fallback);
    expect(
      resolveSiteUrl(
        { VERCEL_PROJECT_PRODUCTION_URL: "invalid/hostname" },
        fallback,
      ),
    ).toBe(fallback);
    expect(
      resolveSiteUrl({ SITE_URL: "http://localhost:4173" }, fallback),
    ).toBe("http://localhost:4173");
  });

  it("never falls back to an ephemeral deployment URL", () => {
    const environment = { VERCEL: "1", VERCEL_URL: "random.vercel.app" };
    expect(resolveSiteUrl(environment, fallback)).toBe(fallback);
    expect(
      resolveSiteUrl(
        { SITE_URL: " ", VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "" },
        fallback,
      ),
    ).toBe(fallback);
  });

  it.each([
    "https://gallery.vercel.app",
    "gallery.vercel.app/path",
    "gallery.vercel.app/",
    "gallery.vercel.app:443",
    "user:secret@gallery.vercel.app",
    "gallery.vercel.app?token=secret",
    "gallery.vercel.app#fragment",
    "gallery.vercel.app\\evil",
    "gallery.vercel.app\n",
    " gallery.vercel.app",
    "gallery%2evercel.app",
    "gallery..vercel.app",
    "-gallery.vercel.app",
    "gallery-.vercel.app",
    "gallery_name.vercel.app",
    `${"a".repeat(64)}.vercel.app`,
    `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}`,
    "localhost",
    "127.0.0.1",
    "[::1]",
  ])(
    "rejects malformed production hostname %j without exposing it",
    (hostname) => {
      expect(() =>
        resolveSiteUrl(
          { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: hostname },
          fallback,
        ),
      ).toThrow(
        "VERCEL_PROJECT_PRODUCTION_URL must be a hostname without a scheme, port, path, credentials, query, or fragment; set SITE_URL to override it",
      );
    },
  );

  it.each([
    "not-a-url",
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com?token=secret",
    "https://example.com#fragment",
  ])(
    "rejects an invalid explicit URL instead of silently using a fallback",
    (url) => {
      expect(() => resolveSiteUrl({ SITE_URL: url }, fallback)).toThrow(
        /SITE_URL must be/,
      );
    },
  );
});

describe("build-time site URL configuration", () => {
  const rootDir = fileURLToPath(new URL("../", import.meta.url));

  it.each([
    {
      environment: {
        VERCEL: "1",
        VERCEL_ENV: "preview",
        SITE_URL: "",
        VERCEL_PROJECT_PRODUCTION_URL: "gallery.vercel.app",
        VERCEL_URL: "temporary-preview.vercel.app",
      },
      expected: "https://gallery.vercel.app",
    },
    {
      environment: {
        VERCEL: "1",
        SITE_URL: "https://photos.example.com",
        VERCEL_PROJECT_PRODUCTION_URL: "gallery.vercel.app",
      },
      expected: "https://photos.example.com",
    },
    { environment: {}, expected: "https://afilmory.your.domain/" },
  ])(
    "loads the real environment and resolves $expected",
    ({ environment, expected }) => {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          "console.log((await import('./site.config.build.ts')).siteConfig.url)",
        ],
        {
          cwd: rootDir,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            DOTENV_CONFIG_PATH: path.join(
              rootDir,
              "apps/web/e2e/fixtures/environment.env",
            ),
            DOTENV_CONFIG_QUIET: "true",
            ...environment,
          },
        },
      );
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout.trim()).toBe(expected);
    },
  );
});
