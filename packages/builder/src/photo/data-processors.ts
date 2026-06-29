import fs from "node:fs/promises";
import path from "node:path";

import { decompressUint8Array } from "@afilmory/media";
import type sharp from "sharp";

import { HEIC_FORMATS } from "../constants/index.js";
import type { PhotoProcessorOptions } from "../core/contracts/photo-processing.js";
import type { ExifReaderService } from "../image/exif.js";
import { extractExifData } from "../image/exif.js";
import { calculateHistogramAndAnalyzeTone } from "../image/histogram.js";
import {
  generateThumbnailAndBlurhash,
  getThumbnailPublicUrl,
  thumbnailExists,
} from "../image/thumbnail.js";
import { getScopedBuilderOutputSettings } from "../output-paths.js";
import type {
  PhotoManifestItem,
  PickedExif,
  ToneAnalysis,
} from "../types/photo.js";
import { getPhotoProcessingLoggers } from "./logger-adapter.js";

export interface ThumbnailResult {
  thumbnailUrl: string;
  thumbnailBuffer: Buffer;
  thumbHash: Uint8Array | null;
}

/**
 * 处理缩略图和 blurhash
 * 优先复用现有数据，如果不存在或需要强制更新则重新生成
 */
export async function processThumbnailAndBlurhash(
  imageBuffer: Buffer,
  photoId: string,
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
): Promise<ThumbnailResult | null> {
  const loggers = getPhotoProcessingLoggers();

  // 检查是否可以复用现有数据
  if (
    !options.isForceMode &&
    !options.isForceThumbnails &&
    existingItem?.thumbHash &&
    (await thumbnailExists(photoId))
  ) {
    try {
      const { thumbnailsDir } = getScopedBuilderOutputSettings();
      const thumbnailPath = path.join(thumbnailsDir, `${photoId}.jpg`);
      const thumbnailBuffer = await fs.readFile(thumbnailPath);
      const thumbnailUrl = getThumbnailPublicUrl(photoId);

      loggers.blurhash.info(`复用现有 blurhash: ${photoId}`);
      loggers.thumbnail.info(`复用现有缩略图：${photoId}`);

      return {
        thumbnailUrl,
        thumbnailBuffer,
        thumbHash: decompressUint8Array(existingItem.thumbHash),
      };
    } catch (error) {
      loggers.thumbnail.warn(`读取现有缩略图失败，重新生成：${photoId}`, error);
      // 继续执行生成逻辑
    }
  }

  // 生成新的缩略图和 blurhash
  const result = await generateThumbnailAndBlurhash(
    imageBuffer,
    photoId,
    options.isForceMode || options.isForceThumbnails,
  );

  // 生成失败时不要伪造非空断言：返回 null，让上层把该照片标记为失败并跳过，
  // 绝不向 manifest 写入 thumbnailUrl: null（否则会污染 manifest 并导致后续构建在
  // assertManifest 阶段直接抛错、永久失败）。
  if (!result.thumbnailUrl || !result.thumbnailBuffer) {
    loggers.thumbnail.error(
      `缩略图生成失败，跳过该照片（不写入 manifest）：${photoId}`,
    );
    return null;
  }

  return {
    thumbnailUrl: result.thumbnailUrl,
    thumbnailBuffer: result.thumbnailBuffer,
    thumbHash: result.thumbHash,
  };
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
): Promise<PickedExif | null> {
  const loggers = getPhotoProcessingLoggers();

  // 检查是否可以复用现有数据
  if (!options.isForceMode && !options.isForceManifest && existingItem?.exif) {
    const photoId = path.basename(photoKey, path.extname(photoKey));
    loggers.exif.info(`复用现有 EXIF 数据：${photoId}`);
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
  sharpInstance: sharp.Sharp,
  photoKey: string,
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
): Promise<ToneAnalysis | null> {
  const loggers = getPhotoProcessingLoggers();

  // 检查是否可以复用现有数据
  if (
    !options.isForceMode &&
    !options.isForceManifest &&
    existingItem?.toneAnalysis
  ) {
    const photoId = path.basename(photoKey, path.extname(photoKey));
    loggers.tone.info(`复用现有影调分析：${photoId}`);
    return existingItem.toneAnalysis;
  }

  // 计算新的影调分析
  return await calculateHistogramAndAnalyzeTone(sharpInstance);
}
