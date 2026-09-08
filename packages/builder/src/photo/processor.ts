import type { EmitPluginEventFn } from "../core/contracts/execution-context.js";
import type {
  PhotoProcessingContext,
  PhotoProcessorOptions,
} from "../core/contracts/photo-processing.js";
import type { PluginRunState } from "../core/contracts/plugin-ref.js";
import type { BuilderServices } from "../core/contracts/services.js";
import { logger } from "../logger/index.js";
import type { StorageObject } from "../storage/interfaces.js";
import type { BuilderPluginOptions } from "../types/options.js";
import type { PhotoManifestItem, ProcessPhotoResult } from "../types/photo.js";
import {
  createPhotoExecutionContext,
  runWithPhotoExecutionContext,
} from "./execution-context.js";
import { processPhotoWithPipeline } from "./image-pipeline.js";

export type {
  PhotoProcessingContext,
  PhotoProcessorOptions,
} from "../core/contracts/photo-processing.js";

/** 单张任务的可变部分；构建期恒定的依赖都在 PhotoTaskRuntime 里。 */
export interface PhotoTaskInput {
  obj: StorageObject;
  index: number;
  workerId: number;
  totalImages: number;
  signal?: AbortSignal;
}

/**
 * 每个进程组装一次的运行期依赖。主进程并发池与 cluster worker 共用同一形状，
 * 两侧的组装差异只剩"依赖从哪来"（BuildSession vs IPC sharedData 重建的 builder）。
 */
export interface PhotoTaskRuntime {
  existingManifestMap: Map<string, PhotoManifestItem>;
  livePhotoMap: Map<string, StorageObject>;
  services: BuilderServices;
  emitPluginEvent: EmitPluginEventFn;
  runState: PluginRunState;
  builderOptions: BuilderPluginOptions;
  processorOptions: PhotoProcessorOptions;
}

export { toProcessorOptions } from "./processing-options.js";

// 处理单张照片
export async function processPhoto(
  task: PhotoTaskInput,
  runtime: PhotoTaskRuntime,
): Promise<ProcessPhotoResult> {
  const { obj, index, workerId, totalImages, signal } = task;
  signal?.throwIfAborted();
  const { key } = obj;
  if (!key) {
    logger.image.warn(`Skipping object without a key`);
    return {
      item: null,
      type: "failed",
      failure: {
        code: "missing_storage_key",
        stage: "task-input",
        message: "Storage object has no key",
      },
    };
  }

  const existingItem = runtime.existingManifestMap.get(key);

  // 构建处理上下文
  const context: PhotoProcessingContext = {
    photoKey: key,
    obj,
    existingItem,
    livePhotoMap: runtime.livePhotoMap,
    options: runtime.processorOptions,
    pluginData: {},
    signal,
  };

  const executionContext = createPhotoExecutionContext(
    runtime.services,
    runtime.emitPluginEvent,
    workerId,
  );

  return await runWithPhotoExecutionContext(executionContext, async () => {
    signal?.throwIfAborted();
    executionContext.loggers.image.info(
      `📸 [${index + 1}/${totalImages}] ${key}`,
    );
    return await processPhotoWithPipeline(context, {
      runState: runtime.runState,
      builderOptions: runtime.builderOptions,
    });
  });
}
