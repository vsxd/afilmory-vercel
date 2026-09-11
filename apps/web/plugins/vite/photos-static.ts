import fs from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertManifest } from "@afilmory/schema";
import type { Plugin, ResolvedConfig } from "vite";

import { MANIFEST_PATH } from "./__internal__/constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../../..");

export interface PhotosStaticPluginOptions {
  baseUrl: string;
  localPhotosPath: string;
  provider: "local" | "s3";
}

export const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".hif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function isPathWithin(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (!path.isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`))
  );
}

export function normalizeLocalPhotosBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  const segments = trimmed.slice(1).split("/");
  if (
    !trimmed.startsWith("/") ||
    trimmed === "" ||
    trimmed === "/" ||
    trimmed.startsWith("//") ||
    segments.some(
      (segment) =>
        !/^[\w.~-]+$/.test(segment) ||
        segment === "." ||
        segment === ".." ||
        segment.endsWith(".") ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    )
  ) {
    throw new Error(
      `LOCAL_PHOTOS_BASE_URL must be a safe root-relative path such as /originals; received ${JSON.stringify(value)}`,
    );
  }
  const namespace = segments[0] ?? "";
  if (
    ["assets", "photos", "thumbnails", "vendor"].includes(
      namespace.toLowerCase(),
    )
  ) {
    throw new Error(
      `LOCAL_PHOTOS_BASE_URL uses the reserved application namespace /${namespace}`,
    );
  }
  return trimmed;
}

export function getLocalMediaKeyFromUrl(
  publicUrl: string,
  baseUrl: string,
): string | null {
  if (!publicUrl.startsWith("/") || publicUrl.startsWith("//")) return null;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(publicUrl.split(/[?#]/, 1)[0] ?? "");
  } catch {
    return null;
  }
  if (decodedPath.includes("\0") || decodedPath.includes("\\")) return null;

  const normalizedBaseUrl = normalizeLocalPhotosBaseUrl(baseUrl);
  const prefix = `${normalizedBaseUrl}/`;
  if (!decodedPath.startsWith(prefix)) return null;
  const key = decodedPath.slice(prefix.length);
  if (
    !key ||
    key
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return null;
  }
  return key;
}

export function resolveLocalPhotoPath(
  photosDirectory: string,
  requestUrl: string,
): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestUrl.split("?", 1)[0] ?? "");
  } catch {
    return null;
  }
  if (decodedPath.includes("\0")) return null;

  const relativePath = decodedPath.replace(/^[/\\]+/, "");
  const resolvedDirectory = path.resolve(photosDirectory);
  const resolvedPath = path.resolve(resolvedDirectory, relativePath);
  if (!isPathWithin(resolvedDirectory, resolvedPath)) return null;
  return resolvedPath;
}

/** Resolves symlinks as well as `..` so development never serves outside root. */
export function resolveRealLocalPhotoPath(
  photosDirectory: string,
  requestUrl: string,
): string | null {
  const candidatePath = resolveLocalPhotoPath(photosDirectory, requestUrl);
  if (!candidatePath) return null;

  let realDirectory: string;
  let realCandidatePath: string;
  try {
    realDirectory = fs.realpathSync(photosDirectory);
    realCandidatePath = fs.realpathSync(candidatePath);
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }

  if (!isPathWithin(realDirectory, realCandidatePath)) {
    return null;
  }
  return realCandidatePath;
}

interface ByteRange {
  end: number;
  start: number;
}

