/* eslint-disable unicorn/prefer-event-target */
import type { Worker } from "node:cluster";
import cluster from "node:cluster";
import { EventEmitter } from "node:events";
import process from "node:process";
import { serialize } from "node:v8";

import type { Logger } from "../logger/index.js";
import { logger } from "../logger/index.js";
import type {
  BatchTaskMessage,
  BatchTaskResult,
  ClusterWorkerMessage,
  ClusterWorkerSharedData,
  TaskResult,
  WorkerInitMessage,
  WorkerReadyMessage,
  WorkerStats,
} from "./cluster-protocol.js";
import type { QueuedClusterTask } from "./cluster-scheduler.js";
import {
  calculateWorkersToStart,
  createInitialTaskQueue,
  getAvailableWorkerSlots,
  getRequeueTaskIndexes,
  removeRequeuedPendingTasks,
  selectBatchTaskAssignments,
} from "./cluster-scheduler.js";
import type { TaskCompletedPayload } from "./pool.js";

export type {
  BatchTaskMessage,
  BatchTaskResult,
  ClusterWorkerMessage,
  ClusterWorkerSharedData,
  TaskMessage,
  TaskResult,
  WorkerInitMessage,
  WorkerReadyMessage,
  WorkerStats,
} from "./cluster-protocol.js";

const WORKER_SHUTDOWN_GRACE_MS = 5_000;

export interface ClusterPoolOptions<T> {
  concurrency: number;
  totalTasks: number;
  logger?: Logger;
  workerEnv?: Record<string, string>; // 传递给 worker 的环境变量
  workerConcurrency?: number; // 每个 worker 内部的并发数
  sharedData?: ClusterWorkerSharedData;
  onTaskCompleted?: (payload: TaskCompletedPayload<T>) => void;
}

// 基于 Node.js cluster 的 Worker 池管理器
export class ClusterPool<T> extends EventEmitter {
  private concurrency: number;
  private totalTasks: number;
  private workerEnv: Record<string, string>;
  private workerConcurrency: number;
  private logger: Logger;
  private sharedData?: ClusterPoolOptions<T>["sharedData"];
  private onTaskCompleted?: (payload: TaskCompletedPayload<T>) => void;

  private taskQueue: QueuedClusterTask[] = [];
  private workers = new Map<number, Worker>();
  private workerStats = new Map<number, WorkerStats>();
  private pendingTasks = new Map<
    string,
    { resolve: (value: T) => void; reject: (error: Error) => void }
  >();
  private results: T[] = [];
  private completedTasks = 0;
  private isShuttingDown = false;
  private hasFailed = false;
  private readyWorkers = new Set<number>();
  private workerTaskCounts = new Map<number, number>(); // 追踪每个 worker 当前正在处理的任务数
  private initializedWorkers = new Set<number>(); // 追踪已初始化的 worker
  private workerPendingTasks = new Map<
    number,
    Map<string, number> // taskId -> taskIndex
  >(); // 跟踪每个 worker 正在处理的任务，以便在崩溃时重入队

  constructor(options: ClusterPoolOptions<T>) {
    super();
    this.concurrency = options.concurrency;
    this.totalTasks = options.totalTasks;
    this.workerEnv = options.workerEnv || {};
    this.workerConcurrency = options.workerConcurrency || 5; // 默认每个 worker 同时处理 5 个任务
    this.logger = options.logger ?? logger;
    this.sharedData = options.sharedData;
    this.onTaskCompleted = options.onTaskCompleted;

    this.results = Array.from({ length: this.totalTasks });
  }

