import { deserialize, serialize } from "node:v8";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setConsoleForwarding } from "../logger/index.js";
import type { StorageObject } from "../storage/interfaces.js";
import type { BuilderConfig } from "../types/config.js";
import type { PhotoManifestItem } from "../types/photo.js";
import { ClusterPool } from "./cluster-pool.js";
import type {
  BatchTaskMessage,
  ClusterWorkerMessage,
  ClusterWorkerSharedData,
  WorkerInitMessage,
} from "./cluster-protocol.js";

type ShutdownMessage = { type: "shutdown" };
type SentWorkerMessage = BatchTaskMessage | WorkerInitMessage | ShutdownMessage;
type OnlineListener = () => void;
type MessageListener = (message: ClusterWorkerMessage) => void;
type ErrorListener = (error: Error) => void;
type ExitListener = (code: number | null, signal: string | null) => void;
type WorkerEvent = "online" | "message" | "error" | "exit";
type WorkerEventListener =
  ErrorListener | ExitListener | MessageListener | OnlineListener;

const clusterMocks = vi.hoisted(() => {
  class FakeClusterWorker {
    readonly id: number;
    readonly process: { pid: number };
    readonly sentMessages: SentWorkerMessage[] = [];
    private readonly errorListeners: ErrorListener[] = [];
    private readonly exitListeners: ExitListener[] = [];
    private readonly messageListeners: MessageListener[] = [];
    private readonly onlineListeners: OnlineListener[] = [];

    constructor(id: number) {
      this.id = id;
      this.process = { pid: 10_000 + id };
    }

    on(event: "error", listener: ErrorListener): this;
    on(event: "exit", listener: ExitListener): this;
    on(event: "message", listener: MessageListener): this;
    on(event: "online", listener: OnlineListener): this;
    on(event: WorkerEvent, listener: WorkerEventListener): this {
      switch (event) {
        case "error": {
          this.errorListeners.push(listener as ErrorListener);
          break;
        }
        case "exit": {
          this.exitListeners.push(listener as ExitListener);
          break;
        }
        case "message": {
          this.messageListeners.push(listener as MessageListener);
          break;
        }
        case "online": {
          this.onlineListeners.push(listener as OnlineListener);
          break;
        }
      }
      return this;
    }

    send = vi.fn((message: SentWorkerMessage): boolean => {
      this.sentMessages.push(message);
      if (message.type === "shutdown") {
        queueMicrotask(() => this.emitExit(0, null));
      }
      return true;
    });

    kill = vi.fn((_signal?: string): void => {});
    isConnected = vi.fn((): boolean => true);

    emitOnline(): void {
      for (const listener of this.onlineListeners) {
        listener();
      }
    }

    emitMessage(message: ClusterWorkerMessage): void {
      for (const listener of this.messageListeners) {
        listener(message);
      }
    }

    emitError(error: Error): void {
      for (const listener of this.errorListeners) {
        listener(error);
      }
    }

    emitExit(code: number | null, signal: string | null): void {
      for (const listener of this.exitListeners) {
        listener(code, signal);
      }
    }
  }

  const workers: FakeClusterWorker[] = [];
  return {
    fork: vi.fn(() => {
      const worker = new FakeClusterWorker(workers.length + 1);
      workers.push(worker);
      return worker;
    }),
    setupPrimary: vi.fn(),
    workers,
  };
});

vi.mock("node:cluster", () => ({
  default: {
    fork: clusterMocks.fork,
    setupPrimary: clusterMocks.setupPrimary,
  },
}));

function getWorker(index = 0): (typeof clusterMocks.workers)[number] {
  const worker = clusterMocks.workers[index];
  if (!worker) {
    throw new Error(`Expected worker at index ${index}.`);
  }
  return worker;
}

function isBatchTaskMessage(
  message: SentWorkerMessage,
): message is BatchTaskMessage {
  return message.type === "batch-task";
}

