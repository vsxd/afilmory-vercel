import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { deviceBuildConfig } from "./device-check-build";
import { summarizeFrameIntervals } from "./device-check-client";
import {
  createDeviceBuildEnvironment,
  createDeviceCheckServer,
  deviceReportSchema,
  resolveDeviceAsset,
} from "./device-check-server";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function setup() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "afilmory-device-test-"),
  );
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  const distDirectory = path.join(directory, "dist");
  const reportDirectory = path.join(directory, "reports");
  await fs.mkdir(distDirectory);
  await fs.mkdir(reportDirectory);
  await fs.writeFile(
    path.join(distDirectory, "index.html"),
    "<!doctype html><html><head><title>App</title></head><body>Application</body></html>",
  );
  await fs.writeFile(path.join(distDirectory, "photo.jpg"), "jpeg");
  await fs.writeFile(path.join(distDirectory, "video.mp4"), "0123456789");
  await fs.writeFile(path.join(directory, "private.txt"), "outside");
  await fs.symlink(
    path.join(directory, "private.txt"),
    path.join(distDirectory, "outside.txt"),
  );
  return { directory, distDirectory, reportDirectory };
}

const validReport = () => ({
  version: 1,
  startedAt: "2026-09-30T00:00:00.000Z",
  userAgent: "iPhone Safari",
  model: "iPhone",
  observation: "smooth",
  notes: "",
  reloads: 0,
  metrics: {
    durationMs: 1000,
    frames: summarizeFrameIntervals([16, 17, 51, 101]),
    sampleLimitReached: false,
    longTasks: { supported: false, count: 0, totalMs: 0, maxMs: 0 },
    contextLost: 0,
    contextRestored: 0,
    pageErrors: 0,
    unhandledRejections: 0,
    hiddenTransitions: 0,
    viewport: { width: 390, height: 700, dpr: 3 },
  },
});

describe("device performance metrics", () => {
  it("computes nearest-rank percentiles and strict long-frame thresholds", () => {
    expect(
      summarizeFrameIntervals([16.666, 50, 51, 101, Number.NaN, -1]),
    ).toEqual({
      count: 4,
      p50Ms: 50,
      p95Ms: 101,
      p99Ms: 101,
      maxMs: 101,
      over50Ms: 2,
      over100Ms: 1,
    });
    expect(summarizeFrameIntervals([])).toEqual({
      count: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      over50Ms: 0,
      over100Ms: 0,
    });
    expect(summarizeFrameIntervals([16.666]).p50Ms).toBe(16.67);
  });

  it("rejects extra data, invalid counts, oversized observations and inconsistent percentiles", () => {
    expect(deviceReportSchema.safeParse(validReport()).success).toBe(true);
    expect(
      deviceReportSchema.safeParse({
        ...validReport(),
        photoUrl: "not-collected",
      }).success,
    ).toBe(false);
    expect(
      deviceReportSchema.safeParse({ ...validReport(), notes: "x".repeat(501) })
        .success,
    ).toBe(false);
    expect(
      deviceReportSchema.safeParse({ ...validReport(), reloads: -1 }).success,
    ).toBe(false);
    const report = validReport();
    report.metrics.frames.p50Ms = 200;
    expect(deviceReportSchema.safeParse(report).success).toBe(false);
    expect(
      deviceReportSchema.safeParse({
        ...validReport(),
        metrics: null,
        reloads: 1,
      }).success,
    ).toBe(true);
  });

  it("accepts legacy reports and only fixed error counters matching the existing total", () => {
    const legacy = deviceReportSchema.parse(validReport());
    expect(legacy.metrics).not.toHaveProperty("errorCounts");
    const errorCounts = {
      runtime: 2,
      img: 1,
      script: 0,
      link: 0,
      video: 0,
      audio: 0,
      other: 0,
    };
    const report = {
      ...validReport(),
      metrics: { ...validReport().metrics, pageErrors: 3, errorCounts },
    };
    expect(deviceReportSchema.parse(report).metrics?.errorCounts).toEqual(
      errorCounts,
    );
    for (const invalidCounts of [
      { ...errorCounts, img: -1 },
      { ...errorCounts, img: 1.5 },
      { ...errorCounts, img: 2 },
      { ...errorCounts, photoUrl: "not-collected" },
    ]) {
      expect(
        deviceReportSchema.safeParse({
          ...report,
          metrics: { ...report.metrics, errorCounts: invalidCounts },
        }).success,
      ).toBe(false);
    }
  });
});

