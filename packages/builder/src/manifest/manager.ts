import fs from "node:fs/promises";
import path from "node:path";

import {
  assertManifest,
  createManifest,
  parseManifestLenient,
} from "@afilmory/schema";

import {
  getThumbnailFileNameFromUrl,
  getThumbnailPhotoIdFromFileName,
  isThumbnailFileNameForPhoto,
} from "../image/thumbnail.js";
import { logger } from "../logger/index.js";
import type { BuilderOutputSettings } from "../output-paths.js";
import type { StorageObject } from "../storage/interfaces.js";
import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
  ManifestSource,
} from "../types/manifest.js";
import type { PhotoManifestItem } from "../types/photo.js";
import { writeFileAtomic } from "../utils/atomic-write.js";

export async function loadExistingManifest(
  output: BuilderOutputSettings,
): Promise<AfilmoryManifest> {
  return (await loadExistingManifestWithDiagnostics(output)).manifest;
}

export interface ExistingManifestLoadResult {
  manifest: AfilmoryManifest;
  /** Normalized cached entries that must not take the incremental skip path. */
  repairedPhotoKeys: ReadonlySet<string>;
  /** The on-disk JSON was recoverable but differs from the normalized form. */
  requiresRewrite: boolean;
}

export async function loadExistingManifestWithDiagnostics(
  output: BuilderOutputSettings,
): Promise<ExistingManifestLoadResult> {
  const { manifestPath } = output;
  let manifestContent: string;

  try {
    manifestContent = await fs.readFile(manifestPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(
        `Failed to read manifest: ${manifestPath} - ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    logger.fs.info("🔍 Manifest file not found; starting with an empty cache");
    return {
      manifest: createManifest(),
      repairedPhotoKeys: new Set(),
      requiresRewrite: false,
    };
  }

  try {
    const parsed = JSON.parse(manifestContent);
    // 宽松解析：个别照片字段损坏只跳过该张（增量构建会把它当作新照片重新处理），
    // 而不是让 assertManifest 抛错——否则一条坏记录会让此后每次构建都在解析阶段
    // 永久失败，直到有人手动删 manifest（见 atomic-write.ts / data-processors.ts 注释）。
    const { manifest, repaired, skipped } = parseManifestLenient(parsed);
    if (skipped.length > 0) {
      logger.fs.warn(
        `⚠️  The existing manifest has ${skipped.length} invalid photo records; skipped (will be reprocessed): ${skipped
          .map((entry) => `#${entry.index}`)
          .join(", ")}`,
      );
    }
    if (repaired.length > 0) {
      logger.fs.warn(
        `⚠️  The existing manifest has ${repaired.length} repaired photo record(s); they will be reprocessed instead of reused: ${repaired
          .map((entry) => `#${entry.index}`)
          .join(", ")}`,
      );
    }
    return {
      manifest,
      repairedPhotoKeys: new Set(repaired.map((entry) => entry.s3Key)),
      requiresRewrite: JSON.stringify(parsed) !== JSON.stringify(manifest),
    };
  } catch (error) {
    // 不可恢复的信封损坏（schema/version/generatedAt/photos 非数组或 JSON
    // 语法错误）：丢弃缓存做全量重建，而不是永久卡死流水线。source/indexes
    // 由宽松解析器归一化，并通过 requiresRewrite 在健康扫描后写回。
    logger.fs.error(
      `⚠️  The existing manifest has an invalid top-level structure; discarding the cache and doing a full rebuild: ${manifestPath} - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {
      manifest: createManifest(),
      repairedPhotoKeys: new Set(),
      requiresRewrite: true,
    };
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
export interface SaveManifestOptions {
  /** Preserve generatedAt and skip the write when the candidate is identical. */
  previousManifest?: AfilmoryManifest;
  /** Persist a recovered/normalized manifest even if its semantic data matches. */
  forceWrite?: boolean;
}

export interface SaveManifestResult {
  manifest: AfilmoryManifest;
  written: boolean;
}

function createValidatedManifest(
  items: PhotoManifestItem[],
  cameras: CameraInfo[],
  lenses: LensInfo[],
  source: ManifestSource | undefined,
  generatedAt: string,
): AfilmoryManifest {
  const sortedManifest = [...items].sort(
    (a, b) => new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime(),
  );
  return assertManifest(
    createManifest({
      generatedAt,
      photos: sortedManifest,
      indexes: { cameras, lenses },
      source: source ?? { provider: "unknown" },
    }),
  );
}

export async function saveManifest(
  output: BuilderOutputSettings,
  items: PhotoManifestItem[],
  cameras: CameraInfo[] = [],
  lenses: LensInfo[] = [],
  source?: ManifestSource,
  options: SaveManifestOptions = {},
): Promise<SaveManifestResult> {
  const { manifestPath } = output;
  const previousGeneratedAt = options.previousManifest?.generatedAt;
  const comparisonCandidate = createValidatedManifest(
    items,
    cameras,
    lenses,
    source,
    previousGeneratedAt ?? new Date().toISOString(),
  );
  const contentUnchanged = Boolean(
    options.previousManifest &&
    JSON.stringify(comparisonCandidate) ===
      JSON.stringify(options.previousManifest),
  );
  const destinationExists = await fs
    .access(manifestPath)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });

  if (contentUnchanged && destinationExists && !options.forceWrite) {
    logger.fs.info(`📁 Manifest unchanged; preserving: ${manifestPath}`);
    return { manifest: comparisonCandidate, written: false };
  }

  const manifest = contentUnchanged
    ? comparisonCandidate
    : previousGeneratedAt
      ? createValidatedManifest(
          items,
          cameras,
          lenses,
          source,
          new Date().toISOString(),
        )
      : comparisonCandidate;

  await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2));

  logger.fs.info(`📁 Manifest saved to: ${manifestPath}`);
  logger.fs.info(`📷 ${cameras.length} cameras, 🔍 ${lenses.length} lenses`);
  return { manifest, written: true };
}

