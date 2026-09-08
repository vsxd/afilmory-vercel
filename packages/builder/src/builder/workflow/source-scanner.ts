import type {
  StorageListing,
  StorageObject,
} from "../../storage/interfaces.js";
import { isSupportedImageKey } from "../../storage/supported-formats.js";
import type { BuildSession } from "./session.js";

export interface SourceScanResult {
  allObjects: StorageObject[];
  livePhotoMap: Map<string, StorageObject>;
  imageObjects: StorageObject[];
  complete: boolean;
  incompleteReason?: StorageListing["reason"];
}

type SourceScanContext = Pick<
  BuildSession,
  "config" | "options" | "emit" | "logger"
> & {
  storageManager: Pick<
    BuildSession["storageManager"],
    "listAllFilesDetailed" | "detectLivePhotos"
  >;
};

export class SourceScanner {
  async scan(session: SourceScanContext): Promise<SourceScanResult> {
    const { options, storageManager, logger } = session;

    const listing = await storageManager.listAllFilesDetailed();
    const allObjects = listing.objects;
    logger.main.info(`Found ${allObjects.length} files in storage`);

    if (!listing.complete) {
      logger.main.error(
        `Storage listing is incomplete; destructive reconciliation is disabled for this run${
          listing.reason?.message ? `: ${listing.reason.message}` : "."
        }`,
      );
      // A partial snapshot is diagnostic data, not a valid plugin lifecycle
      // input. Returning before hooks prevents third-party plugins from
      // treating omitted keys as deletions or performing partial backfills.
      return {
        allObjects,
        livePhotoMap: new Map(),
        imageObjects: [],
        complete: false,
        incompleteReason: listing.reason,
      };
    }

    await session.emit("afterAllFilesListed", {
      options,
      allObjects,
    });

    const livePhotoMap = await this.detectLivePhotos(session, allObjects);
    if (session.config.system.processing.enableLivePhotoDetection) {
      logger.main.info(`Detected ${livePhotoMap.size} Live Photos`);
    }

    await session.emit("afterLivePhotoDetection", {
      options,
      livePhotoMap,
    });

    // 从已获取的 allObjects 本地派生图片列表（共用 isSupportedImageKey 谓词），
    // 避免对存储桶做第二次全量 ListObjectsV2 分页；同时 allObjects 与 imageObjects
    // 观察到的是同一份桶快照，不会因两次列举之间的写入而彼此不一致。
    const imageObjects = allObjects.filter((object) =>
      isSupportedImageKey(
        object.key,
        session.config.system.processing.supportedFormats,
      ),
    );
    logger.main.info(`Found ${imageObjects.length} photos in storage`);

    return {
      allObjects,
      livePhotoMap,
      imageObjects,
      complete: listing.complete,
      incompleteReason: listing.reason,
    };
  }

  private async detectLivePhotos(
    session: SourceScanContext,
    allObjects: StorageObject[],
  ): Promise<Map<string, StorageObject>> {
    if (!session.config.system.processing.enableLivePhotoDetection) {
      return new Map();
    }

    return await session.storageManager.detectLivePhotos(allObjects);
  }
}
