export interface LoadingState {
  isVisible: boolean;
  isHeicFormat?: boolean;
  loadingProgress?: number;
  loadedBytes?: number;
  totalBytes?: number;
  isConverting?: boolean;
  isQueueWaiting?: boolean;
  conversionMessage?: string;
  codecInfo?: string;
}

export interface LoadingCallbacks {
  priority?: "high" | "auto";
  onProgress?: (progress: number) => void;
  onError?: () => void;
  onLoadingStateUpdate?: (state: Partial<LoadingState>) => void;
}

export interface ImageLoadResult {
  blobSrc: string;
  blob: Blob;
  convertedUrl?: string;
}

export interface VideoProcessResult {
  convertedVideoUrl?: string;
  conversionMethod?: string;
}

export function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
