import process from "node:process";

import { AfilmoryBuilder } from "./builder/builder.js";
import { ExifService } from "./image/exif.js";
import { configureLoggerObservability } from "./logger/index.js";
import type {
  BatchTaskMessage,
  BatchTaskResult,
  ClusterWorkerSharedData,
  TaskMessage,
  TaskResult,
  WorkerInitMessage,
} from "./worker/cluster-protocol.js";
import type {
  WorkerProcessPhoto,
  WorkerTaskRuntime,
} from "./worker/task-executor.js";
import {
  executeWorkerBatchTask,
  executeWorkerTask,
} from "./worker/task-executor.js";

// Worker 进程处理逻辑
export async function runAsWorker() {
  process.title = "photo-gallery-builder-worker";
  const workerExifService = new ExifService({
    exiftoolPath: process.env.EXIFTOOL_PATH,
  });
  const closeWorkerServices = () => workerExifService.close();
  process.once("beforeExit", closeWorkerServices);
  process.once("SIGINT", closeWorkerServices);
  process.once("SIGTERM", closeWorkerServices);
  const workerId = Number.parseInt(process.env.WORKER_ID || "0");

  // 立即注册消息监听器，避免被异步初始化阻塞
  let taskRuntime: WorkerTaskRuntime | null = null;

  // 初始化函数，从主进程接收共享数据。运行期依赖在这里组装一次，
  // 之后每个任务直接复用（与主进程侧 processWithWorkers 的组装完全同形）。
  const initializeWorker = async (sharedData: ClusterWorkerSharedData) => {
    if (taskRuntime) return;

    configureLoggerObservability(
      sharedData.builderConfig.system.observability.logging,
    );

    // IPC 通道使用 advanced（v8）序列化，Map 等结构已在传输层原生还原，
    // 这里直接使用共享数据即可，无需手动 Buffer.from + v8.deserialize。
    const builder = new AfilmoryBuilder(sharedData.builderConfig, {
      exifService: workerExifService,
      ownsExifService: false,
    });
    builder.setPhotoIdCollisionKeys(sharedData.photoIdCollisionKeys ?? []);
    await builder.ensurePluginsReady();

    taskRuntime = {
      workerId,
      taskTimeoutMs: sharedData.builderConfig.system.processing.worker.timeout,
      imageObjects: sharedData.imageObjects,
      existingManifestMap: sharedData.existingManifestMap,
      livePhotoMap: sharedData.livePhotoMap,
      builderOptions: sharedData.builderOptions,
      processorOptions: sharedData.processorOptions,
      services: builder.services,
      runState: builder.createPluginRunState(),
      emitPluginEvent: (runState, event, payload) =>
        builder.emitPluginEvent(runState, event, payload),
    };
  };

  const getTaskRuntime = (): WorkerTaskRuntime => {
    if (!taskRuntime) {
      throw new Error("Worker not initialized; send an init message first");
    }
    return taskRuntime;
  };

  const loadProcessPhoto = async (): Promise<WorkerProcessPhoto> => {
    const { processPhoto } = await import("./photo/processor.js");
    return processPhoto;
  };

  const handleTask = async (message: TaskMessage): Promise<void> => {
    try {
      const response = await executeWorkerTask(
        message,
        getTaskRuntime(),
        await loadProcessPhoto(),
      );

      if (process.send) {
        process.send(response);
      }
    } catch (error) {
      // 发送错误回主进程
      const response: TaskResult = {
        type: "error",
        taskId: message.taskId,
        taskIndex: message.taskIndex,
        error: error instanceof Error ? error.message : String(error),
      };

      if (process.send) {
        process.send(response);
      }
    }
  };

  // 批量任务处理函数
  const handleBatchTask = async (message: BatchTaskMessage): Promise<void> => {
    try {
      const response = await executeWorkerBatchTask(
        message,
        getTaskRuntime(),
        await loadProcessPhoto(),
      );

      if (process.send) {
        process.send(response);
      }
    } catch (error) {
      // 如果批量处理失败，为每个任务发送错误结果
      const results: TaskResult[] = message.tasks.map((task) => ({
        type: "error",
        taskId: task.taskId,
        taskIndex: task.taskIndex,
        error: error instanceof Error ? error.message : String(error),
      }));

      const response: BatchTaskResult = {
        type: "batch-result",
        results,
      };

      if (process.send) {
        process.send(response);
      }
    }
  };

  // 立即注册消息监听器
  process.on(
    "message",
    async (
      message:
        | TaskMessage
        | BatchTaskMessage
        | WorkerInitMessage
        | { type: "shutdown" },
    ) => {
      if (message.type === "shutdown") {
        process.removeAllListeners("message");
        process.exit(0);
        return;
      }

      if (message.type === "init") {
        // 处理初始化消息
        try {
          await initializeWorker(message.sharedData);
          if (process.send) {
            process.send({ type: "init-complete", workerId });
          }
        } catch (error) {
          console.error("Worker initialization failed", error);
          process.exit(1);
        }
        return;
      }

      if (message.type === "batch-task") {
        await handleBatchTask(message);
      } else if (message.type === "task") {
        await handleTask(message);
      }
    },
  );

  // 错误处理
  process.on("uncaughtException", (error) => {
    console.error("Worker uncaught exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Worker unhandled rejection:", reason);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    process.exit(0);
  });

  // 告知主进程 worker 已准备好
  if (process.send) {
    process.send({ type: "ready", workerId });
  }
}
