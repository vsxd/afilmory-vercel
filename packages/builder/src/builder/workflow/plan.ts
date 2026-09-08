import type { PhotoProcessorOptions } from "../../core/contracts/photo-processing.js";
import type { StorageObject } from "../../storage/interfaces.js";

export interface BuildPlan {
  readonly s3ImageKeys: ReadonlySet<string>;
  readonly tasksToProcess: readonly Readonly<StorageObject>[];
  readonly reasons: ReadonlyMap<string, string>;
  readonly processorOptions: Readonly<PhotoProcessorOptions>;
}

/** Snapshot only the execution policy. Legacy plugin payloads never own these sets. */
export function copyProcessorOptions(
  options: Readonly<PhotoProcessorOptions>,
): PhotoProcessorOptions {
  return {
    ...options,
    ...(options.reprocessKeys
      ? { reprocessKeys: [...options.reprocessKeys] }
      : {}),
    ...(options.reprocessKeySet
      ? { reprocessKeySet: new Set(options.reprocessKeySet) }
      : {}),
    ...(options.derivedReprocessKeySet
      ? { derivedReprocessKeySet: new Set(options.derivedReprocessKeySet) }
      : {}),
    ...(options.plannedKeys
      ? { plannedKeys: new Set(options.plannedKeys) }
      : {}),
  };
}
