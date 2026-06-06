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

export type VideoSource =
  | { type: "live-photo"; videoUrl: string }
  | {
      type: "motion-photo";
      imageUrl: string;
      offset: number;
      size?: number;
      presentationTimestamp?: number;
    }
  | { type: "none" };

export function getVideoSourceKey(videoSource: VideoSource): string {
  switch (videoSource.type) {
    case "live-photo": {
      return `live-photo:${videoSource.videoUrl}`;
    }
    case "motion-photo": {
      return [
        "motion-photo",
        videoSource.imageUrl,
        videoSource.offset,
        videoSource.size ?? "",
        videoSource.presentationTimestamp ?? "",
      ].join(":");
    }
    case "none": {
      return "none";
    }
  }
}

export function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
