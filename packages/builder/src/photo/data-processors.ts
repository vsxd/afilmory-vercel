import fs from "node:fs/promises";
import path from "node:path";

import { hexToUint8Array } from "@afilmory/media";
import type { Sharp } from "sharp";

import { HEIC_FORMATS } from "../constants/index.js";
import type { PhotoProcessorOptions } from "../core/contracts/photo-processing.js";
import type { ExifReaderService } from "../image/exif.js";
import { extractExifData } from "../image/exif.js";
import { calculateHistogramAndAnalyzeTone } from "../image/histogram.js";
import {
  generateThumbnailAndThumbHash,
  resolveExistingThumbnail,
  thumbnailExists,
} from "../image/thumbnail.js";
import type {
  PhotoManifestItem,
  PickedExif,
  ToneAnalysis,
} from "../types/photo.js";
import { getPhotoExecutionContext } from "./execution-context.js";
import { getPhotoProcessingLoggers } from "./logger-adapter.js";

/**
 * 缩略图处理的唯一结果契约：成功时三个字段全部就位（thumbHash 可能因
 * 图像内容无法哈希而为 null），失败一律用 null 表达——绝不出现
 * 「字段各自为 null」的中间态。
 */
export interface ThumbnailResult {
  thumbnailUrl: string;
  thumbnailBuffer: Buffer;
  thumbHash: Uint8Array | null;
}

/**
 * 处理缩略图和 thumbhash
 * 优先复用现有数据，如果不存在或需要强制更新则重新生成。
 * contentChanged：原图内容已变（needsUpdate 判定，见 image-pipeline.ts）——
 * 磁盘上的旧缩略图对应旧内容，复用即错误，必须重生成。
 */
export async function processThumbnailAndThumbHash(
  imageBuffer: Buffer,
  photoId: string,
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
  contentChanged: boolean,
): Promise<ThumbnailResult | null> {
  const loggers = getPhotoProcessingLoggers();
  const { thumbnailsDir } = getPhotoExecutionContext().output;

  // 检查是否可以复用现有数据
  if (
    !contentChanged &&
    !options.isForceMode &&
    !options.isForceThumbnails &&
    existingItem?.thumbHash &&
    (await thumbnailExists(photoId, thumbnailsDir, existingItem.thumbnailUrl))
  ) {
    try {
      const existingThumbnail = await resolveExistingThumbnail(
        photoId,
        thumbnailsDir,
        existingItem.thumbnailUrl,
      );
      if (!existingThumbnail) throw new Error("Thumbnail disappeared");
      const thumbnailBuffer = await fs.readFile(existingThumbnail.path);

      loggers.thumbhash.info(`Reusing existing thumbhash: ${photoId}`);
      loggers.thumbnail.info(`Reusing existing thumbnail: ${photoId}`);

      return {
        thumbnailUrl: existingThumbnail.url,
        thumbnailBuffer,
        thumbHash: hexToUint8Array(existingItem.thumbHash),
      };
    } catch (error) {
      loggers.thumbnail.warn(
        `Failed to read existing thumbnail, regenerating: ${photoId}`,
        error,
      );
      // 继续执行生成逻辑
    }
  }

  // 生成新的缩略图和 thumbhash。contentChanged 必须传导到 forceRegenerate：
  // generateThumbnailAndThumbHash 内部还有一层"磁盘已有就复用"的检查，
  // 不强制的话旧内容的缩略图会在那里再次逃过重生成。
  const result = await generateThumbnailAndThumbHash(
    imageBuffer,
    photoId,
    contentChanged || options.isForceMode || options.isForceThumbnails,
    existingItem?.thumbnailUrl,
  );

  // 生成失败（null）时原样传导：让上层把该照片标记为失败并跳过，
  // 绝不向 manifest 写入 thumbnailUrl: null——lenient 解析会把它抢救成空串
  // 并长期保留一张永久破图，严格校验（web 构建的 assertManifest 门）则直接失败。
  if (!result) {
    loggers.thumbnail.error(
      `Thumbnail generation failed, skipping this photo (not written to manifest): ${photoId}`,
    );
    return null;
  }

  return result;
}

/**
 * 处理 EXIF 数据
 * 优先复用现有数据，如果不存在或需要强制更新则重新提取
 */
export async function processExifData(
  imageBuffer: Buffer,
  rawImageBuffer: Buffer | undefined,
  photoKey: string,
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
  exifService: ExifReaderService,
  contentChanged: boolean,
): Promise<PickedExif | null> {
  const loggers = getPhotoProcessingLoggers();

  // 检查是否可以复用现有数据（内容已变时旧 EXIF 属于旧图，不可复用）
  if (
    !contentChanged &&
    !options.isForceMode &&
    !options.isForceManifest &&
    existingItem?.exif
  ) {
    const photoId = path.basename(photoKey, path.extname(photoKey));
    loggers.exif.info(`Reusing existing EXIF data: ${photoId}`);
    return existingItem.exif;
  }

  // 提取新的 EXIF 数据
  const ext = path.extname(photoKey).toLowerCase();
  const originalBuffer = HEIC_FORMATS.has(ext) ? rawImageBuffer : undefined;

  return await extractExifData(exifService, imageBuffer, originalBuffer);
}

/**
 * 处理影调分析
 * 优先复用现有数据，如果不存在或需要强制更新则重新计算
 */
export async function processToneAnalysis(
  sharpInstance: Sharp,
  photoKey: string,
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
  contentChanged: boolean,
): Promise<ToneAnalysis | null> {
  const loggers = getPhotoProcessingLoggers();

  // 检查是否可以复用现有数据（内容已变时旧影调分析属于旧图，不可复用）
  if (
    !contentChanged &&
    !options.isForceMode &&
    !options.isForceManifest &&
    existingItem?.toneAnalysis
  ) {
    const photoId = path.basename(photoKey, path.extname(photoKey));
    loggers.tone.info(`Reusing existing tone analysis: ${photoId}`);
    return existingItem.toneAnalysis;
  }

  // 计算新的影调分析
  return await calculateHistogramAndAnalyzeTone(sharpInstance);
}