  async execute(): Promise<T[]> {
    this.logger.main.info(
      `开始集群模式处理任务，进程数：${this.concurrency}，总任务数：${this.totalTasks}`,
    );

    this.taskQueue = createInitialTaskQueue(this.totalTasks);

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanupListeners = () => {
        this.removeListener("allTasksCompleted", handleAllTasksCompleted);
        this.removeListener("error", handleError);
      };
      const settleWithError = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        void this.shutdown()
          .catch((shutdownError: unknown) => {
            this.logger.main.warn(
              `关闭进程池时发生错误: ${
                shutdownError instanceof Error
                  ? shutdownError.message
                  : String(shutdownError)
              }`,
            );
          })
          .finally(() => {
            reject(error);
          });
      };
      const handleAllTasksCompleted = () => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        this.logger.main.success(`所有任务完成，开始关闭进程池`);
        this.shutdown()
          .then(() => {
            resolve(this.results);
          })
          .catch(reject);
      };
      const handleError = (error: Error) => {
        settleWithError(error);
      };

      this.once("allTasksCompleted", handleAllTasksCompleted);
      this.once("error", handleError);

      void this.startWorkers().catch((error: unknown) => {
        this.fail(this.normalizeTaskError("cluster-startup", error));
      });
    });
  }

  private async startWorkers(): Promise<void> {
    // 设置 cluster 环境变量以启用 worker 模式
    cluster.setupPrimary({
      exec: process.argv[1], // 使用当前脚本 (CLI) 作为 worker
      args: ["--cluster-worker"], // 传递 worker 标识参数
      silent: false,
    });

    const { requiredWorkers, workersToStart } = calculateWorkersToStart({
      concurrency: this.concurrency,
      totalTasks: this.totalTasks,
      workerConcurrency: this.workerConcurrency,
    });

    this.logger.main.info(
      `计算 worker 数量：总任务 ${this.totalTasks}，每个 worker 并发 ${this.workerConcurrency}，需要 ${requiredWorkers} 个，实际启动 ${workersToStart} 个`,
    );

    const starts: Array<Promise<void>> = [];
    for (let i = 1; i <= workersToStart; i++) {
      starts.push(this.createWorker(i));
    }
    await Promise.all(starts);
  }

  private async createWorker(workerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = cluster.fork({
        WORKER_ID: workerId.toString(),
        CLUSTER_WORKER: "true",
        WORKER_CONCURRENCY: this.workerConcurrency.toString(),
        ...this.workerEnv, // 传递自定义环境变量
      });

      this.workers.set(workerId, worker);
      this.workerStats.set(workerId, {
        workerId,
        processedTasks: 0,
        isIdle: true,
        isReady: false,
      });
      this.workerTaskCounts.set(workerId, 0); // 初始化任务计数

      const workerLogger = this.logger.worker(workerId);

      const startupTimer = setTimeout(() => {
        reject(new Error(`Worker ${workerId} 启动超时`));
      }, 10_000);

      worker.on("online", () => {
        workerLogger.start(
          `Worker ${workerId} 进程启动 (PID: ${worker.process?.pid})`,
        );
        clearTimeout(startupTimer);
        resolve();
      });

      worker.on("message", (message: ClusterWorkerMessage) => {
        switch (message.type) {
          case "ready":
          case "pong": {
            this.handleWorkerReady(workerId, message as WorkerReadyMessage);

            break;
          }
          case "init-complete": {
            this.handleWorkerInitComplete(workerId);

            break;
          }
          case "batch-result": {
            this.handleWorkerBatchResult(workerId, message as BatchTaskResult);

            break;
          }
          default: {
            this.handleWorkerMessage(workerId, message as TaskResult);
          }
        }
      });

      worker.on("error", (error) => {
        workerLogger.error(`Worker ${workerId} 进程错误:`, error);
        this.handleWorkerError(workerId, error);
      });

      worker.on("exit", (code, signal) => {
        if (!this.isShuttingDown && !this.hasFailed) {
          workerLogger.error(
            `Worker ${workerId} 意外退出 (code: ${code}, signal: ${signal})`,
          );
          const pending = this.workerPendingTasks.get(workerId);
          const requeue = getRequeueTaskIndexes(pending);
          if (pending) pending.clear();
          this.workerTaskCounts.set(workerId, 0);
          removeRequeuedPendingTasks(this.pendingTasks, workerId, requeue);

          for (const taskIndex of requeue) {
            this.taskQueue.unshift({ taskIndex });
          }

          if (requeue.length > 0) {
            workerLogger.warn(`已将 ${requeue.length} 个未完成任务重新入队`);
          }

          // 重启 worker
          setTimeout(() => this.createWorker(workerId), 1000);
        } else {
          workerLogger.info(`Worker ${workerId} 正常退出`);
        }
      });
    });
  }

  private handleWorkerReady(
    workerId: number,
    _message: WorkerReadyMessage,
  ): void {
    const stats = this.workerStats.get(workerId);
    const worker = this.workers.get(workerId);
    const workerLogger = this.logger.worker(workerId);

    if (stats && worker && !this.initializedWorkers.has(workerId)) {
      // 首次准备就绪时发送初始化数据，但不立即标记为 ready
      if (this.sharedData) {
        // 使用 v8.serialize 序列化数据以保持类型完整性
        const serializedBuffer = serialize({
          existingManifestMap: this.sharedData.existingManifestMap,
          livePhotoMap: this.sharedData.livePhotoMap,
          imageObjects: this.sharedData.imageObjects,
          builderConfig: this.sharedData.builderConfig,
          builderOptions: this.sharedData.builderOptions,
          photoIdCollisionKeys: this.sharedData.photoIdCollisionKeys,
        });

        // 将 Buffer 转换为数组以通过 IPC 传输
        const initMessage: WorkerInitMessage = {
          type: "init",
          sharedData: {
            data: Array.from(serializedBuffer),
            length: serializedBuffer.length,
          },
        };
        worker.send(initMessage);
        workerLogger.info(`发送初始化数据到 Worker ${workerId}`);
      }

      this.initializedWorkers.add(workerId);
      workerLogger.info(`Worker ${workerId} 已接收初始化请求，等待初始化完成`);
    } else if (stats) {
      // 后续的 ready 消息（如 pong 响应）
      stats.isReady = true;
      this.readyWorkers.add(workerId);
      workerLogger.info(`Worker ${workerId} 已准备就绪`);
      this.emit("workerReady", workerId);
    }
  }

  private handleWorkerInitComplete(workerId: number): void {
    const stats = this.workerStats.get(workerId);
    const workerLogger = this.logger.worker(workerId);

    if (stats) {
      stats.isReady = true;
      this.readyWorkers.add(workerId);
      workerLogger.info(`Worker ${workerId} 初始化完成，可以接受任务`);
      this.emit("workerReady", workerId);

      // 立即为这个 worker 分配任务
      this.assignBatchTasksToWorker(workerId);
    }
  }

  private assignBatchTasksToWorker(workerId: number): void {
    if (this.hasFailed || this.isShuttingDown || this.taskQueue.length === 0)
      return;

    const worker = this.workers.get(workerId);
    const stats = this.workerStats.get(workerId);
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0;

    // 确保 worker 已经完成初始化（包含在 initializedWorkers 中且 isReady 为 true）
    if (
      !worker ||
      !stats ||
      !stats.isReady ||
      !this.initializedWorkers.has(workerId)
    )
      return;

    const availableSlots = getAvailableWorkerSlots(
      currentTaskCount,
      this.workerConcurrency,
    );
    if (availableSlots === 0) return;

    const { remainingQueue, tasks } = selectBatchTaskAssignments({
      availableSlots,
      taskQueue: this.taskQueue,
      timestamp: Date.now(),
      workerId,
    });
    this.taskQueue = remainingQueue;
    if (tasks.length === 0) return;

    const workerPending =
      this.workerPendingTasks.get(workerId) || new Map<string, number>();
    this.workerPendingTasks.set(workerId, workerPending);

    for (const task of tasks) {
      this.pendingTasks.set(task.taskId, {
        resolve: (_value: T) => {
          // Promise resolve callback
        },
        reject: (_error: Error) => {
          // Promise reject callback
        },
      });

      workerPending.set(task.taskId, task.taskIndex);
    }

    // 更新 worker 状态
    this.workerTaskCounts.set(workerId, currentTaskCount + tasks.length);
    stats.isIdle = tasks.length === 0;

    // 发送批量任务
    const message: BatchTaskMessage = {
      type: "batch-task",
      tasks,
      workerId,
    };

    worker.send(message);

    const workerLogger = this.logger.worker(workerId);
    workerLogger.info(
      `分配 ${tasks.length} 个任务 (当前处理中：${currentTaskCount + tasks.length}/${this.workerConcurrency})`,
    );
  }

  private handleWorkerBatchResult(
    workerId: number,
    message: BatchTaskResult,
  ): void {
    const stats = this.workerStats.get(workerId);
    const workerLogger = this.logger.worker(workerId);
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0;

    if (!stats) return;

    let completedInBatch = 0;
    let successfulInBatch = 0;

    // 处理批量结果中的每个任务
    for (const taskResult of message.results) {
      const pendingTask = this.pendingTasks.get(taskResult.taskId);
      if (!pendingTask) {
        workerLogger.warn(`收到未知任务结果：${taskResult.taskId}`);
        continue;
      }

      this.pendingTasks.delete(taskResult.taskId);
      // 从 worker 待处理集合移除
      const workerPending = this.workerPendingTasks.get(workerId);
      if (workerPending) workerPending.delete(taskResult.taskId);
      completedInBatch++;

      if (taskResult.type === "result" && taskResult.result !== undefined) {
        // 从 taskId 中提取 taskIndex
        const taskIndex = Number.parseInt(taskResult.taskId.split("-")[1]);
        const result = taskResult.result as T;
        this.results[taskIndex] = result;
        successfulInBatch++;

        this.completedTasks++;

        this.onTaskCompleted?.({
          taskIndex,
          completed: this.completedTasks,
          total: this.totalTasks,
          result,
        });
      } else if (taskResult.type === "error") {
        const taskError = this.normalizeTaskError(
          taskResult.taskId,
          taskResult.error,
        );
        workerLogger.error(
          `任务执行失败：${taskResult.taskId}`,
          taskResult.error,
        );
        this.fail(taskError);
        return;
      }
    }

    // 更新 worker 状态
    const newTaskCount = Math.max(0, currentTaskCount - completedInBatch);
    this.workerTaskCounts.set(workerId, newTaskCount);
    stats.processedTasks += successfulInBatch;
    stats.isIdle = newTaskCount === 0;

    workerLogger.info(
      `完成批量任务：${successfulInBatch}/${completedInBatch} 成功 (总完成：${this.completedTasks}/${this.totalTasks}，当前处理中：${newTaskCount})`,
    );

    // 检查是否所有任务都已完成
    if (this.completedTasks >= this.totalTasks) {
      this.emit("allTasksCompleted");
      return;
    }

    // 为该 worker 分配下一批任务
    this.assignBatchTasksToWorker(workerId);
  }

  private handleWorkerMessage(workerId: number, message: TaskResult): void {
    const stats = this.workerStats.get(workerId);
    const workerLogger = this.logger.worker(workerId);
    const currentTaskCount = this.workerTaskCounts.get(workerId) || 0;

    if (!stats) return;

    const pendingTask = this.pendingTasks.get(message.taskId);
    if (!pendingTask) {
      workerLogger.warn(`收到未知任务结果：${message.taskId}`);
      return;
    }

    this.pendingTasks.delete(message.taskId);
    const workerPending = this.workerPendingTasks.get(workerId);
    if (workerPending) workerPending.delete(message.taskId);

    // 更新任务计数
    const newTaskCount = Math.max(0, currentTaskCount - 1);
    this.workerTaskCounts.set(workerId, newTaskCount);
    stats.isIdle = newTaskCount === 0;

    if (message.type === "result" && message.result !== undefined) {
      // 从 taskId 中提取 taskIndex
      const taskIndex = Number.parseInt(message.taskId.split("-")[1]);
      const result = message.result as T;
      this.results[taskIndex] = result;
      stats.processedTasks++;

      this.completedTasks++;
      this.onTaskCompleted?.({
        taskIndex,
        completed: this.completedTasks,
        total: this.totalTasks,
        result,
      });
      workerLogger.info(
        `完成任务 ${taskIndex + 1}/${this.totalTasks} (已完成：${this.completedTasks}，当前处理中：${newTaskCount})`,
      );

      // 检查是否所有任务都已完成
      if (this.completedTasks >= this.totalTasks) {
        this.emit("allTasksCompleted");
        return;
      }
    } else if (message.type === "error") {
      const taskError = this.normalizeTaskError(message.taskId, message.error);
      workerLogger.error(`任务执行失败：${message.taskId}`, message.error);
      this.fail(taskError);
      return;
    }

    // 为该 worker 分配下一批任务
    this.assignBatchTasksToWorker(workerId);
  }

  private handleWorkerError(workerId: number, error: Error): void {
    const stats = this.workerStats.get(workerId);
    if (stats) {
      stats.isIdle = true;
    }

    this.fail(error);
  }

  private normalizeTaskError(taskId: string, error: unknown): Error {
    if (error instanceof Error) return error;
    const message =
      typeof error === "string" && error.length > 0
        ? error
        : "Unknown worker task error";
    return new Error(`Worker task ${taskId} failed: ${message}`);
  }

  private fail(error: Error): void {
    if (this.hasFailed || this.isShuttingDown) return;

    this.hasFailed = true;
    this.taskQueue = [];
    this.pendingTasks.clear();
    this.workerPendingTasks.clear();
    this.workerTaskCounts.clear();

    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
      return;
    }

    this.logger.main.error("进程池发生错误但没有活跃的执行监听器", error);
  }

  private async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    const shutdownPromises: Promise<void>[] = [];

    for (const [, worker] of this.workers) {
      shutdownPromises.push(
        new Promise((resolve) => {
          const timeout = setTimeout(() => {
            worker.kill("SIGKILL");
            resolve();
          }, WORKER_SHUTDOWN_GRACE_MS);

          worker.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });

          // 发送关闭信号
          if (worker.isConnected()) {
            worker.send({ type: "shutdown" });
          } else {
            worker.kill("SIGTERM");
          }
        }),
      );
    }

    await Promise.all(shutdownPromises);
    this.workers.clear();
    this.workerStats.clear();
  }

  // 获取 worker 统计信息
  getWorkerStats(): WorkerStats[] {
    return Array.from(this.workerStats.values());
  }
}
