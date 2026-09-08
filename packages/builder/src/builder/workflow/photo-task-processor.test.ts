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
import type { BuildPlan } from "./plan.js";
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

vi.mock("../../photo/processor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../photo/processor.js")>()),
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
    listAllFilesDetailed: vi.fn(async () => ({ objects: [], complete: true })),
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
    photoId: {
      getIdForKey: (key) => key.replace(/\.[^.]+$/, ""),
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
  config.system.processing.worker.globalTaskConcurrency = 2;
  config.system.processing.worker.processCount = 2;
  config.system.processing.worker.useClusterMode = false;
  config.system.processing.worker.workerConcurrency = 3;
  const storageManager = createStorageManagerFixture();
  const services = createBuilderServicesFixture(config);

  return new BuildSession({
    emitPluginEvent: createPluginEventEmitter(),
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

function createPlan(session: BuildSession, tasks: StorageObject[]): BuildPlan {
  return {
    s3ImageKeys: new Set(tasks.map((task) => task.key)),
    tasksToProcess: tasks,
    reasons: new Map(),
    processorOptions: {
      isForceMode: session.options.isForceMode,
      isForceManifest: session.options.isForceManifest,
      isForceThumbnails: session.options.isForceThumbnails,
    },
  };
}

describe("PhotoTaskProcessor", () => {
  it("returns the effective plugin task list without mutating the captured plan", async () => {
    const session = createSession();
    const tasks = [
      { key: "a.jpg", lastModified: new Date("2026-01-01") },
      { key: "b.jpg" },
    ];
    const plan = createPlan(session, tasks);
    const emit = session.emit.bind(session);
    vi.spyOn(session, "emit").mockImplementation(async (event, payload) => {
      if (event === "beforeProcessTasks" && "tasks" in payload) {
        payload.tasks.pop();
        payload.tasks[0].lastModified?.setUTCFullYear(2027);
      }
      await emit(event, payload);
    });
    processorMocks.processPhoto.mockResolvedValue(createResult("processed"));

    const result = await new PhotoTaskProcessor().process(
      session,
      plan,
      new Map(),
      new Map(),
    );
    expect(result.tasks.map((task) => task.key)).toEqual(["a.jpg"]);
    expect(result.tasks[0].lastModified?.getUTCFullYear()).toBe(2027);
    expect(plan.tasksToProcess).toHaveLength(2);
    expect(plan.tasksToProcess[0].lastModified?.getUTCFullYear()).toBe(2026);
    expect(processorMocks.processPhoto).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "executes the captured policy after session options change (cluster %s)",
    async (cluster) => {
      const session = createSession({ isForceManifest: true });
      session.config.system.processing.worker.useClusterMode = cluster;
      session.config.system.processing.worker.workerConcurrency = 1;
      const tasks = [{ key: "a.jpg" }, { key: "b.jpg" }];
      const plan = createPlan(session, tasks);
      session.options.isForceManifest = false;
      session.options.plannedKeys = new Set(["unrelated.jpg"]);
      processorMocks.processPhoto.mockResolvedValue(createResult("processed"));
      await new PhotoTaskProcessor().process(
        session,
        plan,
        new Map(),
        new Map(),
      );
      const options = cluster
        ? processorMocks.clusterPoolInstances[0].options.sharedData
            ?.processorOptions
        : getFirstProcessPhotoCall()[1].processorOptions;
      expect(options).toEqual(plan.processorOptions);
      expect(options?.isForceManifest).toBe(true);
      expect(options?.plannedKeys).toBeUndefined();
    },
  );

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
    processorMocks.processPhoto.mockImplementation(async (task) => {
      return results[task.index];
    });

    const output = await new PhotoTaskProcessor().process(
      session,
      createPlan(session, tasks),
      existingManifestMap,
      livePhotoMap,
    );

    expect(output).toEqual({
      tasks,
      results,
      stats: {
        failedCount: 1,
        newCount: 1,
        processedCount: 2,
        skippedCount: 1,
      },
    });
    expect(processorMocks.workerPoolInstances).toHaveLength(1);
    expect(processorMocks.clusterPoolInstances).toHaveLength(0);
    expect(processorMocks.workerPoolInstances[0].options.logger).toBe(
      session.services.logger,
    );
    expect(processorMocks.workerPoolInstances[0].options.timeoutMs).toBe(
      300_000,
    );
    expect(session.emitPluginEvent).toHaveBeenCalledWith(
      session.runState,
      "beforeProcessTasks",
      {
        concurrency: 2,
        mode: "worker",
        options: session.options,
        processorOptions: {
          isForceMode: false,
          isForceManifest: true,
          isForceThumbnails: true,
        },
        tasks,
      },
    );
    expect(processorMocks.processPhoto).toHaveBeenCalledWith(
      { obj: tasks[0], index: 0, workerId: 10, totalImages: tasks.length },
      {
        existingManifestMap,
        livePhotoMap,
        services: session.services,
        emitPluginEvent: expect.any(Function),
        runState: session.runState,
        builderOptions: session.options,
        processorOptions: {
          isForceMode: false,
          isForceManifest: true,
          isForceThumbnails: true,
        },
      },
    );

    const pluginBridge = getFirstProcessPhotoCall()[1].emitPluginEvent;
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
    session.config.system.processing.worker.useClusterMode = true;
    session.config.system.processing.worker.workerConcurrency = 1;
    const tasks: StorageObject[] = [
      { key: "a.jpg" },
      { key: "b.jpg" },
      { key: "c.jpg" },
      { key: "d.jpg" },
    ];
    const existingManifestMap = new Map<string, PhotoManifestItem>([
      ["a.jpg", createPhoto("a")],
      ["outside.jpg", createPhoto("outside")],
    ]);
    const livePhotoMap = new Map<string, StorageObject>([
      ["a.jpg", { key: "a.mov" }],
      ["outside.jpg", { key: "outside.mov" }],
    ]);
    processorMocks.clusterResults = [
      createResult("processed"),
      createResult("failed"),
    ];

    const output = await new PhotoTaskProcessor().process(
      session,
      createPlan(session, tasks),
      existingManifestMap,
      livePhotoMap,
    );

    // mode/concurrency 不再出现在返回值里；通过 beforeProcessTasks 事件载荷断言
    expect(session.emitPluginEvent).toHaveBeenCalledWith(
      session.runState,
      "beforeProcessTasks",
      expect.objectContaining({ concurrency: 2, mode: "cluster" }),
    );
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
      timeoutMs: 300_000,
      workerConcurrency: 1,
    });
    expect(processorMocks.clusterPoolInstances[0].options.sharedData).toEqual({
      builderConfig: session.config,
      builderOptions: session.options,
      processorOptions: createPlan(session, tasks).processorOptions,
      existingManifestMap: new Map([["a.jpg", createPhoto("a")]]),
      imageObjects: tasks,
      livePhotoMap: new Map([["a.jpg", { key: "a.mov" }]]),
      photoIdCollisionKeys: ["collision.jpg"],
    });
  });

  it("passes serializable shared data to cluster workers, stripping the progress listener", async () => {
    const session = createSession({
      concurrencyLimit: 2,
      isForceMode: true,
      // TTY 运行时 CLI 会注入函数回调；必须在进入 IPC 共享数据前被剥离。
      progressListener: { onProgress: vi.fn() },
    });
    session.config.system.processing.worker.useClusterMode = true;
    session.config.system.processing.worker.workerConcurrency = 1;
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
      createPlan(session, tasks),
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
    expect(sharedData?.builderOptions).not.toHaveProperty("progressListener");
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
