import { serialize } from "node:v8";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultBuilderConfig } from "../../config/defaults.js";
import type { BuilderServices } from "../../core/contracts/services.js";
import { logger } from "../../logger/index.js";
import geocodingPlugin from "../../plugins/geocoding.js";
import { StorageManager } from "../../storage/index.js";
import type { StorageObject } from "../../storage/interfaces.js";
import type { BuilderConfig } from "../../types/config.js";
import type { BuilderOptions } from "../../types/options.js";
import type {
  PhotoManifestItem,
  ProcessPhotoResult,
} from "../../types/photo.js";
import type { ClusterPoolOptions } from "../../worker/cluster-pool.js";
import type { WorkerPoolOptions } from "../../worker/pool.js";
import { PhotoTaskProcessor } from "./photo-task-processor.js";
import type {
  BuildPluginEventEmitter,
  BuildSessionStorageManager,
} from "./session.js";
import { BuildSession } from "./session.js";

type ProcessPhotoFn = typeof import("../../photo/processor.js").processPhoto;

const processorMocks = vi.hoisted(() => ({
  clusterPoolInstances: [] as Array<{
    execute: ReturnType<typeof vi.fn>;
    options: ClusterPoolOptions<ProcessPhotoResult>;
  }>,
  clusterResults: [] as ProcessPhotoResult[],
  processPhoto: vi.fn<ProcessPhotoFn>(),
  workerPoolInstances: [] as Array<{
    execute: ReturnType<typeof vi.fn>;
    options: WorkerPoolOptions<ProcessPhotoResult>;
  }>,
}));

vi.mock("../../photo/processor.js", () => ({
  processPhoto: processorMocks.processPhoto,
}));

vi.mock("../../worker/pool.js", () => ({
  WorkerPool: class MockWorkerPool {
    private readonly options: WorkerPoolOptions<ProcessPhotoResult>;

    constructor(options: WorkerPoolOptions<ProcessPhotoResult>) {
      this.options = options;
      processorMocks.workerPoolInstances.push({
        execute: this.execute,
        options,
      });
    }

    execute = vi.fn(async (taskFunction) => {
      const results: ProcessPhotoResult[] = [];
      for (let index = 0; index < this.options.totalTasks; index++) {
        const result = await taskFunction(index, index + 10);
        results.push(result);
        this.options.onTaskCompleted?.({
          taskIndex: index,
          completed: index + 1,
          total: this.options.totalTasks,
          result,
        });
      }
      return results;
    });
  },
}));

vi.mock("../../worker/cluster-pool.js", () => ({
  ClusterPool: class MockClusterPool {
    private readonly options: ClusterPoolOptions<ProcessPhotoResult>;

    constructor(options: ClusterPoolOptions<ProcessPhotoResult>) {
      this.options = options;
      processorMocks.clusterPoolInstances.push({
        execute: this.execute,
        options,
      });
    }

    execute = vi.fn(async () => {
      for (const [index, result] of processorMocks.clusterResults.entries()) {
        this.options.onTaskCompleted?.({
          taskIndex: index,
          completed: index + 1,
          total: this.options.totalTasks,
          result,
        });
      }
      return processorMocks.clusterResults;
    });
  },
}));

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

function createResult(type: ProcessPhotoResult["type"]): ProcessPhotoResult {
  return {
    item: type === "failed" ? null : createPhoto(type),
    type,
  };
}

function createStorageManagerFixture(): BuildSessionStorageManager {
  return {
    deleteFile: vi.fn(async () => {}),
    detectLivePhotos: vi.fn(async () => new Map()),
    generatePublicUrl: vi.fn(
      async (key: string) => `https://example.com/${key}`,
    ),
    getFile: vi.fn(async () => null),
    listAllFiles: vi.fn(async () => []),
    listImages: vi.fn(async () => []),
    uploadFile: vi.fn(async (key: string, data: Buffer) => ({
      key,
      size: data.length,
    })),
  };
}

function createBuilderServicesFixture(config: BuilderConfig): BuilderServices {
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
      hasCollision: (key) => key === "collision.jpg",
      setCollisionKeys: vi.fn(),
    },
    storage: {
      createManager: (nextConfig) => new StorageManager(nextConfig),
      getConfig: () => storageConfig,
      getManager: () => new StorageManager(storageConfig),
    },
  };
}

