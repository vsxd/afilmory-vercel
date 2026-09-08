import type { PhotoProcessorOptions } from "../core/contracts/photo-processing.js";
import type { BuilderPluginOptions } from "../types/options.js";

// PhotoProcessorOptions 是 BuilderPluginOptions 的投影；推导只发生在这一处，
// 调用方不再各自手抄三个字段。
export function toProcessorOptions(
  builderOptions: BuilderPluginOptions,
): PhotoProcessorOptions {
  return {
    isForceMode: builderOptions.isForceMode,
    isForceManifest: builderOptions.isForceManifest,
    isForceThumbnails: builderOptions.isForceThumbnails,
    ...(builderOptions.locationMode
      ? { locationMode: builderOptions.locationMode }
      : {}),
    ...(builderOptions.reprocessKeys
      ? {
          reprocessKeys: builderOptions.reprocessKeys,
          reprocessKeySet: new Set(builderOptions.reprocessKeys),
        }
      : {}),
    ...(builderOptions.plannedKeys
      ? { plannedKeys: builderOptions.plannedKeys }
      : {}),
    ...(builderOptions.derivedReprocessKeys
      ? {
          derivedReprocessKeySet: new Set(builderOptions.derivedReprocessKeys),
        }
      : {}),
  };
}
