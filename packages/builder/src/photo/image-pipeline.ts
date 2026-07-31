import { uint8ArrayToHex } from "@afilmory/media";
import type { Sharp } from "sharp";
import sharp from "sharp";

import type { PhotoProcessingContext } from "../core/contracts/photo-processing.js";
import type { PluginRunState } from "../core/contracts/plugin-ref.js";
import {
  convertBmpToJpegSharpInstance,
  getImageMetadataWithSharp,
  isBitmap,
  preprocessImageBuffer,
} from "../image/processor.js";
import { SOURCE_SHARP_OPTIONS } from "../image/sharp-options.js";
import { getThumbnailFileNameFromUrl } from "../image/thumbnail.js";
import { needsUpdate } from "../manifest/manager.js";
import type { ThumbnailPluginData } from "../plugins/thumbnail-storage/shared.js";
import { THUMBNAIL_PLUGIN_DATA_KEY } from "../plugins/thumbnail-storage/shared.js";
import type { BuilderOptions } from "../types/options.js";
import type {
  PhotoManifestItem,
  PhotoProcessingFailure,
  ProcessPhotoResult,
} from "../types/photo.js";
import {
  processExifData,
  processThumbnailAndThumbHash,
  processToneAnalysis,
} from "./data-processors.js";
import { getPhotoExecutionContext } from "./execution-context.js";
import { detectGainMap } from "./gainmap-detector.js";
import { extractPhotoInfo } from "./info-extractor.js";
import { processLivePhoto } from "./live-photo-handler.js";
import {
  applyExifLocationPrivacy,
  rebuildLocationForPrivacyTransition,
} from "./location-privacy.js";
import { detectMotionPhoto } from "./motion-photo-detector.js";
import {
  getCurrentCoreProcessingFingerprints,
  getStaleCoreProcessingStages,
} from "./processing-fingerprints.js";
import { shouldProcessPhoto } from "./work-decision.js";

export interface ProcessedImageData {
  sharpInstance: Sharp;
  imageBuffer: Buffer;
  metadata: { width: number; height: number };
}

class PhotoProcessingError extends Error {
  readonly failure: PhotoProcessingFailure;

  constructor(failure: PhotoProcessingFailure, options?: ErrorOptions) {
    super(failure.message, options);
    this.name = "PhotoProcessingError";
    this.failure = failure;
  }
}

