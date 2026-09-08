export interface BuilderOptions {
  isForceMode: boolean;
  isForceManifest: boolean;
  isForceThumbnails: boolean;
  concurrencyLimit?: number;
  progressListener?: BuildProgressListener;
}

/** Normalized user intent. Processing stages cannot write back into this request. */
export type BuildRequest = Readonly<BuilderOptions>;

/**
 * Compatibility payload for lifecycle hooks. Legacy invalidation hints remain
 * accepted here and are captured when planning; they are not user build options.
 */
export interface BuilderPluginOptions extends BuilderOptions {
  /** @internal Cached records normalized by lenient parsing must be rebuilt. */
  reprocessKeys?: readonly string[];
  /** @internal Derived-stage invalidation that does not imply source bytes changed. */
  derivedReprocessKeys?: readonly string[];
  /** @deprecated Not populated by planning. Observe lifecycle tasks/processorOptions instead. */
  plannedKeys?: ReadonlySet<string>;
  /** @internal Resolved privacy policy copied from builder config. */
  locationMode?: "strip" | "coarse" | "exact";
}

export interface BuilderResult {
  hasUpdates: boolean;
  newCount: number;
  processedCount: number;
  skippedCount: number;
  /** 处理失败并被跳过的照片数量（这些照片不会写入 manifest）。 */
  failedCount: number;
  deletedCount: number;
  totalPhotos: number;
}

export interface BuildProgressStartPayload {
  total: number;
  mode: "worker" | "cluster";
  concurrency: number;
}

export interface BuildProgressSnapshot {
  total: number;
  completed: number;
  newCount: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  currentKey?: string;
}

export interface BuildProgressListener {
  onStart?: (payload: BuildProgressStartPayload) => void;
  onProgress?: (snapshot: BuildProgressSnapshot) => void;
  onComplete?: (summary: BuildProgressSnapshot) => void;
  onError?: (error: unknown) => void;
}
