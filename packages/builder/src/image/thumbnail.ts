import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import type { ThumbnailResult } from "../photo/data-processors.js";
import { getPhotoExecutionContext } from "../photo/execution-context.js";
import { getPhotoProcessingLoggers } from "../photo/logger-adapter.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import {
  THUMBNAIL_ENCODING_SIGNATURE,
  THUMBNAIL_ENCODING_VERSION,
  THUMBNAIL_QUALITY,
  THUMBNAIL_WIDTH,
} from "./encoding-signature.js";
import { SOURCE_SHARP_OPTIONS } from "./sharp-options.js";
import { generateThumbHash } from "./thumbhash.js";

export {
  THUMBNAIL_ENCODING_SIGNATURE,
  THUMBNAIL_ENCODING_VERSION,
} from "./encoding-signature.js";

const ENCODING_MARKER_FILENAME = ".encoding";

export async function isThumbnailEncodingStale(
  thumbnailsDir: string,
): Promise<boolean> {
  try {
    const marker = await fs.readFile(
      path.join(thumbnailsDir, ENCODING_MARKER_FILENAME),
      "utf-8",
    );
    return marker.trim() !== THUMBNAIL_ENCODING_SIGNATURE;
  } catch (error) {
    // 无标记：目录里既有缩略图的生成参数未知（老缓存），视为过期。
    // 全新空目录也走这条——强制与否等价（每张都按缺失生成），无副作用。
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    // Permission/type/I/O failures are not evidence of a stale marker. Fail
    // before regenerating and committing a manifest that cannot be paired
    // with a valid marker.
    throw error;
  }
}

export async function writeThumbnailEncodingMarker(
  thumbnailsDir: string,
): Promise<void> {
  await writeFileAtomic(
    path.join(thumbnailsDir, ENCODING_MARKER_FILENAME),
    `${THUMBNAIL_ENCODING_SIGNATURE}\n`,
  );
}

export function createThumbnailFileName(
  photoId: string,
  thumbnailBuffer: Uint8Array,
): string {
  const contentHash = crypto
    .createHash("sha256")
    .update(thumbnailBuffer)
    .digest("hex");
  return `${photoId}.${contentHash}.${THUMBNAIL_ENCODING_VERSION}.jpg`;
}

export function getThumbnailPublicUrl(
  photoId: string,
  thumbnailBuffer?: Uint8Array,
): string {
  const filename = thumbnailBuffer
    ? createThumbnailFileName(photoId, thumbnailBuffer)
    : `${photoId}.jpg`;
  return getThumbnailPublicUrlForFileName(filename);
}

export function getThumbnailPublicUrlForFileName(fileName: string): string {
  return `/thumbnails/${encodeURIComponent(fileName)}`;
}

export function getThumbnailFileNameFromUrl(
  thumbnailUrl: string,
): string | null {
  try {
    const { pathname } = new URL(thumbnailUrl, "https://afilmory.invalid");
    const encodedName = pathname.slice(pathname.lastIndexOf("/") + 1);
    if (!encodedName) return null;
    const fileName = decodeURIComponent(encodedName);
    return fileName.includes("/") || fileName.includes("\\") ? null : fileName;
  } catch {
    return null;
  }
}

export function isThumbnailFileNameForPhoto(
  fileName: string,
  photoId: string,
): boolean {
  if (fileName === `${photoId}.jpg`) return true;
  if (!fileName.startsWith(`${photoId}.`) || !fileName.endsWith(".jpg")) {
    return false;
  }
  const suffix = fileName.slice(photoId.length + 1, -4);
  const [contentHash, encodingVersion, ...extra] = suffix.split(".");
  return (
    extra.length === 0 &&
    /^[\da-f]{64}$/i.test(contentHash ?? "") &&
    /^[\da-f]{12}$/i.test(encodingVersion ?? "")
  );
}

export function getThumbnailPhotoIdFromFileName(
  fileName: string,
): string | null {
  const addressed = fileName.match(/^(.*)\.[\da-f]{64}\.[\da-f]{12}\.jpg$/i);
  if (addressed?.[1]) return addressed[1];
  return fileName.endsWith(".jpg") ? fileName.slice(0, -4) : null;
}

export interface ExistingThumbnail {
  fileName: string;
  path: string;
  url: string;
}

export interface ThumbnailInventory {
  has: (photoId: string, preferredUrl?: string) => boolean;
}

