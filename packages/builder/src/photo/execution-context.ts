import { AsyncLocalStorage } from "node:async_hooks";

import type {
  EmitPluginEventFn,
  PhotoExecutionContext,
} from "../core/contracts/execution-context.js";
import type { BuilderServices } from "../core/contracts/services.js";
import type { StorageConfig } from "../storage/interfaces.js";
import { createPhotoProcessingLoggers } from "./logger-factory.js";

export type {
  EmitPluginEventFn,
  PhotoExecutionContext,
} from "../core/contracts/execution-context.js";

const photoContextStorage = new AsyncLocalStorage<PhotoExecutionContext>();

/**
 * 照片执行上下文的唯一组装入口：主进程池、cluster worker、geocoding 插件的
 * 批量回填共用这一个工厂，字段推导（storageManager / key 归一化 / 输出路径 /
 * 按 workerId 打标的 loggers）不再散落在各写入点。
 */
export function createPhotoExecutionContext(
  services: BuilderServices,
  emitPluginEvent: EmitPluginEventFn,
  workerId: number,
): PhotoExecutionContext {
  const storageConfig = services.storage.getConfig();
  return {
    services,
    emitPluginEvent,
    storageManager: services.storage.getManager(),
    normalizeStorageKey: createStorageKeyNormalizer(storageConfig),
    output: services.config.output,
    loggers: createPhotoProcessingLoggers(workerId, services.logger),
  };
}

export function runWithPhotoExecutionContext<T>(
  context: PhotoExecutionContext,
  callback: () => T | Promise<T>,
): T | Promise<T> {
  return photoContextStorage.run(context, callback);
}

export function getPhotoExecutionContext(): PhotoExecutionContext {
  const context = photoContextStorage.getStore();
  if (!context) {
    throw new Error("Photo execution context is not available");
  }
  return context;
}

function sanitizeStoragePath(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .replaceAll("\\", "/")
    .replaceAll(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/**
 * 创建一个用于标准化存储键值的函数
 * 会去除配置中的 prefix/path 等前缀，并统一路径分隔符
 */
export function createStorageKeyNormalizer(
  storageConfig: StorageConfig,
): (key: string) => string {
  // 只有 S3 配置有 prefix；本地文件系统的 key 本来就是相对 basePath 的路径。
  // 用 "prefix" in 而不是判别字段，兼容缺失 provider 的历史配置对象。
  const basePrefix = sanitizeStoragePath(
    "prefix" in storageConfig ? storageConfig.prefix : undefined,
  );

  const prefixWithSlash = basePrefix ? `${basePrefix}/` : "";

  return (rawKey: string): string => {
    if (!rawKey) return "";

    const sanitizedKey = rawKey
      .replaceAll("\\", "/")
      .replaceAll(/\/+/g, "/")
      .replace(/^\/+/, "");

    if (!basePrefix) {
      return sanitizedKey;
    }

    if (sanitizedKey === basePrefix) {
      return "";
    }

    if (sanitizedKey.startsWith(prefixWithSlash)) {
      return sanitizedKey.slice(prefixWithSlash.length);
    }

    return sanitizedKey;
  };
}
