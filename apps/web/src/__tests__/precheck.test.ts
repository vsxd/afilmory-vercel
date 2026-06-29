import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createManifest } from "@afilmory/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { precheck } from "../../scripts/precheck";

describe("precheck", () => {
  let tmpDir: string;
  let runBuilder: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afilmory-precheck-"));
    runBuilder = vi.fn().mockResolvedValue(null);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { force: true, recursive: true });
  });

  async function writeManifest() {
    await fs.mkdir(path.join(tmpDir, "generated"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "generated/photos-manifest.json"),
      JSON.stringify(createManifest()),
    );
  }

  async function writeLegacyManifest() {
    await fs.mkdir(path.join(tmpDir, "generated"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "generated/photos-manifest.json"),
      '{"version":"v8","data":[]}',
    );
  }

  it("skips the builder when explicitly requested", async () => {
    await precheck({
      workdir: tmpDir,
      env: { SKIP_MANIFEST_BUILD: "true" },
      runBuilder,
    });

    expect(runBuilder).not.toHaveBeenCalled();
  });

  it("uses an existing manifest when S3 credentials are missing", async () => {
    await writeManifest();

    await precheck({
      workdir: tmpDir,
      env: {},
      runBuilder,
    });

    expect(runBuilder).not.toHaveBeenCalled();
  });

  it("fails when S3 credentials and manifest are both missing", async () => {
    await expect(
      precheck({
        workdir: tmpDir,
        env: {},
        runBuilder,
      }),
    ).rejects.toThrow("Missing required S3 environment variables");
  });

  it("fails when S3 credentials are missing and the manifest is legacy", async () => {
    await writeLegacyManifest();

    await expect(
      precheck({
        workdir: tmpDir,
        env: {},
        runBuilder,
      }),
    ).rejects.toThrow("not manifest v2");
  });

  it("falls back to an existing manifest when the builder cannot refresh remote state", async () => {
    await writeManifest();
    runBuilder.mockRejectedValueOnce(new Error("network unavailable"));

    await precheck({
      workdir: tmpDir,
      env: {
        S3_BUCKET_NAME: "bucket",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
      },
      runBuilder,
    });

    expect(runBuilder).toHaveBeenCalledOnce();
  });

  it("does not fall back to a manifest created during a failed builder run", async () => {
    runBuilder.mockImplementationOnce(async () => {
      await writeManifest();
      throw new Error("cluster serialization failed");
    });

    await expect(
      precheck({
        workdir: tmpDir,
        env: {
          S3_BUCKET_NAME: "bucket",
          S3_ACCESS_KEY_ID: "key",
          S3_SECRET_ACCESS_KEY: "secret",
        },
        runBuilder,
      }),
    ).rejects.toThrow("cluster serialization failed");

    expect(runBuilder).toHaveBeenCalledOnce();
  });

  it("refuses to reuse a stale manifest in production when S3 credentials are missing", async () => {
    await writeManifest();

    await expect(
      precheck({
        workdir: tmpDir,
        env: { VERCEL_ENV: "production" },
        runBuilder,
      }),
    ).rejects.toThrow("fresh build is required");

    expect(runBuilder).not.toHaveBeenCalled();
  });

  it("fails the build in production when the builder errors instead of falling back", async () => {
    await writeManifest();
    runBuilder.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(
      precheck({
        workdir: tmpDir,
        env: {
          S3_BUCKET_NAME: "bucket",
          S3_ACCESS_KEY_ID: "key",
          S3_SECRET_ACCESS_KEY: "secret",
          REQUIRE_FRESH_BUILD: "true",
        },
        runBuilder,
      }),
    ).rejects.toThrow("network unavailable");

    expect(runBuilder).toHaveBeenCalledOnce();
  });

  it("restores the pre-existing manifest when a failed builder clobbers it", async () => {
    await writeManifest();
    const manifestPath = path.join(tmpDir, "generated/photos-manifest.json");
    const originalManifest = await fs.readFile(manifestPath, "utf-8");
    runBuilder.mockImplementationOnce(async () => {
      await fs.writeFile(
        manifestPath,
        JSON.stringify(createManifest({ generatedAt: "2099-01-01T00:00:00Z" })),
      );
      throw new Error("network unavailable");
    });

    await precheck({
      workdir: tmpDir,
      env: {
        S3_BUCKET_NAME: "bucket",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
      },
      runBuilder,
    });

    expect(await fs.readFile(manifestPath, "utf-8")).toBe(originalManifest);
  });
});
