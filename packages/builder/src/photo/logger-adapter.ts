import { getPhotoExecutionContext } from "./execution-context.js";
import type { PhotoProcessingLoggers } from "./logger-types.js";

export type { PhotoLogger, PhotoProcessingLoggers } from "./logger-types.js";

/**
 * 获取当前上下文中的 Logger 集合
 */
export function getPhotoProcessingLoggers(): PhotoProcessingLoggers {
  return getPhotoExecutionContext().loggers;
}
