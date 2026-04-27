import { thumbnailExists } from '../image/thumbnail.js'
import { needsUpdate } from '../manifest/manager.js'
import type { PhotoManifestItem } from '../types/photo.js'
import type { PhotoProcessorOptions } from './processor.js'

export interface CacheableData {
  thumbnail?: {
    thumbnailUrl: string
    thumbnailBuffer: Buffer
    blurhash: string
  }
  exif?: any
  toneAnalysis?: any
}

/**
 * 检查是否需要处理照片
 * 考虑文件更新状态和缓存存在性
 */
export async function shouldProcessPhoto(
  photoId: string,
  existingItem: PhotoManifestItem | undefined,
  obj: { Key?: string; LastModified?: Date; Size?: number; ETag?: string },
  options: PhotoProcessorOptions,
): Promise<{ shouldProcess: boolean; reason: string }> {
  // 强制模式下总是处理
  if (options.isForceMode) {
    return { shouldProcess: true, reason: '强制模式' }
  }

  // 新照片总是需要处理
  if (!existingItem) {
    return { shouldProcess: true, reason: '新照片' }
  }

  // Keep this predicate in sync with task filtering so same-timestamp
  // size/etag changes do not enter the worker and then get skipped.
  const fileNeedsUpdate = needsUpdate(existingItem, {
    Key: obj.Key,
    LastModified: obj.LastModified,
    Size: obj.Size,
    ETag: obj.ETag,
  })

  if (fileNeedsUpdate || options.isForceManifest) {
    return {
      shouldProcess: true,
      reason: fileNeedsUpdate ? '文件已更新' : '强制更新清单',
    }
  }

  // 检查缩略图是否存在
  const hasThumbnail = await thumbnailExists(photoId)
  if (!hasThumbnail || options.isForceThumbnails) {
    return {
      shouldProcess: true,
      reason: options.isForceThumbnails ? '强制重新生成缩略图' : '缩略图缺失',
    }
  }

  return { shouldProcess: false, reason: '无需处理' }
}

/**
 * 检查缓存数据的完整性
 */
export function validateCacheData(
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
): {
  needsThumbnail: boolean
  needsExif: boolean
  needsToneAnalysis: boolean
} {
  if (!existingItem) {
    return {
      needsThumbnail: true,
      needsExif: true,
      needsToneAnalysis: true,
    }
  }

  return {
    needsThumbnail: options.isForceMode || options.isForceThumbnails || !existingItem.thumbHash,
    needsExif: options.isForceMode || options.isForceManifest || !existingItem.exif,
    needsToneAnalysis: options.isForceMode || options.isForceManifest || !existingItem.toneAnalysis,
  }
}
