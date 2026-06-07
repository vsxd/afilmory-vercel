import type { EmitPluginEventFn } from "../core/contracts/execution-context.js";
import type { PhotoProcessorOptions } from "../core/contracts/photo-processing.js";
import type { BuilderServices } from "../core/contracts/services.js";
import { runWithBuilderOutputSettings } from "../output-paths.js";
import type { PluginRunState } from "../plugins/manager.js";
import type { StorageObject } from "../storage/interfaces.js";
import type { BuilderConfig } from "../types/config.js";
import type { BuilderOptions } from "../types/options.js";
import type { PhotoManifestItem } from "../types/photo.js";
import type {
  BatchTaskMessage,
  BatchTaskResult,
  TaskMessage,
  TaskResult,
} from "./cluster-protocol.js";

export type WorkerProcessPhoto =
  typeof import("../photo/processor.js").processPhoto;

export interface WorkerTaskRuntime {
  workerId: number;
  imageObjects: StorageObject[];
  existingManifestMap: Map<string, PhotoManifestItem>;
  livePhotoMap: Map<string, StorageObject>;
  builderOptions: BuilderOptions;
  outputSettings: BuilderConfig["output"];
  services: BuilderServices;
  pluginRunState: PluginRunState;
  emitPluginEvent: EmitPluginEventFn;
}

export function createWorkerProcessorOptions(
  builderOptions: BuilderOptions,
): PhotoProcessorOptions {
  return {
    isForceMode: builderOptions.isForceMode,
    isForceManifest: builderOptions.isForceManifest,
    isForceThumbnails: builderOptions.isForceThumbnails,
  };
}

async function executePhotoTask(
  taskIndex: number,
  runtime: WorkerTaskRuntime,
  processPhoto: WorkerProcessPhoto,
) {
  const obj = runtime.imageObjects[taskIndex];
  if (!obj) {
    throw new Error(`Invalid taskIndex: ${taskIndex}`);
  }

  return await runWithBuilderOutputSettings(
    runtime.outputSettings,
    async () =>
      await processPhoto(
        obj,
        taskIndex,
        runtime.workerId,
        runtime.imageObjects.length,
        runtime.existingManifestMap,
        runtime.livePhotoMap,
        createWorkerProcessorOptions(runtime.builderOptions),
        runtime.services,
        runtime.emitPluginEvent,
        {
          runState: runtime.pluginRunState,
          builderOptions: runtime.builderOptions,
        },
      ),
  );
}

function normalizeWorkerError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function executeWorkerTask(
  message: TaskMessage,
  runtime: WorkerTaskRuntime,
  processPhoto: WorkerProcessPhoto,
): Promise<TaskResult> {
  try {
    return {
      type: "result",
      taskId: message.taskId,
      result: await executePhotoTask(message.taskIndex, runtime, processPhoto),
    };
  } catch (error) {
    return {
      type: "error",
      taskId: message.taskId,
      error: normalizeWorkerError(error),
    };
  }
}

export async function executeWorkerBatchTask(
  message: BatchTaskMessage,
  runtime: WorkerTaskRuntime,
  processPhoto: WorkerProcessPhoto,
): Promise<BatchTaskResult> {
  return {
    type: "batch-result",
    results: await Promise.all(
      message.tasks.map((task) =>
        executeWorkerTask(
          {
            type: "task",
            taskId: task.taskId,
            taskIndex: task.taskIndex,
            workerId: message.workerId,
          },
          runtime,
          processPhoto,
        ),
      ),
    ),
  };
}
