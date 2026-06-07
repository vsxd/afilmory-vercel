import type { PhotoExecutionContext } from "../core/contracts/execution-context.js";
import type { BuilderServices } from "../core/contracts/services.js";
import type { StorageManager } from "../storage/index.js";
import { getPhotoExecutionContext } from "./execution-context.js";
import { getPhotoProcessingLoggers } from "./logger-adapter.js";
import type { PhotoProcessingLoggers } from "./logger-types.js";

export interface PhotoPipelineRuntime {
  services: BuilderServices;
  storageManager: StorageManager;
  emitPluginEvent: PhotoExecutionContext["emitPluginEvent"];
  loggers: PhotoProcessingLoggers;
}

export function createPhotoPipelineRuntime(
  context: PhotoExecutionContext = getPhotoExecutionContext(),
): PhotoPipelineRuntime {
  return {
    services: context.services,
    storageManager: context.storageManager,
    emitPluginEvent: context.emitPluginEvent,
    loggers: context.loggers ?? getPhotoProcessingLoggers(),
  };
}
