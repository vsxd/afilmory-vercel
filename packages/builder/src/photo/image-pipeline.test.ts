import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDefaultBuilderConfig } from "../config/defaults.js";
import type { EmitPluginEventFn } from "../core/contracts/execution-context.js";
import type { PhotoProcessingContext } from "../core/contracts/photo-processing.js";
import type { BuilderServices } from "../core/contracts/services.js";
import { logger } from "../logger/index.js";
import type { ThumbnailPluginData } from "../plugins/thumbnail-storage/shared.js";
import { THUMBNAIL_PLUGIN_DATA_KEY } from "../plugins/thumbnail-storage/shared.js";
import { StorageManager } from "../storage/index.js";
import type { BuilderConfig } from "../types/config.js";
import type { BuilderOptions } from "../types/options.js";
import type { PhotoManifestItem } from "../types/photo.js";
import {
  createPhotoExecutionContext,
  runWithPhotoExecutionContext,
} from "./execution-context.js";
import { processPhotoWithPipeline } from "./image-pipeline.js";

/**
 * 缩略图 buffer 的生命周期契约（见 THUMBNAIL_PLUGIN_DATA_KEY 的文档）：
 * afterPhotoProcess 钩子（thumbnail-storage 在里面上传）必须拿到真实的 JPEG
 * bytes；钩子返回后管道必须立刻把 buffer 置 null——否则主进程会为整个构建期
 * 攒下全部缩略图，cluster 模式还要把每个 buffer 走一遍 IPC v8 序列化。
 * 走真实链路（sharp 解码/缩略图落盘/本地存储），只有 exif 服务是替身。
 */

const BUILD_OPTIONS: BuilderOptions = {
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
};

interface AfterPhotoProcessSnapshot {
  resultType: string;
  hasThumbnailEntry: boolean;
  bufferIsBuffer: boolean;
  bufferByteLength: number;
}

let tmpDir: string;
let sourceDir: string;
let config: BuilderConfig;
let jpegBuffer: Buffer;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "afilmory-image-pipeline-"));
  sourceDir = path.join(tmpDir, "source");
  await mkdir(sourceDir, { recursive: true });

  jpegBuffer = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
  await writeFile(path.join(sourceDir, "sunset.jpg"), jpegBuffer);
  await writeFile(path.join(sourceDir, "broken.jpg"), jpegBuffer);

  config = createDefaultBuilderConfig();
  config.user = {
    storage: { provider: "local", basePath: sourceDir, baseUrl: "/photos" },
  };
  config.output = {
    manifestPath: path.join(tmpDir, "out", "photos-manifest.json"),
    thumbnailsDir: path.join(tmpDir, "out", "thumbnails"),
    originalsDir: path.join(tmpDir, "out", "originals"),
  };
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function createHarness() {
  const snapshots: AfterPhotoProcessSnapshot[] = [];
  const failures: Array<{ code: string; stage: string; message: string }> = [];

  // 在钩子执行的瞬间拍快照：buffer 的置 null 发生在钩子之后，事后再看
  // context.pluginData 已经分不清"钩子当时拿到了什么"。
  const emitPluginEvent: EmitPluginEventFn = async (
    _runState,
    event,
    payload,
  ) => {
    if (event === "photoProcessError") {
      failures.push(
        (payload as { failure: (typeof failures)[number] }).failure,
      );
      return;
    }
    if (event !== "afterPhotoProcess") return;
    const { context, result } = payload as {
      context: PhotoProcessingContext;
      result: { type: string };
    };
    const data = context.pluginData[THUMBNAIL_PLUGIN_DATA_KEY] as
      ThumbnailPluginData | undefined;
    snapshots.push({
      resultType: result.type,
      hasThumbnailEntry: data !== undefined,
      bufferIsBuffer: Buffer.isBuffer(data?.buffer),
      bufferByteLength: data?.buffer?.length ?? 0,
    });
  };

  const storageConfig = config.user!.storage!;
  const storageManager = new StorageManager(storageConfig);
  const exifRead = vi.fn(async () => ({
    SourceFile: "fixture.jpg",
    Make: "Leica",
    GPSAltitude: 12,
    GPSCoordinates: "31.230416 121.473701",
    GPSLatitude: 31.230_416,
    GPSLatitudeRef: "N",
    GPSLongitude: 121.473_701,
    GPSLongitudeRef: "E",
  }));

  const services: BuilderServices = {
    config,
    exif: {
      close: vi.fn(),
      read: exifRead,
    },
    logger,
    photoId: {
      getIdForKey: (key) => path.basename(key, path.extname(key)),
    },
    storage: {
      createManager: () => storageManager,
      getConfig: () => storageConfig,
      getManager: () => storageManager,
    },
  };

  return {
    executionContext: createPhotoExecutionContext(services, emitPluginEvent, 0),
    exifRead,
    failures,
    snapshots,
    storageManager,
  };
}

function createProcessingContext(
  photoKey: string,
  options: {
    existingItem?: PhotoManifestItem;
    locationMode?: "strip" | "coarse" | "exact";
  } = {},
): PhotoProcessingContext {
  return {
    photoKey,
    obj: {
      key: photoKey,
      size: jpegBuffer.length,
      lastModified: new Date("2026-01-01T00:00:00.000Z"),
      etag: `etag-${photoKey}`,
    },
    existingItem: options.existingItem,
    livePhotoMap: new Map(),
    options: {
      ...BUILD_OPTIONS,
      ...(options.locationMode ? { locationMode: options.locationMode } : {}),
    },
    pluginData: {},
  };
}

