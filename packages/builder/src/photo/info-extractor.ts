import path from "node:path";

import type { PhotoInfo, PickedExif } from "../types/photo.js";
import { getPhotoExecutionContext } from "./execution-context.js";
import { getPhotoProcessingLoggers } from "./logger-adapter.js";

// 从文件名提取照片信息
export function extractPhotoInfo(
  key: string,
  exifData?: PickedExif | null,
): PhotoInfo {
  const log = getPhotoProcessingLoggers().image;
  const { normalizeStorageKey } = getPhotoExecutionContext();

  log.info(`提取照片信息：${key}`);

  const sanitizedKey = key.replaceAll("\\", "/");
  const relativeKey = normalizeStorageKey(sanitizedKey);
  const keyForParsing = relativeKey || sanitizedKey;
  const extname = path.posix.extname(keyForParsing);
  const fileName = path.posix.basename(keyForParsing, extname);

  // 尝试从文件名解析信息，格式示例："2024-01-15_城市夜景_1250views"
  let title = fileName;
  let dateTaken = new Date().toISOString();
  let views = 0;
  let tags: string[] = [];

  // 从目录路径中提取 tags
  const dirPathRaw = relativeKey
    ? path.posix.dirname(relativeKey)
    : path.posix.dirname(keyForParsing);
  const dirPath = dirPathRaw === "." || dirPathRaw === "/" ? "" : dirPathRaw;
  if (dirPath) {
    const relativePath = dirPath.replaceAll(/^\/+|\/+$/g, "");

    // 分割路径并过滤空字符串
    const pathParts = relativePath
      .split("/")
      .filter((part) => part.trim() !== "");
    tags = pathParts.map((part) => part.trim());

    if (tags.length > 0) {
      log.info(`从路径提取标签：[${tags.join(", ")}]`);
    }
  }

  // 优先使用 EXIF 中的 DateTimeOriginal（new Date 永远返回 Date，需用 getTime 判断有效性，
  // 而不是恒为真的 instanceof Date）。无效时回退到文件名，再回退到默认值——绝不抛错。
  let resolvedDate: Date | null = null;
  if (exifData?.DateTimeOriginal) {
    const candidate = new Date(exifData.DateTimeOriginal);
    if (Number.isNaN(candidate.getTime())) {
      log?.warn(
        `无效的 EXIF DateTimeOriginal，回退到文件名/默认：${String(
          exifData.DateTimeOriginal,
        )}`,
      );
    } else {
      resolvedDate = candidate;
    }
  }

  if (resolvedDate) {
    dateTaken = resolvedDate.toISOString();
    log.info("使用 EXIF 拍摄时间");
  } else {
    // 如果 EXIF 中没有有效日期，尝试从文件名解析
    const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const fileDate = new Date(dateMatch[1]);
      if (Number.isNaN(fileDate.getTime())) {
        log?.warn(`文件名中的日期无效：${dateMatch[1]}`);
      } else {
        dateTaken = fileDate.toISOString();
        log.info(`从文件名提取拍摄时间：${dateMatch[1]}`);
      }
    }
  }

  // 如果文件名包含浏览次数
  const viewsMatch = fileName.match(/(\d+)views?/i);
  if (viewsMatch) {
    views = Number.parseInt(viewsMatch[1]);
    log.info(`从文件名提取浏览次数：${views}`);
  }

  // 从文件名中提取标题（移除日期和浏览次数）
  title = fileName
    .replaceAll(/\d{4}-\d{2}-\d{2}[_-]?/g, "")
    .replaceAll(/[_-]?\d+views?/gi, "")
    .replaceAll(/[_-]+/g, " ")
    .trim();

  // 如果标题为空，使用文件名
  if (!title) {
    title = path.posix.basename(keyForParsing, extname);
  }

  log.info(`照片信息提取完成："${title}"`);

  return {
    title,
    dateTaken,
    tags,
    description: "", // 可以从 EXIF 或其他元数据中获取
  };
}
