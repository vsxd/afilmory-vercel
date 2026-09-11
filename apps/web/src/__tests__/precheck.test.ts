import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createManifest } from "@afilmory/schema";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixtureManifest from "../../e2e/fixtures/photos-manifest.json";
import { precheck } from "../../scripts/precheck";

describe("precheck", () => {
  let tmpDir: string;
  let runBuilder: Mock<(env: NodeJS.ProcessEnv) => Promise<void>>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afilmory-precheck-"));
    runBuilder = vi
      .fn<(env: NodeJS.ProcessEnv) => Promise<void>>()
      .mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await precheck({
      workdir: tmpDir,
      env: { SKIP_MANIFEST_BUILD: "true" },
      runBuilder,
    });

    expect(runBuilder).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("SKIP_MANIFEST_BUILD=true"),
    );
  });

  it("uses an existing manifest when the S3 bucket is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeManifest();

    await precheck({
      workdir: tmpDir,
      env: {},
      runBuilder,
    });

    expect(runBuilder).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing S3 env vars"),
    );
  });

  it("runs the local provider without any S3 configuration", async () => {
    await precheck({
      workdir: tmpDir,
      env: { PHOTO_STORAGE_PROVIDER: "local" },
      runBuilder,
    });

    expect(runBuilder).toHaveBeenCalledOnce();
  });

  it("uses the AWS default credential chain when both explicit keys are omitted", async () => {
    await precheck({
      workdir: tmpDir,
      env: { S3_BUCKET_NAME: "bucket" },
      runBuilder,
    });

    expect(runBuilder).toHaveBeenCalledOnce();
  });

  it.each([{ S3_ACCESS_KEY_ID: "key" }, { S3_SECRET_ACCESS_KEY: "secret" }])(
    "rejects an incomplete explicit S3 credential pair",
    async (partial) => {
      await expect(
        precheck({
          workdir: tmpDir,
          env: { S3_BUCKET_NAME: "bucket", ...partial },
          runBuilder,
        }),
      ).rejects.toThrow("must either both be provided or both be omitted");

      expect(runBuilder).not.toHaveBeenCalled();
    },
  );

  it("fails when the S3 bucket and manifest are both missing", async () => {
    // 错误信息需列出可选的 S3 变量，作为部署平台上的配置指引
    // （原先由 build-static.sh 输出，收敛进 precheck 后由这里负责）。
    await expect(
      precheck({
        workdir: tmpDir,
        env: {},
        runBuilder,
      }),
    ).rejects.toThrow(
      /Missing required S3 environment variables[\s\S]*Optional: S3_REGION/,
    );
  });

  it("fails when the S3 bucket is missing and the manifest is legacy", async () => {
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Builder failed, continuing with the valid manifest",
      ),
    );
  });

  it("fails when a failed builder leaves no valid manifest", async () => {
    runBuilder.mockImplementationOnce(async () => {
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

  it("refuses to reuse a stale manifest in production when the S3 bucket is missing", async () => {
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

  it("refuses a stale manifest in explicit fresh-build mode when the S3 bucket is missing", async () => {
    await writeManifest();

    await expect(
      precheck({
        workdir: tmpDir,
        env: { REQUIRE_FRESH_BUILD: "true" },
        runBuilder,
      }),
    ).rejects.toThrow("fresh build is required");

    expect(runBuilder).not.toHaveBeenCalled();
  });

  it("fails the build in production when the builder errors instead of falling back", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("refusing to publish"),
    );
  });

  it("keeps a valid manifest committed before a late builder failure", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeManifest();
    const manifestPath = path.join(tmpDir, "generated/photos-manifest.json");
    const committedManifest = JSON.stringify(
      createManifest({ generatedAt: "2099-01-01T00:00:00Z" }),
    );
    runBuilder.mockImplementationOnce(async () => {
      await fs.writeFile(manifestPath, committedManifest);
      throw new Error("afterCleanup hook failed");
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

    expect(await fs.readFile(manifestPath, "utf-8")).toBe(committedManifest);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Builder failed, continuing with the valid manifest",
      ),
    );
  });

  it("fails instead of rolling back one file when a failed builder leaves an invalid manifest", async () => {
    await writeManifest();
    const manifestPath = path.join(tmpDir, "generated/photos-manifest.json");
    runBuilder.mockImplementationOnce(async () => {
      await fs.writeFile(manifestPath, "{broken");
      throw new Error("builder failed");
    });

    await expect(
      precheck({
        workdir: tmpDir,
        env: { S3_BUCKET_NAME: "bucket" },
        runBuilder,
      }),
    ).rejects.toThrow("builder failed");
    await expect(fs.readFile(manifestPath, "utf-8")).resolves.toBe("{broken");
  });

  it("warns without failing production when the newly built original is forbidden", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 403 }));
    runBuilder.mockImplementationOnce(async () => {
      expect(fetcher).not.toHaveBeenCalled();
      await fs.mkdir(path.join(tmpDir, "generated"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "generated/photos-manifest.json"),
        JSON.stringify(fixtureManifest),
      );
    });
    await precheck({
      workdir: tmpDir,
      env: {
        S3_BUCKET_NAME: "bucket",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "gallery.vercel.app",
      },
      runBuilder,
      fetch: fetcher,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      Origin: "https://gallery.vercel.app",
      Range: "bytes=0-1023",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Public original check (forbidden)"),
    );
  });

  it.each([
    { PHOTO_STORAGE_PROVIDER: "local", REQUIRE_FRESH_BUILD: "true" },
    { S3_BUCKET_NAME: "bucket" },
    { S3_BUCKET_NAME: "bucket", SKIP_MANIFEST_BUILD: "true", VERCEL: "1" },
  ])(
    "does not probe local, development, or explicitly skipped builds",
    async (env) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const fetcher = vi.fn<typeof fetch>();
      await writeManifest();
      await precheck({ workdir: tmpDir, env, runBuilder, fetch: fetcher });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("does not probe a stale manifest after a Preview builder failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeManifest();
    runBuilder.mockRejectedValueOnce(new Error("offline"));
    const fetcher = vi.fn<typeof fetch>();
    await precheck({
      workdir: tmpDir,
      env: { S3_BUCKET_NAME: "bucket", VERCEL: "1", VERCEL_ENV: "preview" },
      runBuilder,
      fetch: fetcher,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips the original sample for an empty gallery", async () => {
    await writeManifest();
    const fetcher = vi.fn<typeof fetch>();
    await precheck({
      workdir: tmpDir,
      env: { S3_BUCKET_NAME: "bucket", REQUIRE_FRESH_BUILD: "true" },
      runBuilder,
      fetch: fetcher,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