// 检测并处理已删除的图片。
// keepPhotoIds：额外保留的照片 ID（通常是"存储中仍存在"的全集）。孤儿判定必须以
// "存储里已不存在"为准，而不是"不在本次 manifest 里"——本次处理失败的照片不进
// manifest，但它们的缩略图不能被连坐删除，否则一次网络故障（如批量下载超时）
// 会把可复用的缩略图全部清掉，再由 artifact-cache 把缩水状态持久化。
export async function handleDeletedPhotos(
  output: BuilderOutputSettings,
  items: PhotoManifestItem[],
  keepPhotoIds?: ReadonlySet<string>,
  previouslyPublishedPhotoIds: ReadonlySet<string> = new Set(),
): Promise<number> {
  const { thumbnailsDir } = output;
  const manifestIdSet = new Set(items.map((item) => item.id));
  const ownedPhotoIds = new Set([
    ...manifestIdSet,
    ...previouslyPublishedPhotoIds,
  ]);
  logger.main.info("🔍 Checking for deleted images...");
  if (items.length === 0 && (keepPhotoIds?.size ?? 0) === 0) {
    const entries = await fs
      .readdir(thumbnailsDir, { withFileTypes: true })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
    let deletedCount = 0;
    // Never recursively remove the configured directory. A typo such as
    // thumbnailsDir="." must not turn an empty first build into deletion of
    // unrelated project files. Only builder-owned top-level artifacts are
    // eligible; nested directories and unknown files remain untouched.
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      const isThumbnail = entry.name.endsWith(".jpg");
      const photoId = isThumbnail
        ? getThumbnailPhotoIdFromFileName(entry.name)
        : null;
      const isOwnedThumbnail = Boolean(photoId && ownedPhotoIds.has(photoId));
      const isOwnedMarker =
        entry.name === ".encoding" && ownedPhotoIds.size > 0;
      if (!isOwnedThumbnail && !isOwnedMarker) continue;
      await fs.unlink(path.join(thumbnailsDir, entry.name));
      if (isOwnedThumbnail) deletedCount++;
    }
    await fs.rmdir(thumbnailsDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
    });
    logger.main.info("🔍 No images; clearing thumbnails...");
    return deletedCount;
  }

  let deletedCount = 0;
  const allThumbnails = await fs
    .readdir(thumbnailsDir)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        logger.main.info(
          "📁 Thumbnail directory does not exist; skipping deletion check",
        );
        return [];
      }
      throw error;
    });

  // If thumbnails not in manifest, delete it
  const manifestExpectedFileNames = new Set<string>();
  const manifestIdsWithExpectedFile = new Set<string>();
  for (const item of items) {
    const fileName = getThumbnailFileNameFromUrl(item.thumbnailUrl);
    if (fileName && isThumbnailFileNameForPhoto(fileName, item.id)) {
      manifestExpectedFileNames.add(fileName);
      manifestIdsWithExpectedFile.add(item.id);
    }
  }

  for (const thumbnail of allThumbnails) {
    // 只清理 *.jpg 缩略图：目录里还住着 .encoding 编码签名标记（见 image/thumbnail.ts），
    // 误删它会在构建中途崩溃后触发下一次全量重生成缩略图，废掉 artifact-cache 增量路径。
    if (!thumbnail.endsWith(".jpg")) continue;
    const photoId = getThumbnailPhotoIdFromFileName(thumbnail);
    // Cleanup is allowed to remove only artifacts tied to the current or
    // previously published manifest. This makes a mispointed shared directory
    // fail safe: unrelated JPEGs are never inferred to be builder-owned merely
    // from their extension.
    if (!photoId || !ownedPhotoIds.has(photoId)) continue;
    const isExpected = manifestExpectedFileNames.has(thumbnail);
    const isFailedButStillStored = Boolean(
      photoId && !manifestIdSet.has(photoId) && keepPhotoIds?.has(photoId),
    );
    // If a CDN rewrote away the original basename we cannot identify the one
    // live local artifact reliably; keep that photo's files rather than risk
    // deleting the currently published thumbnail.
    const hasAmbiguousPublishedUrl = Boolean(
      photoId &&
      manifestIdSet.has(photoId) &&
      !manifestIdsWithExpectedFile.has(photoId),
    );
    if (!isExpected && !isFailedButStillStored && !hasAmbiguousPublishedUrl) {
      await fs.unlink(path.join(thumbnailsDir, thumbnail));
      deletedCount++;
    }
  }

  return deletedCount;
}