async function runPipeline(
  harness: ReturnType<typeof createHarness>,
  context: PhotoProcessingContext,
) {
  return await runWithPhotoExecutionContext(harness.executionContext, () =>
    processPhotoWithPipeline(context, {
      runState: new Map(),
      builderOptions: {
        ...BUILD_OPTIONS,
        ...(context.options.locationMode
          ? { locationMode: context.options.locationMode }
          : {}),
      },
    }),
  );
}

describe("processPhotoWithPipeline thumbnail buffer lifetime", () => {
  it("hands the real buffer to afterPhotoProcess, then releases it before returning", async () => {
    const harness = createHarness();
    const context = createProcessingContext("sunset.jpg");

    const result = await runPipeline(harness, context);

    expect(result.type).toBe("new");
    expect(result.item?.thumbnailUrl).toMatch(
      /^\/thumbnails\/sunset\.[\da-f]{64}\.[\da-f]{12}\.jpg$/,
    );

    // afterPhotoProcess（thumbnail-storage 的上传钩子）必须看到真实 JPEG bytes。
    expect(harness.snapshots).toHaveLength(1);
    expect(harness.failures).toHaveLength(0);
    expect(harness.snapshots[0]).toMatchObject({
      resultType: "new",
      hasThumbnailEntry: true,
      bufferIsBuffer: true,
    });
    expect(harness.snapshots[0].bufferByteLength).toBeGreaterThan(0);

    // 管道返回后，条目只剩无 buffer 的投影：JPEG 立即可回收，也不再进 IPC。
    const entry = result.pluginData[
      THUMBNAIL_PLUGIN_DATA_KEY
    ] as ThumbnailPluginData;
    expect(entry).toMatchObject({ photoId: "sunset", buffer: null });
    expect(entry.localUrl).toBe(result.item?.thumbnailUrl);
    expect(entry.fileName).toBe(result.item?.thumbnailUrl.split("/").at(-1));
  });

  it("releases the buffer even when the pipeline fails after thumbnail generation", async () => {
    const harness = createHarness();
    // originalUrl 的生成（第 10 步）发生在缩略图（第 3 步）之后：在这里注入
    // 失败，得到一个 pluginData 里已经带着 buffer 的 "failed" 结果。
    vi.spyOn(harness.storageManager, "generatePublicUrl").mockRejectedValue(
      new Error("public URL generation exploded"),
    );
    const context = createProcessingContext("broken.jpg");

    const result = await runPipeline(harness, context);

    expect(result.type).toBe("failed");
    expect(result.item).toBeNull();
    expect(result.failure).toMatchObject({
      code: "pipeline_error",
      stage: "manifest-item",
    });
    expect(harness.failures).toEqual([result.failure]);

    // failed 结果同样带着真实 buffer 进钩子（插件自己按 result.item 判空跳过上传）……
    expect(harness.snapshots).toHaveLength(1);
    expect(harness.snapshots[0]).toMatchObject({
      resultType: "failed",
      hasThumbnailEntry: true,
      bufferIsBuffer: true,
    });

    // ……而钩子返回后 buffer 一样被释放。
    const entry = result.pluginData[
      THUMBNAIL_PLUGIN_DATA_KEY
    ] as ThumbnailPluginData;
    expect(entry.buffer).toBeNull();
    expect(entry.photoId).toBe("broken");
  });

  it("re-extracts source EXIF and rebuilds location across privacy transitions", async () => {
    const harness = createHarness();

    const first = await runPipeline(
      harness,
      createProcessingContext("sunset.jpg", { locationMode: "exact" }),
    );
    expect(first.item?.exif).toMatchObject({
      GPSLatitude: 31.230_416,
      GPSLongitude: 121.473_701,
    });
    const exactItem = first.item!;
    exactItem.location = {
      latitude: 31.230_416,
      longitude: 121.473_701,
      city: "Shanghai",
    };

    const stripped = await runPipeline(
      harness,
      createProcessingContext("sunset.jpg", {
        existingItem: exactItem,
        locationMode: "strip",
      }),
    );
    expect(stripped.item?.exif).not.toHaveProperty("GPSLatitude");
    expect(stripped.item?.location).toBeNull();
    expect(stripped.item?.processing?.privacy).toBe(
      "location-privacy:v1:strip",
    );

    const coarse = await runPipeline(
      harness,
      createProcessingContext("sunset.jpg", {
        existingItem: stripped.item!,
        locationMode: "coarse",
      }),
    );
    expect(coarse.item?.exif).toMatchObject({
      GPSLatitude: 31.23,
      GPSLongitude: 121.474,
    });
    expect(coarse.item?.location).toMatchObject({
      latitude: 31.23,
      longitude: 121.474,
    });

    const restoredExact = await runPipeline(
      harness,
      createProcessingContext("sunset.jpg", {
        existingItem: coarse.item!,
        locationMode: "exact",
      }),
    );
    expect(restoredExact.item?.exif).toMatchObject({
      GPSLatitude: 31.230_416,
      GPSLongitude: 121.473_701,
    });
    expect(restoredExact.item?.location).toMatchObject({
      latitude: 31.230_416,
      longitude: 121.473_701,
    });
    expect(harness.exifRead).toHaveBeenCalledTimes(4);
  });
});