function getLastBatchTaskMessage(
  worker: (typeof clusterMocks.workers)[number],
): BatchTaskMessage {
  const messages = worker.sentMessages.filter(isBatchTaskMessage);
  const message = messages.at(-1);
  if (!message) {
    throw new Error("Expected a batch task message.");
  }
  return message;
}

async function startReadyWorker<T>(pool: ClusterPool<T>): Promise<{
  run: Promise<T[]>;
  worker: (typeof clusterMocks.workers)[number];
}> {
  const run = pool.execute();
  const worker = getWorker();
  worker.emitOnline();
  await new Promise((resolve) => setTimeout(resolve, 0));
  worker.emitMessage({ type: "ready", workerId: 1 });
  worker.emitMessage({ type: "init-complete", workerId: 1 });
  return { run, worker };
}

async function startReadyWorkers<T>(
  pool: ClusterPool<T>,
  count: number,
): Promise<{
  run: Promise<T[]>;
  workers: Array<(typeof clusterMocks.workers)[number]>;
}> {
  const run = pool.execute();
  const workers = Array.from({ length: count }, (_value, index) =>
    getWorker(index),
  );
  for (const worker of workers) {
    worker.emitOnline();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const [index, worker] of workers.entries()) {
    const workerId = index + 1;
    worker.emitMessage({ type: "ready", workerId });
    worker.emitMessage({ type: "init-complete", workerId });
  }
  return { run, workers };
}

// 有任务的池必须携带 sharedData（构造期防静默死锁的守卫）；测试用最小合法子集。
function createTestSharedData(): ClusterWorkerSharedData {
  return {
    existingManifestMap: new Map([["a.jpg", { id: "a" } as PhotoManifestItem]]),
    livePhotoMap: new Map([["a.jpg", { key: "a.mov" } as StorageObject]]),
    imageObjects: [
      {
        key: "a.jpg",
        lastModified: new Date("2026-06-06T00:00:00.000Z"),
      } as StorageObject,
    ],
    builderConfig: {
      output: {
        manifestPath: "/tmp/manifest.json",
        thumbnailsDir: "/tmp/thumbnails",
        originalsDir: "/tmp/originals",
      },
    } as BuilderConfig,
    builderOptions: {
      isForceMode: false,
      isForceManifest: false,
      isForceThumbnails: false,
    },
    photoIdCollisionKeys: ["dup.jpg"],
  };
}

