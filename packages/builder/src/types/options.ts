export interface BuilderOptions {
  isForceMode: boolean;
  isForceManifest: boolean;
  isForceThumbnails: boolean;
  concurrencyLimit?: number;
  progressListener?: BuildProgressListener;
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
