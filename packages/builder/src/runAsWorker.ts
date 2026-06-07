import process from "node:process";
import { deserialize } from "node:v8";

import type { BuilderOptions } from "./builder/builder.js";
import { AfilmoryBuilder } from "./builder/builder.js";
import { ExifService } from "./image/exif.js";
import type { PluginRunState } from "./plugins/manager.js";
import type { StorageObject } from "./storage/interfaces";
import type { PhotoManifestItem } from "./types/photo";
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
  let isInitialized = false;

  let imageObjects: StorageObject[];
  let existingManifestMap: Map<string, PhotoManifestItem>;
  let livePhotoMap: Map<string, StorageObject>;
  let builder: AfilmoryBuilder;
  let builderOptions: BuilderOptions;
  let pluginRunState: PluginRunState;

  // 初始化函数，从主进程接收共享数据
  const initializeWorker = async (
    serializedData: WorkerInitMessage["sharedData"],
  ) => {
    if (isInitialized) return;

    // 将数组重新转换为 Buffer，然后反序列化
    const buffer = Buffer.from(serializedData.data);
    const sharedData = deserialize(buffer) as ClusterWorkerSharedData;

    // 从主进程接收的共享数据中恢复数据结构（数据已经是正确的类型）
    imageObjects = sharedData.imageObjects;
    existingManifestMap = sharedData.existingManifestMap;
    livePhotoMap = sharedData.livePhotoMap;
    builderOptions = sharedData.builderOptions;
    builder = new AfilmoryBuilder(sharedData.builderConfig, {
      exifService: workerExifService,
      ownsExifService: false,
    });
    builder.setPhotoIdCollisionKeys(sharedData.photoIdCollisionKeys ?? []);
    await builder.ensurePluginsReady();
    pluginRunState = builder.createPluginRunState();

    isInitialized = true;
  };

  const createTaskRuntime = (): WorkerTaskRuntime => {
    if (!isInitialized) {
      throw new Error("Worker 未初始化，请先发送 init 消息");
    }

    return {
      workerId,
      imageObjects,
      existingManifestMap,
      livePhotoMap,
      builderOptions,
      outputSettings: builder.getConfig().output,
      services: builder.services,
      pluginRunState,
      emitPluginEvent: (runState, event, payload) =>
        builder.emitPluginEvent(runState, event, payload),
    };
  };

  const loadProcessPhoto = async (): Promise<WorkerProcessPhoto> => {
    const { processPhoto } = await import("./photo/processor.js");
    return processPhoto;
  };

  const handleTask = async (message: TaskMessage): Promise<void> => {
    try {
      const response = await executeWorkerTask(
        message,
        createTaskRuntime(),
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
        createTaskRuntime(),
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
        | { type: "shutdown" }
        | { type: "ping" },
    ) => {
      if (message.type === "shutdown") {
        process.removeAllListeners("message");
        process.exit(0);
        return;
      }

      if (message.type === "ping") {
        // 响应主进程的 ping，表示 worker 已准备好
        if (process.send) {
          process.send({ type: "pong", workerId });
        }
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
