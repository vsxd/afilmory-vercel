import { thumbnailExists } from "../../image/thumbnail.js";
import { logger } from "../../logger/index.js";
import { needsUpdate } from "../../manifest/manager.js";
import { findPhotoIdCollisionKeys } from "../../photo/id.js";
import type { StorageObject } from "../../storage/interfaces.js";
import type { PhotoManifestItem } from "../../types/photo.js";
import type { BuildSession } from "./session.js";

export interface DiffPlan {
  s3ImageKeys: Set<string>;
  tasksToProcess: StorageObject[];
}

export class DiffPlanner {
  async plan(
    session: BuildSession,
    imageObjects: StorageObject[],
    existingManifestMap: Map<string, PhotoManifestItem>,
  ): Promise<DiffPlan> {
    const { options } = session;

    session.setPhotoIdCollisionKeys(
      findPhotoIdCollisionKeys(imageObjects.map((obj) => obj.key)),
    );

    const collisionKeys = session.getPhotoIdCollisionKeys();
    if (collisionKeys.size > 0) {
      logger.main.warn(
        `检测到 ${collisionKeys.size} 张跨目录同名照片，将为这些照片 ID 添加路径摘要后缀以避免冲突`,
      );
    }

    await session.emit("afterImagesListed", {
      options,
      imageObjects,
    });

    const s3ImageKeys = new Set(imageObjects.map((obj) => obj.key));
    const tasksToProcess = this.sortByWorkCost(
      await this.filterTaskImages(session, imageObjects, existingManifestMap),
    );

    await session.emit("afterTasksPrepared", {
      options,
      tasks: tasksToProcess,
      totalImages: imageObjects.length,
    });

    logger.main.info(
      `存储中找到 ${imageObjects.length} 张照片，实际需要处理 ${tasksToProcess.length} 张`,
    );

    return {
      s3ImageKeys,
      tasksToProcess,
    };
  }

  private async filterTaskImages(
    session: BuildSession,
    imageObjects: StorageObject[],
    existingManifestMap: Map<string, PhotoManifestItem>,
  ): Promise<StorageObject[]> {
    const { options } = session;

    if (options.isForceMode || options.isForceManifest) {
      return imageObjects;
    }

    const tasksToProcess: StorageObject[] = [];

    for (const obj of imageObjects) {
      const { key } = obj;
      const existingItem = existingManifestMap.get(key);
      const photoId = session.getPhotoIdForKey(key, existingItem);

      if (!existingItem) {
        tasksToProcess.push(obj);
        continue;
      }

      if (
        needsUpdate(existingItem, {
          Key: key,
          Size: obj.size,
          LastModified: obj.lastModified,
          ETag: obj.etag,
        })
      ) {
        tasksToProcess.push(obj);
        continue;
      }

      const hasThumbnail = await thumbnailExists(photoId);
      if (!hasThumbnail || options.isForceThumbnails) {
        tasksToProcess.push(obj);
      }
    }

    return tasksToProcess;
  }

  private sortByWorkCost(tasks: StorageObject[]): StorageObject[] {
    if (tasks.length <= 1) {
      return tasks;
    }

    const beforeFirst = tasks[0]?.key;
    const sorted = [...tasks].sort((a, b) => (b.size ?? 0) - (a.size ?? 0));

    if (beforeFirst !== sorted[0]?.key) {
      logger.main.info("已按文件大小降序重排处理队列");
    }

    return sorted;
  }
}
