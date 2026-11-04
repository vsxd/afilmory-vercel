import type { PhotoProcessorOptions } from "../core/contracts/photo-processing.js";
import { displayImagesExist } from "../image/display-images.js";
import { thumbnailExists } from "../image/thumbnail.js";
import { needsUpdate } from "../manifest/manager.js";
import type { StorageObject } from "../storage/interfaces.js";
import type { PhotoManifestItem } from "../types/photo.js";
import { getPhotoExecutionContext } from "./execution-context.js";
import { hasStaleCoreProcessingStages } from "./processing-fingerprints.js";

export interface PhotoWorkDecision {
  shouldProcess: boolean;
  reason: string;
}

/**
 * 判断一张照片是否需要重新处理（new / needsUpdate / 缩略图缺失 / force 级联）。
 *
 * 这是 DiffPlanner（基于存储列表做任务过滤）和 worker 侧
 * shouldProcessPhoto（按任务重新检查）共享的唯一判定实现：
 * 两处必须使用同一谓词，否则 same-timestamp 的 size/etag 变更
 * 会进入 worker 后又被跳过（或反过来永远不进队列）。
 *
 * @param hasThumbnail 惰性提供缩略图存在性；只有在前置检查都未命中时才会被调用，
 *                     调用方因此可以把 photoId 计算和存储探测都推迟到这里。
 */
export async function decidePhotoWork(
  existingItem: PhotoManifestItem | undefined,
  obj: StorageObject,
  options: PhotoProcessorOptions,
  hasThumbnail: () => boolean | Promise<boolean>,
  hasDisplayImages: () => boolean | Promise<boolean> = () => true,
): Promise<PhotoWorkDecision> {
  // 强制模式下总是处理
  if (options.isForceMode) {
    return { shouldProcess: true, reason: "force mode" };
  }

  if (
    options.reprocessKeySet?.has(obj.key) ||
    (!options.reprocessKeySet && options.reprocessKeys?.includes(obj.key))
  ) {
    return { shouldProcess: true, reason: "repaired manifest cache" };
  }

  if (options.derivedReprocessKeySet?.has(obj.key)) {
    return { shouldProcess: true, reason: "derived processing changed" };
  }

  // 新照片总是需要处理
  if (!existingItem) {
    return { shouldProcess: true, reason: "new photo" };
  }

  if (options.plannedKeys?.has(obj.key)) {
    return { shouldProcess: true, reason: "preplanned work" };
  }

  const fileNeedsUpdate = needsUpdate(existingItem, obj);

  if (fileNeedsUpdate || options.isForceManifest) {
    return {
      shouldProcess: true,
      reason: fileNeedsUpdate ? "file updated" : "force update manifest",
    };
  }

  if (hasStaleCoreProcessingStages(existingItem, options.locationMode)) {
    return { shouldProcess: true, reason: "processing fingerprint changed" };
  }

  // Force-thumbnails must short-circuit before any filesystem probe.
  if (options.isForceThumbnails) {
    return {
      shouldProcess: true,
      reason: "force regenerate thumbnail",
    };
  }

  // 检查缩略图是否存在
  const thumbnailPresent = await hasThumbnail();
  if (!thumbnailPresent) {
    return {
      shouldProcess: true,
      reason: "thumbnail missing",
    };
  }

  if (!(await hasDisplayImages())) {
    return { shouldProcess: true, reason: "display image missing" };
  }

  return { shouldProcess: false, reason: "no processing needed" };
}

/**
 * 照片管道（worker 侧）对 decidePhotoWork 的绑定：缩略图存在性从照片
 * 执行上下文读取。DiffPlanner 在主进程规划阶段没有照片上下文，
 * 用显式的 session 输出目录直接调用 decidePhotoWork。
 */
export async function shouldProcessPhoto(
  photoId: string,
  existingItem: PhotoManifestItem | undefined,
  obj: StorageObject,
  options: PhotoProcessorOptions,
): Promise<PhotoWorkDecision> {
  return decidePhotoWork(
    existingItem,
    obj,
    options,
    () =>
      thumbnailExists(
        photoId,
        getPhotoExecutionContext().output.thumbnailsDir,
        existingItem?.thumbnailUrl,
      ),
    () =>
      displayImagesExist(
        photoId,
        existingItem?.displayImages,
        getPhotoExecutionContext().output.thumbnailsDir,
      ),
  );
}
