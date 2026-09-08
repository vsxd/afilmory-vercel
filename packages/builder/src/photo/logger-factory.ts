import type { Logger } from "../logger/index.js";
import type { PhotoProcessingLoggers } from "./logger-types.js";

/** Create tagged loggers without depending on an active execution context. */
export function createPhotoProcessingLoggers(
  workerId: number,
  baseLogger: Logger,
): PhotoProcessingLoggers {
  const workerLogger = baseLogger.worker(workerId);
  return {
    image: workerLogger.withTag("IMAGE"),
    s3: workerLogger.withTag("S3"),
    thumbnail: workerLogger.withTag("THUMBNAIL"),
    thumbhash: workerLogger.withTag("THUMBHASH"),
    exif: workerLogger.withTag("EXIF"),
    tone: workerLogger.withTag("TONE"),
    location: workerLogger.withTag("LOCATION"),
  };
}
