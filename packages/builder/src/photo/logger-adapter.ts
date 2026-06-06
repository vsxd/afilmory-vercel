import type { ConsolaInstance } from "consola";

import type { Logger, WorkerLogger } from "../logger/index.js";
import { getPhotoExecutionContext } from "./execution-context.js";
import type { PhotoLogger, PhotoProcessingLoggers } from "./logger-types.js";

export type { PhotoLogger, PhotoProcessingLoggers } from "./logger-types.js";

/**
 * Logger 适配器基类
 */
export abstract class LoggerAdapter implements PhotoLogger {
  abstract info(message: string, ...args: any[]): void;
  abstract warn(message: string, ...args: any[]): void;
  abstract error(message: string, error?: any): void;
  abstract success(message: string, ...args: any[]): void;
}

/**
 * Worker Logger 适配器
 * 将现有的 Logger 系统适配到通用接口
 */
export class WorkerLoggerAdapter extends LoggerAdapter {
  constructor(private logger: ReturnType<WorkerLogger["withTag"]>) {
    super();
  }

  info(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  error(message: string, error?: any): void {
    this.logger.error(message, error);
  }

  success(message: string, ...args: any[]): void {
    this.logger.success(message, ...args);
  }

  // 提供原始 logger 实例，用于需要 ConsolaInstance 的地方
  get originalLogger(): ConsolaInstance {
    return this.logger;
  }
}

/**
 * 兼容的 Logger 适配器
 * 既实现 PhotoLogger 接口，又提供原始 ConsolaInstance
 */
export class CompatibleLoggerAdapter implements PhotoLogger {
  private logger: ReturnType<WorkerLogger["withTag"]>;

  constructor(logger: ReturnType<WorkerLogger["withTag"]>) {
    this.logger = logger;

    // 将原始 logger 的所有属性和方法复制到当前实例
    Object.setPrototypeOf(this, logger);
    Object.assign(this, logger);
  }

  info(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  error(message: string, error?: any): void {
    this.logger.error(message, error);
  }

  success(message: string, ...args: any[]): void {
    this.logger.success(message, ...args);
  }

  // 提供原始 logger 实例
  get originalLogger(): ConsolaInstance {
    return this.logger;
  }
}

/**
 * 创建照片处理 Logger 集合
 */
export function createPhotoProcessingLoggers(
  workerId: number,
  baseLogger: Logger,
): PhotoProcessingLoggers {
  const workerLogger = baseLogger.worker(workerId);
  return {
    image: new CompatibleLoggerAdapter(workerLogger.withTag("IMAGE")),
    s3: new CompatibleLoggerAdapter(workerLogger.withTag("S3")),
    thumbnail: new CompatibleLoggerAdapter(workerLogger.withTag("THUMBNAIL")),
    blurhash: new CompatibleLoggerAdapter(workerLogger.withTag("BLURHASH")),
    exif: new CompatibleLoggerAdapter(workerLogger.withTag("EXIF")),
    tone: new CompatibleLoggerAdapter(workerLogger.withTag("TONE")),
    location: new CompatibleLoggerAdapter(workerLogger.withTag("LOCATION")),
  };
}

/**
 * 获取当前上下文中的 Logger 集合
 */
export function getPhotoProcessingLoggers(): PhotoProcessingLoggers {
  const context = getPhotoExecutionContext();
  if (context.loggers) {
    return context.loggers;
  }

  throw new Error(
    "Photo loggers not initialized. Ensure runWithPhotoExecutionContext is used.",
  );
}
