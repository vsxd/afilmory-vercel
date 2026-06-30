import fs from "node:fs/promises";
import path, { basename } from "node:path";

import { createManifest, parseManifestLenient } from "@afilmory/schema";

import { logger } from "../logger/index.js";
import { getScopedBuilderOutputSettings } from "../output-paths.js";
import type { StorageObject } from "../storage/interfaces.js";
import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
  ManifestSource,
} from "../types/manifest.js";
import type { PhotoManifestItem } from "../types/photo.js";
import { writeFileAtomic } from "../utils/atomic-write.js";

export async function loadExistingManifest(): Promise<AfilmoryManifest> {
  const { manifestPath } = getScopedBuilderOutputSettings();
  let manifestContent: string;

  try {
    manifestContent = await fs.readFile(manifestPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(
        `读取 manifest 失败：${manifestPath} - ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    logger.fs.error("🔍 未找到 manifest 文件，创建新的 manifest 文件...");
    await saveManifest([]);
    return createManifest();
  }

  try {
    const parsed = JSON.parse(manifestContent);
    // 宽松解析：个别照片字段损坏只跳过该张（增量构建会把它当作新照片重新处理），
    // 而不是让 assertManifest 抛错——否则一条坏记录会让此后每次构建都在解析阶段
    // 永久失败，直到有人手动删 manifest（见 atomic-write.ts / data-processors.ts 注释）。
    const { manifest, skipped } = parseManifestLenient(parsed);
    if (skipped.length > 0) {
      logger.fs.warn(
        `⚠️  已有 manifest 中有 ${skipped.length} 条无效照片记录，已跳过（将重新处理）：${skipped
          .map((entry) => `#${entry.index}`)
          .join(", ")}`,
      );
    }
    return manifest;
  } catch (error) {
    // 顶层结构损坏（schema/version/source/indexes/photos 非数组）：丢弃缓存做全量重建，
    // 而不是永久抛错卡死整条构建流水线。
    logger.fs.error(
      `⚠️  已有 manifest 顶层结构无效，丢弃缓存并全量重建：${manifestPath} - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await saveManifest([]);
    return createManifest();
  }
}

// 检查照片是否需要更新（基于最后修改时间、大小和可用 ETag）
export function needsUpdate(
  existingItem: PhotoManifestItem | undefined,
  object: StorageObject,
): boolean {
  if (!existingItem) return true;
  if (!object.lastModified) return true;

  const existingModified = new Date(existingItem.lastModified);
  const s3Modified = object.lastModified;
  const modifiedChanged = s3Modified > existingModified;
  const sizeChanged =
    typeof existingItem.size === "number" &&
    typeof object.size === "number" &&
    existingItem.size !== object.size;
  const etagChanged = Boolean(
    existingItem.etag && object.etag && existingItem.etag !== object.etag,
  );

  return modifiedChanged || sizeChanged || etagChanged;
}

// 保存 manifest
export async function saveManifest(
  items: PhotoManifestItem[],
  cameras: CameraInfo[] = [],
  lenses: LensInfo[] = [],
  source?: ManifestSource,
): Promise<void> {
  const { manifestPath } = getScopedBuilderOutputSettings();
  // 按日期排序（最新的在前）
  const sortedManifest = [...items].sort(
    (a, b) => new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime(),
  );

  await writeFileAtomic(
    manifestPath,
    JSON.stringify(
      createManifest({
        photos: sortedManifest,
        indexes: { cameras, lenses },
        source: source ?? { provider: "unknown" },
      }),
      null,
      2,
    ),
  );

  logger.fs.info(`📁 Manifest 保存至： ${manifestPath}`);
  logger.fs.info(
    `📷 包含 ${cameras.length} 个相机，🔍 ${lenses.length} 个镜头`,
  );
}

// 检测并处理已删除的图片
export async function handleDeletedPhotos(
  items: PhotoManifestItem[],
): Promise<number> {
  const { thumbnailsDir } = getScopedBuilderOutputSettings();
  logger.main.info("🔍 检查已删除的图片...");
  if (items.length === 0) {
    // Clear all thumbnails
    await fs.rm(thumbnailsDir, { recursive: true, force: true });
    logger.main.info("🔍 没有图片，清空缩略图...");
    return 0;
  }

  let deletedCount = 0;
  const allThumbnails = await fs
    .readdir(thumbnailsDir)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        logger.main.info("📁 缩略图目录不存在，跳过删除检查");
        return [];
      }
      throw error;
    });

  // If thumbnails not in manifest, delete it
  const manifestKeySet = new Set(items.map((item) => item.id));

  for (const thumbnail of allThumbnails) {
    if (!manifestKeySet.has(basename(thumbnail, ".jpg"))) {
      await fs.unlink(path.join(thumbnailsDir, thumbnail));
      deletedCount++;
    }
  }

  return deletedCount;
}
