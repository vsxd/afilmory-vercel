import type { StorageManager } from "../storage/index.js";
import type { StorageObject } from "../storage/interfaces.js";
import { getPhotoProcessingLoggers } from "./logger-adapter.js";

export interface LivePhotoResult {
  isLivePhoto: boolean;
  livePhotoVideoUrl?: string;
  livePhotoVideoS3Key?: string;
}

/**
 * 检测并处理 Live Photo
 * @param photoKey 照片的 S3 key
 * @param livePhotoMap Live Photo 映射表
 * @param storageManager 存储管理器，用于生成公共访问链接
 * @returns Live Photo 处理结果
 */
export async function processLivePhoto(
  photoKey: string,
  livePhotoMap: Map<string, StorageObject>,
  storageManager: StorageManager,
): Promise<LivePhotoResult> {
  const loggers = getPhotoProcessingLoggers();
  const livePhotoVideo = livePhotoMap.get(photoKey);
  const isLivePhoto = !!livePhotoVideo;

  if (!isLivePhoto) {
    return { isLivePhoto: false };
  }

  const videoKey = livePhotoVideo.key;
  if (!videoKey) {
    return { isLivePhoto: false };
  }

  const livePhotoVideoUrl = await storageManager.generatePublicUrl(videoKey);

  loggers.image.info(`📱 检测到 Live Photo：${photoKey} -> ${videoKey}`);

  return {
    isLivePhoto: true,
    livePhotoVideoUrl,
    livePhotoVideoS3Key: videoKey,
  };
}

/**
 * 创建 Live Photo 映射表
 * 根据文件名匹配 Live Photo 的照片和视频文件
 * @param objects 存储对象列表
 * @returns Live Photo 映射表
 */
export function createLivePhotoMap(
  objects: StorageObject[],
): Map<string, StorageObject>;

export function createLivePhotoMap(
  objects: StorageObject[],
): Map<string, StorageObject> {
  const livePhotoMap = new Map<string, StorageObject>();

  // 分离照片和视频文件
  const photos: StorageObject[] = [];
  const videos: StorageObject[] = [];

  for (const obj of objects) {
    const { key } = obj;
    if (!key) continue;

    const ext = key.toLowerCase().split(".").pop();
    if (ext && ["jpg", "jpeg", "heic", "heif", "png", "webp"].includes(ext)) {
      photos.push(obj);
    } else if (ext && ["mov", "mp4"].includes(ext)) {
      videos.push(obj);
    }
  }

  // 匹配 Live Photo
  for (const photo of photos) {
    const photoKey = photo.key;
    if (!photoKey) continue;

    const photoBaseName = photoKey.replace(/\.[^/.]+$/, "");

    // 查找对应的视频文件
    const matchingVideo = videos.find((video) => {
      const videoKey = video.key;
      if (!videoKey) return false;
      const videoBaseName = videoKey.replace(/\.[^/.]+$/, "");
      return videoBaseName === photoBaseName;
    });

    if (matchingVideo) {
      livePhotoMap.set(photoKey, matchingVideo);
    }
  }

  return livePhotoMap;
}
