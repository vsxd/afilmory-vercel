import type { EmitPluginEventFn } from "../core/contracts/execution-context.js";
import type {
  PhotoProcessingContext as PhotoProcessingContextType,
  PhotoProcessorOptions as PhotoProcessorOptionsType,
} from "../core/contracts/photo-processing.js";
import type { PluginRunState } from "../core/contracts/plugin-ref.js";
import type { BuilderServices } from "../core/contracts/services.js";
import { logger } from "../logger/index.js";
import type { StorageObject } from "../storage/interfaces.js";
import type { BuilderOptions } from "../types/options.js";
import type { PhotoManifestItem, ProcessPhotoResult } from "../types/photo.js";
import {
  createStorageKeyNormalizer,
  runWithPhotoExecutionContext,
} from "./execution-context.js";
import { processPhotoWithPipeline } from "./image-pipeline.js";
import { createPhotoProcessingLoggers } from "./logger-adapter.js";

export type PhotoProcessorOptions = PhotoProcessorOptionsType;
export type { PhotoProcessingContext } from "../core/contracts/photo-processing.js";

// 处理单张照片
export async function processPhoto(
  obj: StorageObject,
  index: number,
  workerId: number,
  totalImages: number,
  existingManifestMap: Map<string, PhotoManifestItem>,
  livePhotoMap: Map<string, StorageObject>,
  options: PhotoProcessorOptions,
  services: BuilderServices,
  emitPluginEvent: EmitPluginEventFn,
  pluginRuntime: {
    runState: PluginRunState;
    builderOptions: BuilderOptions;
  },
): Promise<ProcessPhotoResult> {
  const { key } = obj;
  if (!key) {
    logger.image.warn(`跳过没有 Key 的对象`);
    return { item: null, type: "failed" };
  }

  const existingItem = existingManifestMap.get(key);

  // 构建处理上下文
  const context: PhotoProcessingContextType = {
    photoKey: key,
    obj,
    existingItem,
    livePhotoMap,
    options,
    pluginData: {},
  };

  const storageManager = services.storage.getManager();
  const storageConfig = services.storage.getConfig();
  const photoLoggers = createPhotoProcessingLoggers(workerId, logger);

  return await runWithPhotoExecutionContext(
    {
      services,
      emitPluginEvent,
      storageManager,
      storageConfig,
      normalizeStorageKey: createStorageKeyNormalizer(storageConfig),
      loggers: photoLoggers,
    },
    async () => {
      photoLoggers.image.info(`📸 [${index + 1}/${totalImages}] ${key}`);

      // 使用处理管道
      return await processPhotoWithPipeline(context, pluginRuntime);
    },
  );
}