describe("isolated device build", () => {
  it("uses the normal production config with temporary output/env and no inherited secrets", () => {
    const environment = createDeviceBuildEnvironment(
      "/tmp/device",
      false,
      "/tmp/demo/manifest.json",
      {
        PATH: "/bin",
        S3_SECRET_ACCESS_KEY: "secret",
        REPO_TOKEN: "secret",
        VITE_SECRET: "secret",
      },
    );
    expect(environment.AFILMORY_EMBED_MANIFEST).toBe("false");
    expect(environment.AFILMORY_MANIFEST_PATH).toBe("/tmp/demo/manifest.json");
    expect(environment.PHOTO_STORAGE_PROVIDER).toBe("local");
    expect(environment.DOTENV_CONFIG_PATH).toBe("/tmp/device/environment.env");
    expect(environment.S3_SECRET_ACCESS_KEY).toBeUndefined();
    expect(environment.REPO_TOKEN).toBeUndefined();
    expect(environment.VITE_SECRET).toBeUndefined();
    const config = deviceBuildConfig("/tmp/device", false);
    expect(config.mode).toBe("production");
    expect(config.envDir).toBe("/tmp/device");
    expect(config.build.outDir).toBe("/tmp/device/dist");
    expect(config.publicDir).toBe(false);
    const real = createDeviceBuildEnvironment(
      "/tmp/device",
      true,
      "/repo/generated/photos-manifest.json",
      {},
    );
    expect(real.PHOTO_STORAGE_PROVIDER).toBe("s3");
    expect(real.AFILMORY_MANIFEST_PATH).toBe(
      "/repo/generated/photos-manifest.json",
    );
    expect(deviceBuildConfig("/tmp/device", true).publicDir).toContain(
      "apps/web/public",
    );
  });
});

describe("device HTTP server", () => {
  it("confines assets and SPA fallback to dist, including encoded traversal and symlinks", async () => {
    const { distDirectory } = await setup();
    expect(await resolveDeviceAsset(distDirectory, "/photo.jpg", false)).toBe(
      await fs.realpath(path.join(distDirectory, "photo.jpg")),
    );
    expect(await resolveDeviceAsset(distDirectory, "/explore", true)).toBe(
      await fs.realpath(path.join(distDirectory, "index.html")),
    );
    for (const url of [
      "/../private.txt",
      "/%2e%2e/private.txt",
      "/%2e%2e%2fprivate.txt",
      "/%5c..%5cprivate.txt",
      "/outside.txt",
      "/.env",
      "/%00",
      "/%ZZ",
      "/missing.jpg",
      "/assets/missing",
    ]) {
      expect(await resolveDeviceAsset(distDirectory, url, true)).toBeNull();
    }
  });

  it("serves instrumented HTML/media ranges and saves only authorized, bounded reports", async () => {
    const options = await setup();
    const onReport = vi.fn();
    const token = "test-random-session-token";
    const server = createDeviceCheckServer({
      ...options,
      token,
      clientScript: "export const test = true;",
      realLibrary: false,
      onReport,
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No HTTP address");
    const base = `http://127.0.0.1:${address.port}`;
    expect((await fetch(base)).status).toBe(403);
    const entry = await fetch(`${base}/__device-check/?token=${token}`);
    expect(entry.status).toBe(200);
    expect(await entry.text()).toContain("iframe");
    const cookie = entry.headers.get("set-cookie")!.split(";", 1)[0];
    const headers = { cookie };
    const app = await fetch(`${base}/explore`, {
      headers: { ...headers, accept: "text/html" },
    });
    expect(await app.text()).toContain("installDeviceProbe");
    const photo = await fetch(`${base}/photo.jpg`, { method: "HEAD", headers });
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(photo.headers.get("content-length")).toBe("4");
    const video = await fetch(`${base}/video.mp4`, {
      headers: { ...headers, range: "bytes=2-5" },
    });
    expect(video.status).toBe(206);
    expect(video.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await video.text()).toBe("2345");
    expect(
      (
        await fetch(`${base}/video.mp4`, {
          headers: { ...headers, range: "bytes=99-100" },
        })
      ).status,
    ).toBe(416);
    const post = (body: string, key = token) =>
      fetch(`${base}/__device-check/report`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "x-device-token": key,
        },
        body,
      });
    expect((await post(JSON.stringify(validReport()), "wrong")).status).toBe(
      403,
    );
    expect((await post("x".repeat(21 * 1024))).status).toBe(413);
    expect(
      (await post(JSON.stringify({ ...validReport(), exif: {} }))).status,
    ).toBe(400);
    const report = {
      ...validReport(),
      metrics: {
        ...validReport().metrics,
        pageErrors: 1,
        errorCounts: {
          runtime: 0,
          img: 1,
          script: 0,
          link: 0,
          video: 0,
          audio: 0,
          other: 0,
        },
      },
    };
    expect((await post(JSON.stringify(report))).status).toBe(201);
    expect(onReport).toHaveBeenCalledTimes(1);
    const reports = await fs.readdir(options.reportDirectory);
    expect(reports).toHaveLength(1);
    const saved = JSON.parse(
      await fs.readFile(path.join(options.reportDirectory, reports[0]), "utf8"),
    );
    expect(saved.library).toBe("synthetic");
    expect(saved.metrics.frames.over50Ms).toBe(2);
    expect(saved.metrics.errorCounts).toEqual(report.metrics.errorCounts);
    expect(saved).not.toHaveProperty("photoUrl");
    expect(saved).not.toHaveProperty("token");
  });
});