export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return "invalid";

  const [, startValue, endValue] = match;
  let start: number;
  let end: number;
  if (!startValue) {
    const suffixLength = Number(endValue);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return "invalid";
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startValue);
    end = endValue ? Number(endValue) : size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return "invalid";
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function copyLocalPhotos(
  sourceDirectory: string,
  destinationDirectory: string,
  mediaKeys: Iterable<string>,
  outputDirectory: string,
): Promise<void> {
  const realSourceDirectory = await realpath(sourceDirectory);
  const sourceStats = await stat(realSourceDirectory);
  if (!sourceStats.isDirectory()) {
    throw new Error(
      `[photos-static] Local photo source is not a regular directory: ${sourceDirectory}`,
    );
  }
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  const resolvedDestinationDirectory = path.resolve(destinationDirectory);
  if (!isPathWithin(resolvedOutputDirectory, resolvedDestinationDirectory)) {
    throw new Error(
      `[photos-static] Build destination escapes the configured output directory: ${destinationDirectory}`,
    );
  }
  if (isPathWithin(resolvedDestinationDirectory, realSourceDirectory)) {
    throw new Error(
      `[photos-static] Local photo source cannot be inside its build destination: ${sourceDirectory}`,
    );
  }
  if (isPathWithin(realSourceDirectory, resolvedDestinationDirectory)) {
    throw new Error(
      `[photos-static] Build destination cannot be inside the local photo source: ${destinationDirectory}`,
    );
  }

  const realOutputDirectory = await realpath(resolvedOutputDirectory);
  if (isPathWithin(realOutputDirectory, realSourceDirectory)) {
    throw new Error(
      `[photos-static] Local photo source cannot be inside the build output: ${sourceDirectory}`,
    );
  }
  if (isPathWithin(realSourceDirectory, realOutputDirectory)) {
    throw new Error(
      `[photos-static] Build output cannot be inside the local photo source: ${outputDirectory}`,
    );
  }
  let realDestinationDirectory = realOutputDirectory;
  const destinationSegments = path
    .relative(resolvedOutputDirectory, resolvedDestinationDirectory)
    .split(path.sep)
    .filter(Boolean);
  for (const segment of destinationSegments) {
    const nextDirectory = path.join(realDestinationDirectory, segment);
    let directoryStats = await lstat(nextDirectory).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (!directoryStats) {
      await mkdir(nextDirectory);
      directoryStats = await lstat(nextDirectory);
    }
    if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) {
      throw new Error(
        `[photos-static] Build destination contains an unsafe path component: ${nextDirectory}`,
      );
    }
    realDestinationDirectory = await realpath(nextDirectory);
    if (!isPathWithin(realOutputDirectory, realDestinationDirectory)) {
      throw new Error(
        `[photos-static] Build destination resolves outside the configured output directory: ${destinationDirectory}`,
      );
    }
  }

  if (isPathWithin(realDestinationDirectory, realSourceDirectory)) {
    throw new Error(
      `[photos-static] Local photo source cannot be inside its build destination: ${sourceDirectory}`,
    );
  }
  if (isPathWithin(realSourceDirectory, realDestinationDirectory)) {
    throw new Error(
      `[photos-static] Build destination cannot be inside the local photo source: ${destinationDirectory}`,
    );
  }

  for (const mediaKey of new Set(mediaKeys)) {
    if (!MIME_TYPES[path.extname(mediaKey).toLowerCase()]) continue;

    const candidatePath = path.resolve(realSourceDirectory, mediaKey);
    const realSourcePath = await realpath(candidatePath);
    if (!isPathWithin(realSourceDirectory, realSourcePath)) {
      throw new Error(
        `[photos-static] Manifest media escapes the local photo source: ${mediaKey}`,
      );
    }
    if (!(await stat(realSourcePath)).isFile()) {
      throw new Error(
        `[photos-static] Manifest media is not a file: ${mediaKey}`,
      );
    }

    const destinationPath = path.resolve(realDestinationDirectory, mediaKey);
    if (!isPathWithin(realDestinationDirectory, destinationPath)) {
      throw new Error(
        `[photos-static] Refusing unsafe manifest media path: ${mediaKey}`,
      );
    }
    const relativeParentPath = path.relative(
      realDestinationDirectory,
      path.dirname(destinationPath),
    );
    let safeParentDirectory = realDestinationDirectory;
    for (const segment of relativeParentPath.split(path.sep).filter(Boolean)) {
      const nextDirectory = path.join(safeParentDirectory, segment);
      let directoryStats = await lstat(nextDirectory).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        },
      );
      if (!directoryStats) {
        await mkdir(nextDirectory);
        directoryStats = await lstat(nextDirectory);
      }
      if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) {
        throw new Error(
          `[photos-static] Refusing unsafe destination directory for manifest media: ${mediaKey}`,
        );
      }
      safeParentDirectory = nextDirectory;
    }
    const existingDestination = await lstat(destinationPath).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (existingDestination?.isSymbolicLink()) {
      throw new Error(
        `[photos-static] Refusing symlink destination for manifest media: ${mediaKey}`,
      );
    }
    await copyFile(realSourcePath, destinationPath);
  }
}

