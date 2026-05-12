import type { _Object } from '@aws-sdk/client-s3'

import type { AfilmoryBuilder, BuilderOptions } from '../builder/builder.js'
import { logger } from '../logger/index.js'
import type { PluginRunState } from '../plugins/manager.js'
import type { PhotoManifestItem, ProcessPhotoResult } from '../types/photo.js'
import { createStorageKeyNormalizer, runWithPhotoExecutionContext } from './execution-context.js'
import type { PhotoProcessingContext } from './image-pipeline.js'
import { processPhotoWithPipeline } from './image-pipeline.js'
import { createPhotoProcessingLoggers } from './logger-adapter.js'

export interface PhotoProcessorOptions {
  isForceMode: boolean
  isForceManifest: boolean
  isForceThumbnails: boolean
}

// 处理单张照片
export async function processPhoto(
  obj: _Object,
  index: number,
  workerId: number,
  totalImages: number,
  existingManifestMap: Map<string, PhotoManifestItem>,
  livePhotoMap: Map<string, _Object>,
  options: PhotoProcessorOptions,
  builder: AfilmoryBuilder,
  pluginRuntime: {
    runState: PluginRunState
    builderOptions: BuilderOptions
  },
): Promise<ProcessPhotoResult> {
  const key = obj.Key
  if (!key) {
    logger.image.warn(`跳过没有 Key 的对象`)
    return { item: null, type: 'failed' }
  }

  const existingItem = existingManifestMap.get(key)

  // 构建处理上下文
  const context: PhotoProcessingContext = {
    photoKey: key,
    obj,
    existingItem,
    livePhotoMap,
    options,
    pluginData: {},
  }

  const storageManager = builder.getStorageManager()
  const storageConfig = builder.getStorageConfig()
  const photoLoggers = createPhotoProcessingLoggers(workerId, logger)

  return await runWithPhotoExecutionContext(
    {
      services: builder.services,
      emitPluginEvent: (runState, event, payload) => builder.emitPluginEvent(runState, event, payload),
      storageManager,
      storageConfig,
      normalizeStorageKey: createStorageKeyNormalizer(storageConfig),
      loggers: photoLoggers,
    },
    async () => {
      photoLoggers.image.info(`📸 [${index + 1}/${totalImages}] ${key}`)

      // 使用处理管道
      return await processPhotoWithPipeline(context, pluginRuntime)
    },
  )
}
