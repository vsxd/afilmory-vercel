import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setConsoleForwarding } from "../logger/index.js";
import { ClusterPool } from "./cluster-pool.js";
import type {
  BatchTaskMessage,
  ClusterWorkerMessage,
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
  | ErrorListener
  | ExitListener
  | MessageListener
  | OnlineListener;

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

describe("ClusterPool", () => {
  beforeEach(() => {
    clusterMocks.fork.mockClear();
    clusterMocks.setupPrimary.mockClear();
    clusterMocks.workers.length = 0;
    setConsoleForwarding(false);
  });

  afterEach(() => {
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

  it("resolves successful batch results and shuts down workers", async () => {
    const completed: Array<{
      completed: number;
      result: string;
      taskIndex: number;
    }> = [];
    const pool = new ClusterPool<string>({
      concurrency: 1,
      onTaskCompleted: (payload) => completed.push(payload),
      totalTasks: 2,
      workerConcurrency: 2,
    });

    const { run, worker } = await startReadyWorker(pool);
    const batch = getLastBatchTaskMessage(worker);
    worker.emitMessage({
      results: batch.tasks.map((task) => ({
        result: `photo-${task.taskIndex}`,
        taskId: task.taskId,
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

  it("rejects and shuts down remaining workers when a worker exits unexpectedly", async () => {
    const pool = new ClusterPool<string>({
      concurrency: 2,
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
          type: "result",
        },
        {
          error: "Invalid taskIndex: 99",
          taskId: batch.tasks[1].taskId,
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
      totalTasks: 1,
      workerConcurrency: 1,
    });

    const { run, worker } = await startReadyWorker(pool);
    const batch = getLastBatchTaskMessage(worker);
    worker.emitMessage({
      error: "worker crashed",
      taskId: batch.tasks[0].taskId,
      type: "error",
    });

    await expect(run).rejects.toThrow("worker crashed");
    expect(
      worker.sentMessages.some((message) => message.type === "shutdown"),
    ).toBe(true);
  });
});