function createPluginEventEmitter(): BuildPluginEventEmitter {
  const emitPluginEvent: BuildPluginEventEmitter = async () => {};
  return vi.fn(emitPluginEvent);
}

function getFirstProcessPhotoCall(): Parameters<ProcessPhotoFn> {
  const call = processorMocks.processPhoto.mock.calls[0];
  if (!call) {
    throw new Error("Expected processPhoto to be called.");
  }
  return call;
}

function createSession(options: Partial<BuilderOptions> = {}): BuildSession {
  const config = createDefaultBuilderConfig();
  config.user = {
    storage: { provider: "s3", bucket: "photos" },
  };
  config.system.processing.defaultConcurrency = 2;
  config.system.observability.performance.worker.useClusterMode = false;
  config.system.observability.performance.worker.workerConcurrency = 3;
  const storageManager = createStorageManagerFixture();
  const services = createBuilderServicesFixture(config);

  return new BuildSession({
    config,
    emitPluginEvent: createPluginEventEmitter(),
    getConfig: () => config,
    getPhotoIdCollisionKeys: () => new Set(["collision.jpg"]),
    getManifestSource: () => ({ provider: "s3", bucket: "photos" }),
    getPhotoIdForKey: (key) => key.replace(/\.[^.]+$/, ""),
    options: {
      isForceMode: false,
      isForceManifest: false,
      isForceThumbnails: false,
      ...options,
    },
    runState: new Map(),
    services,
    setPhotoIdCollisionKeys: vi.fn(),
    storageManager,
  });
}