/** Serves local originals in development and copies them into a static build. */
export function photosStaticPlugin(options: PhotosStaticPluginOptions): Plugin {
  if (options.provider !== "local") {
    return { name: "photos-static-disabled" };
  }

  const photosDirectory = path.resolve(projectRoot, options.localPhotosPath);
  const baseUrl = normalizeLocalPhotosBaseUrl(options.baseUrl);
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: "photos-static",
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      const publicPhotosDirectory = path.resolve(
        server.config.publicDir,
        `.${baseUrl}`,
      );
      if (fs.existsSync(publicPhotosDirectory)) {
        server.config.logger.warn(
          `[photos-static] ${publicPhotosDirectory} already exists; Vite public assets take precedence over the local source middleware.`,
        );
        return;
      }

      server.middlewares.use(baseUrl, (request, response, next) => {
        if (!request.url) return next();
        const requestedPhotoPath = resolveLocalPhotoPath(
          photosDirectory,
          request.url,
        );
        if (!requestedPhotoPath) {
          response.statusCode = 403;
          response.end("Forbidden");
          return;
        }

        let localPhotoPath: string | null;
        try {
          localPhotoPath = resolveRealLocalPhotoPath(
            photosDirectory,
            request.url,
          );
        } catch (error) {
          next(error as Error);
          return;
        }
        if (!localPhotoPath) {
          response.statusCode = 404;
          response.end("Not Found");
          return;
        }

        let stats: fs.Stats;
        try {
          stats = fs.statSync(localPhotoPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            response.statusCode = 404;
            response.end("Not Found");
            return;
          }
          next(error as Error);
          return;
        }
        if (!stats.isFile()) {
          response.statusCode = 404;
          response.end("Not Found");
          return;
        }

        const extension = path.extname(localPhotoPath).toLowerCase();
        const contentType = MIME_TYPES[extension];
        if (!contentType) {
          response.statusCode = 404;
          response.end("Not Found");
          return;
        }

        const etag = `"${stats.mtimeMs}-${stats.size}"`;
        response.setHeader("Content-Type", contentType);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("ETag", etag);
        if (request.headers["if-none-match"] === etag) {
          response.statusCode = 304;
          response.end();
          return;
        }

        const range = parseByteRange(request.headers.range, stats.size);
        if (range === "invalid") {
          response.statusCode = 416;
          response.setHeader("Content-Range", `bytes */${stats.size}`);
          response.end();
          return;
        }
        if (range) {
          response.statusCode = 206;
          response.setHeader(
            "Content-Range",
            `bytes ${range.start}-${range.end}/${stats.size}`,
          );
          response.setHeader("Content-Length", range.end - range.start + 1);
        } else {
          response.setHeader("Content-Length", stats.size);
        }
        if (request.method === "HEAD") {
          response.end();
          return;
        }

        const stream = fs.createReadStream(localPhotoPath, range ?? undefined);
        // pipe() unpipes a closed response but does not close its source. A
        // cancelled large photo/video request can otherwise leave the file
        // paused under backpressure with its descriptor still open.
        const closeStream = () => stream.destroy();
        response.once("close", closeStream);
        stream.once("close", () => {
          response.removeListener("close", closeStream);
        });
        stream.on("error", (error) => {
          if (!response.headersSent) next(error);
          else response.destroy(error);
        });
        if (response.destroyed) closeStream();
        else stream.pipe(response);
      });
    },
    async closeBundle() {
      if (!resolvedConfig || resolvedConfig.command !== "build") return;
      const outputDirectory = path.resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
      );
      const destinationDirectory = path.resolve(outputDirectory, `.${baseUrl}`);
      const manifest = assertManifest(
        JSON.parse(await readFile(MANIFEST_PATH, "utf8")),
      );
      const mediaKeys = manifest.photos.flatMap((photo) => {
        const localThumbnailKey = getLocalMediaKeyFromUrl(
          photo.thumbnailUrl,
          baseUrl,
        );
        return [
          photo.s3Key,
          ...(photo.video?.type === "live-photo" ? [photo.video.s3Key] : []),
          ...(localThumbnailKey ? [localThumbnailKey] : []),
        ];
      });
      await copyLocalPhotos(
        photosDirectory,
        destinationDirectory,
        mediaKeys,
        outputDirectory,
      );
      resolvedConfig.logger.info(
        `[photos-static] Copied local originals to ${destinationDirectory}`,
      );
    },
  };
}
