import type { _Object } from "@aws-sdk/client-s3";

import type { StorageManager } from "../storage/index.js";
import type { StorageObject } from "../storage/interfaces.js";
import { getGlobalLoggers } from "./logger-adapter.js";

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
  livePhotoMap: Map<string, _Object | StorageObject>,
  storageManager: StorageManager,
): Promise<LivePhotoResult> {
  const loggers = getGlobalLoggers();
  const livePhotoVideo = livePhotoMap.get(photoKey);
  const isLivePhoto = !!livePhotoVideo;

  if (!isLivePhoto) {
    return { isLivePhoto: false };
  }

  // 处理不同类型的视频对象
  let videoKey: string;
  if ("Key" in livePhotoVideo && livePhotoVideo.Key) {
    // _Object 类型
    videoKey = livePhotoVideo.Key;
  } else if ("key" in livePhotoVideo && livePhotoVideo.key) {
    // StorageObject 类型
    videoKey = livePhotoVideo.key;
  } else {
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
 * 创建 Live Photo 映射表 (兼容 _Object 类型)
 * 根据文件名匹配 Live Photo 的照片和视频文件
 * @param objects S3 对象列表
 * @returns Live Photo 映射表
 */
export function createLivePhotoMap(objects: _Object[]): Map<string, _Object>;

/**
 * 创建 Live Photo 映射表 (兼容 StorageObject 类型)
 * 根据文件名匹配 Live Photo 的照片和视频文件
 * @param objects 存储对象列表
 * @returns Live Photo 映射表
 */
export function createLivePhotoMap(
  objects: StorageObject[],
): Map<string, StorageObject>;

export function createLivePhotoMap(
  objects: _Object[] | StorageObject[],
): Map<string, _Object | StorageObject> {
  const livePhotoMap = new Map<string, _Object | StorageObject>();

  // 分离照片和视频文件
  const photos: (_Object | StorageObject)[] = [];
  const videos: (_Object | StorageObject)[] = [];

  for (const obj of objects) {
    // 获取 key，兼容两种类型
    const key = "Key" in obj ? obj.Key : (obj as StorageObject).key;
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
    const photoKey = "Key" in photo ? photo.Key : (photo as StorageObject).key;
    if (!photoKey) continue;

    const photoBaseName = photoKey.replace(/\.[^/.]+$/, "");

    // 查找对应的视频文件
    const matchingVideo = videos.find((video) => {
      const videoKey =
        "Key" in video ? video.Key : (video as StorageObject).key;
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