/** Snapshot the thumbnail directory once for the planning phase. */
export async function createThumbnailInventory(
  thumbnailsDir: string,
): Promise<ThumbnailInventory> {
  const entries = await fs
    .readdir(thumbnailsDir, { withFileTypes: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
  const safeFileNames = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );
  const countsByPhotoId = new Map<string, number>();
  for (const fileName of safeFileNames) {
    const photoId = getThumbnailPhotoIdFromFileName(fileName);
    if (!photoId) continue;
    countsByPhotoId.set(photoId, (countsByPhotoId.get(photoId) ?? 0) + 1);
  }

  return {
    has(photoId, preferredUrl) {
      const preferredName = preferredUrl
        ? getThumbnailFileNameFromUrl(preferredUrl)
        : null;
      if (
        preferredName &&
        isThumbnailFileNameForPhoto(preferredName, photoId)
      ) {
        // An identifiable published artifact must exist exactly. An older
        // version is not evidence that the URL retained by a skipped build
        // still resolves, even when it is the only cached file for this photo.
        return safeFileNames.has(preferredName);
      }
      if (safeFileNames.has(`${photoId}.jpg`)) return true;
      // A rewritten CDN basename is reusable only when exactly one local
      // artifact belongs to this photo; multiple versions are ambiguous.
      return countsByPhotoId.get(photoId) === 1;
    },
  };
}

async function isSafeRegularThumbnail(thumbnailPath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(thumbnailPath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

/** Resolve both legacy `<id>.jpg` and content-addressed thumbnail caches. */
export async function resolveExistingThumbnail(
  photoId: string,
  thumbnailsDir: string,
  preferredUrl?: string,
): Promise<ExistingThumbnail | null> {
  const preferredName = preferredUrl
    ? getThumbnailFileNameFromUrl(preferredUrl)
    : null;
  // A missing known artifact must be regenerated from source. Reusing an old
  // addressed/legacy file would silently restore pixels from another version.
  // The fallback below applies only when the CDN hides the original basename.
  if (
    preferredUrl &&
    preferredName &&
    isThumbnailFileNameForPhoto(preferredName, photoId)
  ) {
    const thumbnailPath = path.join(thumbnailsDir, preferredName);
    return (await isSafeRegularThumbnail(thumbnailPath))
      ? { fileName: preferredName, path: thumbnailPath, url: preferredUrl }
      : null;
  }
  const candidates = [preferredName, `${photoId}.jpg`].filter(
    (candidate, index, all): candidate is string =>
      Boolean(candidate) &&
      all.indexOf(candidate) === index &&
      isThumbnailFileNameForPhoto(candidate!, photoId),
  );

  // Remote thumbnail URLs normally retain the local content-addressed basename,
  // so this is the O(1) path for both local and remote thumbnail storage.
  for (const fileName of candidates) {
    const thumbnailPath = path.join(thumbnailsDir, fileName);
    if (await isSafeRegularThumbnail(thumbnailPath)) {
      return {
        fileName,
        path: thumbnailPath,
        url:
          preferredUrl && fileName === preferredName
            ? preferredUrl
            : getThumbnailPublicUrlForFileName(fileName),
      };
    }
  }

  // A custom remote CDN may rewrite the basename. Discover a local addressed
  // artifact as a fallback. If cleanup was interrupted, multiple versions can
  // coexist and neither lexical hash order nor mtime proves which one matches
  // the manifest. Treat that ambiguity as a cache miss so the caller rebuilds
  // from the source image instead of silently reusing arbitrary pixels.
  try {
    const entries = await fs.readdir(thumbnailsDir);
    const matchingNames = entries.filter((entry) =>
      isThumbnailFileNameForPhoto(entry, photoId),
    );
    const safeNames = (
      await Promise.all(
        matchingNames.map(async (fileName) => ({
          fileName,
          safe: await isSafeRegularThumbnail(
            path.join(thumbnailsDir, fileName),
          ),
        })),
      )
    ).filter(({ safe }) => safe);
    const fileName =
      safeNames.length === 1 ? safeNames[0]?.fileName : undefined;
    return fileName
      ? {
          fileName,
          path: path.join(thumbnailsDir, fileName),
          url: getThumbnailPublicUrlForFileName(fileName),
        }
      : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// 创建成功结果
function createSuccessResult(
  thumbnailUrl: string,
  thumbnailBuffer: Buffer,
  thumbHash: Uint8Array | null,
): ThumbnailResult {
  return {
    thumbnailUrl,
    thumbnailBuffer,
    thumbHash,
  };
}

// 确保缩略图目录存在
async function ensureThumbnailDir(): Promise<void> {
  const { thumbnailsDir } = getPhotoExecutionContext().output;
  await fs.mkdir(thumbnailsDir, { recursive: true });
}

// 检查缩略图是否存在。
// 目录显式传参：这是唯一同时被两种作用域调用的函数——DiffPlanner 在主进程
// 规划阶段（无照片上下文，取 session.config.output）与照片管道内（取
// 上下文 output）都要用它。
export async function thumbnailExists(
  photoId: string,
  thumbnailsDir: string,
  preferredUrl?: string,
): Promise<boolean> {
  return Boolean(
    await resolveExistingThumbnail(photoId, thumbnailsDir, preferredUrl),
  );
}

// 读取现有缩略图并生成 thumbhash
async function processExistingThumbnail(
  photoId: string,
  preferredUrl?: string,
): Promise<ThumbnailResult | null> {
  const existing = await resolveExistingThumbnail(
    photoId,
    getPhotoExecutionContext().output.thumbnailsDir,
    preferredUrl,
  );
  if (!existing) return null;

  const thumbnailLog = getPhotoProcessingLoggers().thumbnail;
  thumbnailLog.info(`Reusing existing thumbnail: ${photoId}`);

  try {
    const existingBuffer = await fs.readFile(existing.path);
    const thumbHash = await generateThumbHash(existingBuffer);

    return createSuccessResult(existing.url, existingBuffer, thumbHash);
  } catch (error) {
    thumbnailLog?.warn(
      `Failed to read existing thumbnail, regenerating: ${photoId}`,
      error,
    );
    return null;
  }
}

// 生成新的缩略图（失败返回 null）
async function generateNewThumbnail(
  imageBuffer: Buffer,
  photoId: string,
): Promise<ThumbnailResult | null> {
  const log = getPhotoProcessingLoggers().thumbnail;
  log.info(`Generating thumbnail: ${photoId}`);
  const startTime = Date.now();

  try {
    // 创建 Sharp 实例，复用于缩略图和 thumbhash 生成
    const sharpInstance = sharp(imageBuffer, SOURCE_SHARP_OPTIONS).rotate(); // 自动根据 EXIF 旋转

    // 生成缩略图
    const thumbnailBuffer = await sharpInstance
      .clone() // 克隆实例用于缩略图生成
      .resize(THUMBNAIL_WIDTH, null, {
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true })
      .toBuffer();

    const fileName = createThumbnailFileName(photoId, thumbnailBuffer);
    const thumbnailPath = path.join(
      getPhotoExecutionContext().output.thumbnailsDir,
      fileName,
    );
    const thumbnailUrl = getThumbnailPublicUrlForFileName(fileName);

    // 原子落盘：普通 writeFile 中途被杀会留下截断的 .jpg，增量路径此后会
    // 永远复用这张坏图（thumbnailExists 只看存在性，不看完整性）。
    await writeFileAtomic(thumbnailPath, thumbnailBuffer);

    // 记录生成信息
    const duration = Date.now() - startTime;
    const sizeKB = Math.round(thumbnailBuffer.length / 1024);
    log.success(`Generated: ${photoId} (${sizeKB}KB, ${duration}ms)`);

    // 基于生成的缩略图生成 thumbhash
    const thumbHash = await generateThumbHash(thumbnailBuffer);

    return createSuccessResult(thumbnailUrl, thumbnailBuffer, thumbHash);
  } catch (error) {
    log.error(`Generation failed: ${photoId}`, error);
    return null;
  }
}

// 生成缩略图和 thumbhash（复用 Sharp 实例）。失败返回 null——
// 这是唯一的失败编码，调用方据此把整张照片标记为失败并跳过。
export async function generateThumbnailAndThumbHash(
  imageBuffer: Buffer,
  photoId: string,
  forceRegenerate = false,
  preferredUrl?: string,
): Promise<ThumbnailResult | null> {
  const thumbnailLog = getPhotoProcessingLoggers().thumbnail;

  try {
    await ensureThumbnailDir();

    // 如果不是强制模式且缩略图已存在，尝试复用现有文件
    if (
      !forceRegenerate &&
      (await thumbnailExists(
        photoId,
        getPhotoExecutionContext().output.thumbnailsDir,
        preferredUrl,
      ))
    ) {
      const existingResult = await processExistingThumbnail(
        photoId,
        preferredUrl,
      );

      if (existingResult) {
        return existingResult;
      }
      // 如果处理现有缩略图失败，继续生成新的
    }

    // 生成新的缩略图
    return await generateNewThumbnail(imageBuffer, photoId);
  } catch (error) {
    thumbnailLog.error(`Processing failed: ${photoId}`, error);
    return null;
  }
}
