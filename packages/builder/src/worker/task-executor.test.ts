import { describe, expect, it, vi } from "vitest";

import { createDefaultBuilderConfig } from "../config/defaults.js";
import type { BuilderServices } from "../core/contracts/services.js";
import { logger } from "../logger/index.js";
import type { PluginRunState } from "../plugins/manager.js";
import { StorageManager } from "../storage/index.js";
import type { StorageObject } from "../storage/interfaces.js";
import type { BuilderOptions } from "../types/options.js";
import type { PhotoManifestItem, ProcessPhotoResult } from "../types/photo.js";
import type { WorkerProcessPhoto, WorkerTaskRuntime } from "./task-executor.js";
import {
  createWorkerProcessorOptions,
  executeWorkerBatchTask,
  executeWorkerTask,
} from "./task-executor.js";

function createPhoto(id: string): PhotoManifestItem {
  return {
    id,
    title: id,
    description: "",
    dateTaken: "2026-06-06T00:00:00.000Z",
    tags: [],
    originalUrl: `https://example.com/${id}.jpg`,
    thumbnailUrl: `/thumbnails/${id}.jpg`,
    thumbHash: null,
    width: 100,
    height: 100,
    aspectRatio: 1,
    s3Key: `${id}.jpg`,
    lastModified: "2026-06-06T00:00:00.000Z",
    size: 100,
    exif: null,
    toneAnalysis: null,
    location: null,
  };
}

function createBuilderOptions(
  overrides: Partial<BuilderOptions> = {},
): BuilderOptions {
  return {
    isForceMode: false,
    isForceManifest: false,
    isForceThumbnails: false,
    ...overrides,
  };
}

function createBuilderServicesFixture(): BuilderServices {
  const config = createDefaultBuilderConfig();
  config.user = { storage: { provider: "s3", bucket: "photos" } };
  const storageConfig = config.user?.storage ?? {
    provider: "s3" as const,
    bucket: "photos",
  };

  return {
    config,
    exif: {
      close: vi.fn(),
      read: vi.fn(async () => ({ SourceFile: "fixture.jpg" })),
    },
    logger,
    output: {
      getSettings: () => config.output,
    },
    photoId: {
      getIdForKey: (key) => key.replace(/\.[^.]+$/, ""),
      hasCollision: () => false,
      setCollisionKeys: vi.fn(),
    },
    storage: {
      createManager: (nextConfig) => new StorageManager(nextConfig),
      getConfig: () => storageConfig,
      getManager: () => new StorageManager(storageConfig),
    },
  };
}

function createRuntime(
  overrides: Partial<WorkerTaskRuntime> = {},
): WorkerTaskRuntime {
  const builderOptions = createBuilderOptions({
    isForceManifest: true,
    isForceThumbnails: true,
  });
  const config = createDefaultBuilderConfig();
  const imageObjects: StorageObject[] = [
    { key: "a.jpg", size: 1 },
    { key: "b.jpg", size: 2 },
  ];
  const pluginRunState: PluginRunState = new Map();

  return {
    workerId: 7,
    imageObjects,
    existingManifestMap: new Map([["b.jpg", createPhoto("b")]]),
    livePhotoMap: new Map([["a.jpg", { key: "a.mov" }]]),
    builderOptions,
    outputSettings: config.output,
    services: createBuilderServicesFixture(),
    pluginRunState,
    emitPluginEvent: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("worker task executor", () => {
  it("narrows builder options to processor force flags", () => {
    const progressListener = { onComplete: vi.fn() };
    expect(
      createWorkerProcessorOptions(
        createBuilderOptions({
          concurrencyLimit: 4,
          isForceMode: true,
          progressListener,
        }),
      ),
    ).toEqual({
      isForceMode: true,
      isForceManifest: false,
      isForceThumbnails: false,
    });
  });

  it("executes a single task with explicit runtime dependencies", async () => {
    const runtime = createRuntime();
    const result: ProcessPhotoResult = {
      item: createPhoto("processed"),
      type: "processed",
    };
    const processPhoto = vi.fn<WorkerProcessPhoto>(async () => result);

    const response = await executeWorkerTask(
      { type: "task", taskId: "task-1", taskIndex: 1, workerId: 7 },
      runtime,
      processPhoto,
    );

    expect(response).toEqual({
      type: "result",
      taskId: "task-1",
      result,
    });
    expect(processPhoto).toHaveBeenCalledWith(
      runtime.imageObjects[1],
      1,
      runtime.workerId,
      runtime.imageObjects.length,
      runtime.existingManifestMap,
      runtime.livePhotoMap,
      {
        isForceMode: false,
        isForceManifest: true,
        isForceThumbnails: true,
      },
      runtime.services,
      runtime.emitPluginEvent,
      {
        runState: runtime.pluginRunState,
        builderOptions: runtime.builderOptions,
      },
    );
  });

  it("returns task errors without throwing from the executor", async () => {
    const runtime = createRuntime();
    const processPhoto = vi.fn<WorkerProcessPhoto>(async () => ({
      item: null,
      type: "failed",
    }));

    await expect(
      executeWorkerTask(
        { type: "task", taskId: "missing", taskIndex: 42, workerId: 7 },
        runtime,
        processPhoto,
      ),
    ).resolves.toEqual({
      type: "error",
      taskId: "missing",
      error: "Invalid taskIndex: 42",
    });
    expect(processPhoto).not.toHaveBeenCalled();
  });

  it("executes batch tasks through the same single-task executor path", async () => {
    const runtime = createRuntime();
    const processPhoto = vi.fn<WorkerProcessPhoto>(async (_object, index) => ({
      item: createPhoto(`photo-${index}`),
      type: "processed",
    }));

    const response = await executeWorkerBatchTask(
      {
        type: "batch-task",
        workerId: 7,
        tasks: [
          { taskId: "first", taskIndex: 0 },
          { taskId: "missing", taskIndex: 99 },
          { taskId: "second", taskIndex: 1 },
        ],
      },
      runtime,
      processPhoto,
    );

    expect(response.type).toBe("batch-result");
    expect(response.results.map((item) => item.taskId)).toEqual([
      "first",
      "missing",
      "second",
    ]);
    expect(response.results[1]).toEqual({
      type: "error",
      taskId: "missing",
      error: "Invalid taskIndex: 99",
    });
    expect(processPhoto).toHaveBeenCalledTimes(2);
  });
});