describe("PhotoTaskProcessor", () => {
  beforeEach(() => {
    processorMocks.clusterPoolInstances = [];
    processorMocks.clusterResults = [];
    processorMocks.processPhoto.mockReset();
    processorMocks.workerPoolInstances = [];
  });

  it("processes worker-mode tasks with scoped services and plugin event bridge", async () => {
    const progressListener = {
      onComplete: vi.fn(),
      onProgress: vi.fn(),
      onStart: vi.fn(),
    };
    const session = createSession({
      isForceManifest: true,
      isForceThumbnails: true,
      progressListener,
    });
    const tasks: StorageObject[] = [
      { key: "a.jpg", size: 1 },
      { key: "b.jpg", size: 2 },
      { key: "c.jpg", size: 3 },
      { key: "d.jpg", size: 4 },
    ];
    const existingManifestMap = new Map<string, PhotoManifestItem>([
      ["a.jpg", createPhoto("existing")],
    ]);
    const livePhotoMap = new Map<string, StorageObject>([
      ["a.jpg", { key: "a.mov" }],
    ]);
    const results = [
      createResult("new"),
      createResult("processed"),
      createResult("skipped"),
      createResult("failed"),
    ];
    processorMocks.processPhoto.mockImplementation(async (_object, index) => {
      return results[index];
    });

    const output = await new PhotoTaskProcessor().process(
      session,
      tasks,
      existingManifestMap,
      livePhotoMap,
    );

    expect(output).toMatchObject({
      concurrency: 2,
      mode: "worker",
      processorOptions: {
        isForceMode: false,
        isForceManifest: true,
        isForceThumbnails: true,
      },
      stats: {
        failedCount: 1,
        newCount: 1,
        processedCount: 2,
        skippedCount: 1,
      },
    });
    expect(output.results).toEqual(results);
    expect(processorMocks.workerPoolInstances).toHaveLength(1);
    expect(processorMocks.clusterPoolInstances).toHaveLength(0);
    expect(processorMocks.workerPoolInstances[0].options.logger).toBe(
      session.services.logger,
    );
    expect(session.emitPluginEvent).toHaveBeenCalledWith(
      session.runState,
      "beforeProcessTasks",
      {
        concurrency: 2,
        mode: "worker",
        options: session.options,
        processorOptions: output.processorOptions,
        tasks,
      },
    );
    expect(processorMocks.processPhoto).toHaveBeenCalledWith(
      tasks[0],
      0,
      10,
      tasks.length,
      existingManifestMap,
      livePhotoMap,
      output.processorOptions,
      session.services,
      expect.any(Function),
      {
        builderOptions: session.options,
        runState: session.runState,
      },
    );

    const pluginBridge = getFirstProcessPhotoCall()[8];
    await pluginBridge(session.runState, "afterImagesListed", {
      imageObjects: tasks,
      options: session.options,
    });
    expect(session.emitPluginEvent).toHaveBeenCalledWith(
      session.runState,
      "afterImagesListed",
      {
        imageObjects: tasks,
        options: session.options,
      },
    );

    expect(progressListener.onStart).toHaveBeenCalledWith({
      concurrency: 2,
      mode: "worker",
      total: tasks.length,
    });
    expect(progressListener.onProgress).toHaveBeenLastCalledWith({
      completed: tasks.length,
      currentKey: undefined,
      failedCount: 1,
      newCount: 1,
      processedCount: 2,
      skippedCount: 1,
      total: tasks.length,
    });
    expect(progressListener.onComplete).toHaveBeenCalledWith({
      completed: tasks.length,
      failedCount: 1,
      newCount: 1,
      processedCount: 2,
      skippedCount: 1,
      total: tasks.length,
    });
  });

  it("uses cluster mode with shared session data when task volume reaches the threshold", async () => {
    const session = createSession({
      concurrencyLimit: 2,
      isForceMode: true,
    });
    session.config.system.observability.performance.worker.useClusterMode = true;
    const tasks: StorageObject[] = [
      { key: "a.jpg" },
      { key: "b.jpg" },
      { key: "c.jpg" },
      { key: "d.jpg" },
    ];
    const existingManifestMap = new Map<string, PhotoManifestItem>();
    const livePhotoMap = new Map<string, StorageObject>();
    processorMocks.clusterResults = [
      createResult("processed"),
      createResult("failed"),
    ];

    const output = await new PhotoTaskProcessor().process(
      session,
      tasks,
      existingManifestMap,
      livePhotoMap,
    );

    expect(output.mode).toBe("cluster");
    expect(output.results).toEqual(processorMocks.clusterResults);
    expect(output.stats).toMatchObject({
      failedCount: 1,
      newCount: 0,
      processedCount: 1,
      skippedCount: 0,
    });
    expect(processorMocks.processPhoto).not.toHaveBeenCalled();
    expect(processorMocks.workerPoolInstances).toHaveLength(0);
    expect(processorMocks.clusterPoolInstances).toHaveLength(1);
    expect(processorMocks.clusterPoolInstances[0].options.logger).toBe(
      session.services.logger,
    );
    expect(processorMocks.clusterPoolInstances[0].options).toMatchObject({
      concurrency: 2,
      totalTasks: tasks.length,
      workerConcurrency: 3,
    });
    expect(processorMocks.clusterPoolInstances[0].options.sharedData).toEqual({
      builderConfig: session.getConfig(),
      builderOptions: session.options,
      existingManifestMap,
      imageObjects: tasks,
      livePhotoMap,
      photoIdCollisionKeys: ["collision.jpg"],
    });
  });

  it("passes a serializable built-in plugin descriptor to cluster workers", async () => {
    const session = createSession({
      concurrencyLimit: 2,
      isForceMode: true,
    });
    session.config.system.observability.performance.worker.useClusterMode = true;
    session.config.plugins = [
      geocodingPlugin({
        enable: true,
        locales: "en,zh-CN",
        provider: "nominatim",
      }),
    ];
    const tasks: StorageObject[] = [
      { key: "a.jpg" },
      { key: "b.jpg" },
      { key: "c.jpg" },
      { key: "d.jpg" },
    ];

    await new PhotoTaskProcessor().process(
      session,
      tasks,
      new Map<string, PhotoManifestItem>(),
      new Map<string, StorageObject>(),
    );

    const { sharedData } = processorMocks.clusterPoolInstances[0].options;
    expect(sharedData?.builderConfig.plugins).toEqual([
      {
        plugin: "geocoding",
        options: expect.objectContaining({
          enable: true,
          locales: ["en", "zh-CN"],
          provider: "nominatim",
        }),
      },
    ]);
    expect(() => serialize(sharedData)).not.toThrow();
  });

  it("emits completion for an empty run", () => {
    const progressListener = { onComplete: vi.fn() };
    const session = createSession({ progressListener });
    const stats = {
      failedCount: 0,
      newCount: 0,
      processedCount: 0,
      skippedCount: 0,
    };

    new PhotoTaskProcessor().completeEmptyRun(session, stats);

    expect(progressListener.onComplete).toHaveBeenCalledWith({
      completed: 0,
      failedCount: 0,
      newCount: 0,
      processedCount: 0,
      skippedCount: 0,
      total: 0,
    });
  });
});