function toPhotoProcessingError(
  error: unknown,
  stage: string,
  photoKey: string,
): PhotoProcessingError {
  if (error instanceof PhotoProcessingError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PhotoProcessingError(
    { code: "pipeline_error", stage, message: `${photoKey}: ${message}` },
    error instanceof Error ? { cause: error } : undefined,
  );
}

/**
 * 预处理图片数据
 * 包括获取原始数据、格式转换、BMP 处理等
 */
async function preprocessImage(
  photoKey: string,
  signal?: AbortSignal,
): Promise<{ rawBuffer: Buffer; processedBuffer: Buffer } | null> {
  const { loggers, storageManager } = getPhotoExecutionContext();

  try {
    // 获取图片数据
    signal?.throwIfAborted();
    const rawImageBuffer = await storageManager.getFile(photoKey, signal);
    signal?.throwIfAborted();
    if (!rawImageBuffer) {
      loggers.image.error(`Failed to fetch image data: ${photoKey}`);
      return null;
    }

    // 预处理图片（处理 HEIC/HEIF 格式）
    let imageBuffer: Buffer;
    try {
      imageBuffer = await preprocessImageBuffer(rawImageBuffer, photoKey);
      signal?.throwIfAborted();
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      loggers.image.error(`Failed to preprocess image: ${photoKey}`, error);
      return null;
    }

    return {
      rawBuffer: rawImageBuffer,
      processedBuffer: imageBuffer,
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    loggers.image.error(`Image preprocessing failed: ${photoKey}`, error);
    return null;
  }
}

/**
 * 处理图片并创建 Sharp 实例
 * 包括 BMP 转换和元数据提取
 */
async function processImageWithSharp(
  imageBuffer: Buffer,
  photoKey: string,
  signal?: AbortSignal,
): Promise<ProcessedImageData | null> {
  const { loggers } = getPhotoExecutionContext();

  try {
    signal?.throwIfAborted();
    // 创建 Sharp 实例，复用于多个操作
    let sharpInstance = sharp(imageBuffer, SOURCE_SHARP_OPTIONS);
    let processedBuffer = imageBuffer;

    // 处理 BMP
    if (isBitmap(imageBuffer)) {
      try {
        // Convert the BMP image to JPEG format and create a new Sharp instance for the converted image.
        sharpInstance = await convertBmpToJpegSharpInstance(imageBuffer);
        signal?.throwIfAborted();
        // Update the image buffer to reflect the new JPEG data from the Sharp instance.
        processedBuffer = await sharpInstance.toBuffer();
        signal?.throwIfAborted();
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        loggers.image.error(`Failed to convert BMP: ${photoKey}`, error);
        return null;
      }
    }

    // 获取图片元数据（复用 Sharp 实例）
    const metadata = await getImageMetadataWithSharp(sharpInstance);
    signal?.throwIfAborted();
    if (!metadata) {
      loggers.image.error(`Failed to read image metadata: ${photoKey}`);
      return null;
    }

    return {
      sharpInstance,
      imageBuffer: processedBuffer,
      metadata,
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    loggers.image.error(`Sharp processing failed: ${photoKey}`, error);
    return null;
  }
}

/**
 * 完整的照片处理管道
 * 整合所有处理步骤
 * photoId 由调用方（processPhotoWithPipeline）计算一次传入，避免双算。
 */
async function executePhotoProcessingPipeline(
  context: PhotoProcessingContext,
  photoId: string,
): Promise<PhotoManifestItem> {
  const { photoKey, obj, existingItem, livePhotoMap, options, signal } =
    context;
  const { loggers, storageManager, services } = getPhotoExecutionContext();

  // 内容变更判定与 DiffPlanner 的入队谓词同源（needsUpdate）：这张照片若因
  // mtime/size/etag 变化被选中重处理，下游的"复用现有数据"检查必须让位——
  // 否则原图白白下载一遍，缩略图/EXIF/影调仍沿用旧内容，永远不会更新。
  const contentChanged = existingItem
    ? options.reprocessKeys?.includes(photoKey) ||
      needsUpdate(existingItem, obj)
    : false;
  const locationMode = options.locationMode ?? "coarse";
  const currentProcessingFingerprints =
    getCurrentCoreProcessingFingerprints(locationMode);
  const staleStages = getStaleCoreProcessingStages(existingItem, locationMode);
  const privacyModeChanged = Boolean(
    existingItem && staleStages.has("privacy"),
  );

  let stage = "download";
  try {
    signal?.throwIfAborted();
    // 1. 预处理图片
    const imageData = await preprocessImage(photoKey, signal);
    signal?.throwIfAborted();
    if (!imageData) {
      throw new PhotoProcessingError({
        code: "source_decode_failed",
        stage,
        message: `Failed to download or preprocess ${photoKey}`,
      });
    }

    // 2. 处理图片并创建 Sharp 实例
    stage = "image-metadata";
    const processedData = await processImageWithSharp(
      imageData.processedBuffer,
      photoKey,
      signal,
    );
    signal?.throwIfAborted();
    if (!processedData) {
      throw new PhotoProcessingError({
        code: "image_metadata_failed",
        stage,
        message: `Failed to decode image metadata for ${photoKey}`,
      });
    }

    const { sharpInstance, imageBuffer, metadata } = processedData;

    // 3. 处理缩略图和 thumbhash
    stage = "thumbnail";
    const thumbnailResult = await processThumbnailAndThumbHash(
      imageBuffer,
      photoId,
      existingItem,
      options,
      contentChanged || staleStages.has("thumbnail"),
    );
    signal?.throwIfAborted();

    // 缩略图生成失败：将该照片视为处理失败并跳过（会计入 failedCount），
    // 而不是带着空 thumbnailUrl 继续构建一个“成功但损坏”的 manifest 项。
    if (!thumbnailResult) {
      loggers.image.error(
        `❌ Thumbnail generation failed, skipping photo: ${photoKey}`,
      );
      throw new PhotoProcessingError({
        code: "thumbnail_failed",
        stage,
        message: `Thumbnail generation failed for ${photoKey}`,
      });
    }

    context.pluginData[THUMBNAIL_PLUGIN_DATA_KEY] = {
      photoId,
      fileName:
        getThumbnailFileNameFromUrl(thumbnailResult.thumbnailUrl) ??
        `${photoId}.jpg`,
      buffer: thumbnailResult.thumbnailBuffer,
      localUrl: thumbnailResult.thumbnailUrl,
    };

    // 4. 处理 EXIF 数据
    stage = "exif";
    const extractedExifData = await processExifData(
      imageBuffer,
      imageData.rawBuffer,
      photoKey,
      existingItem,
      options,
      services.exif,
      contentChanged || staleStages.has("exif") || privacyModeChanged,
    );
    const exifData = applyExifLocationPrivacy(extractedExifData, locationMode);
    signal?.throwIfAborted();

    // 5. 检测 HDR GainMap（Ultra HDR 图片）
    stage = "media-detection";
    const hasGainMap = detectGainMap({
      exifData: exifData as Record<string, unknown> | null,
    });

    // 6. 检测 Motion Photo（从图片中提取嵌入视频的元数据）
    const motionPhotoMetadata = detectMotionPhoto({
      rawImageBuffer: imageData.rawBuffer,
      exifData: exifData as Record<string, unknown> | null,
    });

    // 7. 处理 Live Photo（独立的视频文件）
    const livePhotoResult = await processLivePhoto(
      photoKey,
      livePhotoMap,
      storageManager,
    );
    signal?.throwIfAborted();

    // 检测冲突：不允许同时存在 Motion Photo 和 Live Photo
    if (motionPhotoMetadata?.isMotionPhoto && livePhotoResult.isLivePhoto) {
      const errorMsg = `❌ Detected both a Motion Photo (embedded video) and a Live Photo (separate video file): ${photoKey}. This is not allowed, keep only one format.`;
      loggers.image.error(errorMsg);
      throw new Error(errorMsg);
    }

    // 8. 处理影调分析
    stage = "tone-analysis";
    const toneAnalysis = await processToneAnalysis(
      sharpInstance,
      photoKey,
      existingItem,
      options,
      contentChanged || staleStages.has("tone"),
    );
    signal?.throwIfAborted();

    // 9. 提取照片信息
    stage = "manifest-item";
    const photoInfo = extractPhotoInfo(
      photoKey,
      exifData,
      obj.lastModified ?? existingItem?.dateTaken,
    );

    // 10. 构建照片清单项
    const aspectRatio = metadata.width / metadata.height;
    const photoItem: PhotoManifestItem = {
      id: photoId,
      title: photoInfo.title,
      description: photoInfo.description,
      dateTaken: photoInfo.dateTaken,
      tags: photoInfo.tags,
      originalUrl: await storageManager.generatePublicUrl(photoKey),
      thumbnailUrl: thumbnailResult.thumbnailUrl,
      thumbHash: thumbnailResult.thumbHash
        ? uint8ArrayToHex(thumbnailResult.thumbHash)
        : null,
      width: metadata.width,
      height: metadata.height,
      aspectRatio,
      s3Key: photoKey,
      lastModified: obj.lastModified?.toISOString() || new Date().toISOString(),
      size: obj.size || 0,
      etag: obj.etag,
      exif: exifData,
      toneAnalysis,
      location: rebuildLocationForPrivacyTransition(
        existingItem?.location ?? null,
        exifData,
        locationMode,
        privacyModeChanged,
      ),
      // Video source (Motion Photo or Live Photo)
      video:
        motionPhotoMetadata?.isMotionPhoto &&
        motionPhotoMetadata.motionPhotoOffset !== undefined
          ? {
              type: "motion-photo",
              offset: motionPhotoMetadata.motionPhotoOffset,
              size: motionPhotoMetadata.motionPhotoVideoSize,
              presentationTimestamp:
                motionPhotoMetadata.presentationTimestampUs,
            }
          : livePhotoResult.isLivePhoto
            ? {
                type: "live-photo",
                videoUrl: livePhotoResult.livePhotoVideoUrl,
                s3Key: livePhotoResult.livePhotoVideoS3Key,
                version: livePhotoResult.livePhotoVideoVersion,
              }
            : undefined,
      // HDR 相关字段
      isHDR:
        exifData?.MPImageType === "Gain Map Image" ||
        exifData?.UniformResourceName === "urn:iso:std:iso:ts:21496:-1" ||
        hasGainMap,
      processing: {
        ...existingItem?.processing,
        ...currentProcessingFingerprints,
      },
    };

    signal?.throwIfAborted();
    loggers.image.success(`✅ Processing complete: ${photoKey}`);
    return photoItem;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    loggers.image.error(`❌ Processing pipeline failed: ${photoKey}`, error);
    throw toPhotoProcessingError(error, stage, photoKey);
  }
}

/**
 * 决定是否需要处理照片并返回处理结果
 */
export async function processPhotoWithPipeline(
  context: PhotoProcessingContext,
  runtime: { runState: PluginRunState; builderOptions: BuilderOptions },
): Promise<{
  item: PhotoManifestItem | null;
  type: "new" | "processed" | "skipped" | "failed";
  pluginData: Record<string, unknown>;
  failure?: PhotoProcessingFailure;
}> {
  const { photoKey, existingItem, obj, options } = context;
  const { emitPluginEvent, loggers, services } = getPhotoExecutionContext();

  const photoId = services.photoId.getIdForKey(photoKey, existingItem);

  context.signal?.throwIfAborted();
  await emitPluginEvent(runtime.runState, "beforePhotoProcess", {
    options: runtime.builderOptions,
    context,
  });
  context.signal?.throwIfAborted();

  // 检查是否需要处理
  const { shouldProcess, reason } = await shouldProcessPhoto(
    photoId,
    existingItem,
    obj,
    options,
  );
  context.signal?.throwIfAborted();

  if (!shouldProcess) {
    loggers.image.info(`⏭️ Skipping (${reason}): ${photoKey}`);
    const result = {
      item: existingItem ?? null,
      type: "skipped" as const,
      pluginData: context.pluginData,
    };
    await emitPluginEvent(runtime.runState, "afterPhotoProcess", {
      options: runtime.builderOptions,
      context,
      result,
    });
    context.signal?.throwIfAborted();
    return result;
  }

  // 记录处理原因
  const isNewPhoto = !existingItem;
  if (isNewPhoto) {
    loggers.image.info(`🆕 New photo: ${photoKey}`);
  } else {
    loggers.image.info(`🔄 Updating photo (${reason}): ${photoKey}`);
  }

  let processedItem: PhotoManifestItem | null = null;
  let resultType: ProcessPhotoResult["type"] = isNewPhoto ? "new" : "processed";
  let failure: PhotoProcessingFailure | undefined;

  try {
    processedItem = await executePhotoProcessingPipeline(context, photoId);
  } catch (error) {
    if (context.signal?.aborted) throw context.signal.reason;
    const processingError = toPhotoProcessingError(
      error,
      "photo-processing",
      photoKey,
    );
    failure = processingError.failure;
    await emitPluginEvent(runtime.runState, "photoProcessError", {
      options: runtime.builderOptions,
      context,
      error: processingError,
      failure,
    });
    loggers.image.error(
      `❌ Exception during processing: ${photoKey}`,
      processingError,
    );
    processedItem = null;
    resultType = "failed";
  }

  const result = {
    item: processedItem,
    type: resultType,
    pluginData: context.pluginData,
    ...(failure ? { failure } : {}),
  };

  context.signal?.throwIfAborted();
  await emitPluginEvent(runtime.runState, "afterPhotoProcess", {
    options: runtime.builderOptions,
    context,
    result,
  });
  context.signal?.throwIfAborted();

  // afterPhotoProcess 是缩略图 buffer 的最后消费者（thumbnail-storage 在钩子里
  // 上传）。钩子返回后立刻断开引用，让每张几十上百 KB 的 JPEG 即刻可回收：
  // 否则主进程会为整个构建期攒下全部缩略图，cluster 模式还要把 buffer 走一遍
  // IPC v8 序列化。就地置 null（而非换新对象），持有旧条目引用的一方也随之释放；
  // 两种模式对 beforeAddManifestItem 呈现同样的无 buffer 载荷。
  const thumbnailData = context.pluginData[THUMBNAIL_PLUGIN_DATA_KEY] as
    ThumbnailPluginData | undefined;
  if (thumbnailData) {
    thumbnailData.buffer = null;
  }

  return result;
}