describe("ClusterPool", () => {
  beforeEach(() => {
    clusterMocks.fork.mockClear();
    clusterMocks.setupPrimary.mockClear();
    clusterMocks.workers.length = 0;
    setConsoleForwarding(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setConsoleForwarding(true);
  });

  it("resolves an empty task set without starting cluster workers", async () => {
    const pool = new ClusterPool<string>({
      concurrency: 2,
      totalTasks: 0,
      workerConcurrency: 2,
    });

    await expect(pool.execute()).resolves.toEqual([]);
    expect(clusterMocks.setupPrimary).not.toHaveBeenCalled();
    expect(clusterMocks.fork).not.toHaveBeenCalled();
  });

  it("throws at construction when tasks exist but sharedData is missing", () => {
    // 没有 sharedData 的 worker 永远等不到 init-complete —— 静默死锁，必须在构造期暴露。
    expect(
      () =>
        new ClusterPool<string>({
          concurrency: 1,
          totalTasks: 1,
          workerConcurrency: 1,
        }),
    ).toThrow(/sharedData/);
  });

  it("resolves successful batch results and shuts down workers", async () => {
    const completed: Array<{
      completed: number;
      result: string;
      taskIndex: number;
    }> = [];
    const pool = new ClusterPool<string>({
      concurrency: 1,
      onTaskCompleted: (payload) => completed.push(payload),
      sharedData: createTestSharedData(),
      totalTasks: 2,
      workerConcurrency: 2,
    });

    const { run, worker } = await startReadyWorker(pool);
    const batch = getLastBatchTaskMessage(worker);
    worker.emitMessage({
      results: batch.tasks.map((task) => ({
        result: `photo-${task.taskIndex}`,
        taskId: task.taskId,
        taskIndex: task.taskIndex,
        type: "result",
      })),
      type: "batch-result",
    });

    await expect(run).resolves.toEqual(["photo-0", "photo-1"]);
    expect(completed).toEqual([
      { completed: 1, result: "photo-0", taskIndex: 0, total: 2 },
      { completed: 2, result: "photo-1", taskIndex: 1, total: 2 },
    ]);
    expect(
      worker.sentMessages.some((message) => message.type === "shutdown"),
    ).toBe(true);
  });

  it("rejects and shuts down when a completion callback throws", async () => {
    const pool = new ClusterPool<string>({
      concurrency: 1,
      onTaskCompleted: () => {
        throw new Error("progress callback failed");
      },
      sharedData: createTestSharedData(),
      totalTasks: 1,
      workerConcurrency: 1,
    });
    const { run, worker } = await startReadyWorker(pool);
    const task = getLastBatchTaskMessage(worker).tasks[0];

    expect(() =>
      worker.emitMessage({
        results: [
          {
            result: "photo-0",
            taskId: task.taskId,
            taskIndex: task.taskIndex,
            type: "result",
          },
        ],
        type: "batch-result",
      }),
    ).not.toThrow();
    await expect(run).rejects.toThrow("progress callback failed");
    expect(
      worker.sentMessages.some((message) => message.type === "shutdown"),
    ).toBe(true);
  });

  it("enables advanced IPC serialization and sends shared data (Maps included) natively", async () => {
    const sharedData = createTestSharedData();

    const pool = new ClusterPool<string>({
      concurrency: 1,
      sharedData,
      totalTasks: 1,
      workerConcurrency: 1,
    });

    const { run, worker } = await startReadyWorker(pool);

    // IPC 通道必须启用 advanced（v8 结构化克隆）序列化，Map/Date 才能原生传输
    expect(clusterMocks.setupPrimary).toHaveBeenCalledWith(
      expect.objectContaining({ serialization: "advanced" }),
    );

    const initMessage = worker.sentMessages.find(
      (message): message is WorkerInitMessage => message.type === "init",
    );
    expect(initMessage).toBeDefined();
    // 共享数据直接发送，不再有 {data: number[], length} 的逐字节中转
    expect(initMessage?.sharedData).toBe(sharedData);
    expect(initMessage?.sharedData.existingManifestMap).toBeInstanceOf(Map);

    // 用 v8 序列化往返模拟 advanced IPC 传输：Map/Date 必须原样还原
    const roundTripped = deserialize(
      serialize(initMessage?.sharedData),
    ) as ClusterWorkerSharedData;
    expect(roundTripped.existingManifestMap).toBeInstanceOf(Map);
    expect([...roundTripped.existingManifestMap.entries()]).toEqual([
      ["a.jpg", { id: "a" }],
    ]);
    expect(roundTripped.livePhotoMap).toBeInstanceOf(Map);
    expect(roundTripped.livePhotoMap.get("a.jpg")).toEqual({ key: "a.mov" });
    expect(roundTripped.imageObjects[0].lastModified).toBeInstanceOf(Date);

    const batch = getLastBatchTaskMessage(worker);
    worker.emitMessage({
      results: [
        {
          result: "photo-0",
          taskId: batch.tasks[0].taskId,
          taskIndex: batch.tasks[0].taskIndex,
          type: "result",
        },
      ],
      type: "batch-result",
    });
    await expect(run).resolves.toEqual(["photo-0"]);
  });

  it("walks a worker through starting → initializing → ready and fails fast on a mid-task crash", async () => {
    // 局部子集 cast 而非 as unknown 双重断言：字段名/类型仍受编译器约束
    const sharedData: ClusterWorkerSharedData = {
      existingManifestMap: new Map<string, PhotoManifestItem>(),
      livePhotoMap: new Map<string, StorageObject>(),
      imageObjects: [],
      builderConfig: {
        output: {
          manifestPath: "/tmp/manifest.json",
          thumbnailsDir: "/tmp/thumbnails",
          originalsDir: "/tmp/originals",
        },
      } as BuilderConfig,
      builderOptions: {
        isForceMode: false,
        isForceManifest: false,
        isForceThumbnails: false,
      },
    };

    const pool = new ClusterPool<string>({
      concurrency: 1,
      sharedData,
      totalTasks: 2,
      workerConcurrency: 2,
    });
    const readyEvents: number[] = [];
    pool.on("workerReady", (workerId: number) => readyEvents.push(workerId));

    const run = pool.execute();
    const worker = getWorker();
    worker.emitOnline();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // starting：进程已 fork/上线但尚未握手，不发 init 也不派任务
    expect(worker.sentMessages).toHaveLength(0);
    expect(pool.getWorkerStats()).toEqual([
      { workerId: 1, processedTasks: 0, isIdle: true, isReady: false },
    ]);

    // 首个 ready 消息 → initializing：下发 init 数据，但在 init-complete 前仍不派任务
    worker.emitMessage({ type: "ready", workerId: 1 });
    expect(worker.sentMessages.map((message) => message.type)).toEqual([
      "init",
    ]);
    expect(readyEvents).toEqual([]);
    expect(pool.getWorkerStats()[0]?.isReady).toBe(false);

    // init-complete → ready：触发 workerReady 并立即分配批量任务
    worker.emitMessage({ type: "init-complete", workerId: 1 });
    expect(readyEvents).toEqual([1]);
    expect(pool.getWorkerStats()[0]).toEqual({
      workerId: 1,
      processedTasks: 0,
      isIdle: false,
      isReady: true,
    });
    expect(getLastBatchTaskMessage(worker).tasks).toHaveLength(2);

    // 任务仍在处理中时 worker 崩溃 → 整池 fail-fast（不做任务重入队）
    worker.emitExit(1, null);
    await expect(run).rejects.toThrow("Worker 1 exited unexpectedly");
  });

  it("ignores duplicate ready messages instead of promoting an uninitialized worker", async () => {
    const pool = new ClusterPool<string>({
      concurrency: 1,
      sharedData: createTestSharedData(),
      totalTasks: 1,
      workerConcurrency: 1,
    });
    const readyEvents: number[] = [];
    pool.on("workerReady", (workerId: number) => readyEvents.push(workerId));

    const run = pool.execute();
    const worker = getWorker();
    worker.emitOnline();
    await new Promise((resolve) => setTimeout(resolve, 0));

    worker.emitMessage({ type: "ready", workerId: 1 });
    // init-complete 之前的重复 ready：绝不能把尚未初始化的 worker 标记为可接任务
    worker.emitMessage({ type: "ready", workerId: 1 });
    expect(worker.sentMessages.map((message) => message.type)).toEqual([
      "init",
    ]);
    expect(readyEvents).toEqual([]);
    expect(pool.getWorkerStats()[0]?.isReady).toBe(false);

    worker.emitMessage({ type: "init-complete", workerId: 1 });
    expect(readyEvents).toEqual([1]);

    // ready 之后的重复 ready 同样只告警：不重发 init，也不重复触发 workerReady
    worker.emitMessage({ type: "ready", workerId: 1 });
    expect(readyEvents).toEqual([1]);
    expect(
      worker.sentMessages.filter((message) => message.type === "init"),
    ).toHaveLength(1);
    expect(pool.getWorkerStats()[0]?.isReady).toBe(true);

    const batch = getLastBatchTaskMessage(worker);
    worker.emitMessage({
      results: [
        {
          result: "photo-0",
          taskId: batch.tasks[0].taskId,
          taskIndex: batch.tasks[0].taskIndex,
          type: "result",
        },
      ],
      type: "batch-result",
    });
    await expect(run).resolves.toEqual(["photo-0"]);
  });

  it("rejects and shuts down remaining workers when a worker exits unexpectedly", async () => {
    const pool = new ClusterPool<string>({
      concurrency: 2,
      sharedData: createTestSharedData(),
      totalTasks: 4,
      workerConcurrency: 2,
    });

    const { run, workers } = await startReadyWorkers(pool, 2);
    const [exitedWorker, remainingWorker] = workers;
    if (!exitedWorker || !remainingWorker) {
      throw new Error("Expected two workers.");
    }
    expect(getLastBatchTaskMessage(exitedWorker).tasks).toHaveLength(2);
    expect(getLastBatchTaskMessage(remainingWorker).tasks).toHaveLength(2);

    exitedWorker.emitExit(1, null);

    await expect(run).rejects.toThrow("Worker 1 exited unexpectedly");
    expect(clusterMocks.fork).toHaveBeenCalledTimes(2);
    expect(
      remainingWorker.sentMessages.some(
        (message) => message.type === "shutdown",
      ),
    ).toBe(true);
  });

  it("rejects and shuts down when a batch result contains a worker error", async () => {
    const pool = new ClusterPool<string>({
      concurrency: 1,
      sharedData: createTestSharedData(),
      totalTasks: 2,
      workerConcurrency: 2,
    });

    const { run, worker } = await startReadyWorker(pool);
    const batch = getLastBatchTaskMessage(worker);
    worker.emitMessage({
      results: [
        {
          result: "photo-0",
          taskId: batch.tasks[0].taskId,
          taskIndex: batch.tasks[0].taskIndex,
          type: "result",
        },
        {
          error: "Invalid taskIndex: 99",
          taskId: batch.tasks[1].taskId,
          taskIndex: batch.tasks[1].taskIndex,
          type: "error",
        },
      ],
      type: "batch-result",
    });

    await expect(run).rejects.toThrow("Worker task 1-1-");
    await expect(run).rejects.toThrow("Invalid taskIndex: 99");
    expect(
      worker.sentMessages.some((message) => message.type === "shutdown"),
    ).toBe(true);
  });

  it("rejects and shuts down when a single task message contains a worker error", async () => {
    const pool = new ClusterPool<string>({
      concurrency: 1,
      sharedData: createTestSharedData(),
      totalTasks: 1,
      workerConcurrency: 1,
    });

    const { run, worker } = await startReadyWorker(pool);
    const batch = getLastBatchTaskMessage(worker);
    worker.emitMessage({
      error: "worker crashed",
      taskId: batch.tasks[0].taskId,
      taskIndex: batch.tasks[0].taskIndex,
      type: "error",
    });

    await expect(run).rejects.toThrow("worker crashed");
    expect(
      worker.sentMessages.some((message) => message.type === "shutdown"),
    ).toBe(true);
  });

  it("fails when worker initialization exceeds the configured watchdog", async () => {
    vi.useFakeTimers();
    const pool = new ClusterPool<string>({
      concurrency: 1,
      sharedData: createTestSharedData(),
      timeoutMs: 25,
      totalTasks: 1,
      workerConcurrency: 1,
    });

    const run = pool.execute();
    const worker = getWorker();
    worker.emitOnline();
    await vi.advanceTimersByTimeAsync(0);
    worker.emitMessage({ type: "ready", workerId: 1 });
    // Deliberately omit init-complete.
    const rejection = expect(run).rejects.toThrow(
      "Worker 1 initialization timed out after 25ms",
    );
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });

  it("fails when an assigned batch never returns", async () => {
    vi.useFakeTimers();
    const pool = new ClusterPool<string>({
      concurrency: 1,
      sharedData: createTestSharedData(),
      timeoutMs: 25,
      totalTasks: 1,
      workerConcurrency: 1,
    });

    const run = pool.execute();
    const worker = getWorker();
    worker.emitOnline();
    await vi.advanceTimersByTimeAsync(0);
    worker.emitMessage({ type: "ready", workerId: 1 });
    worker.emitMessage({ type: "init-complete", workerId: 1 });
    expect(getLastBatchTaskMessage(worker).tasks).toHaveLength(1);
    const rejection = expect(run).rejects.toThrow(
      /batch \(1\) timed out after 25ms/,
    );
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });
});
