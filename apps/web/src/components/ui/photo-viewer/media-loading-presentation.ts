import type { TFunction } from "i18next";

import type { MediaTaskEvent } from "~/lib/media-task";

import type { LoadingState } from "./LoadingIndicator";

/** Translate task facts into the existing indicator's presentation model. */
export function presentMediaTaskEvent(
  event: MediaTaskEvent,
  t: TFunction,
): Partial<LoadingState> {
  switch (event.type) {
    case "fetching": {
      return { isVisible: true };
    }
    case "progress": {
      return {
        loadedBytes: event.loadedBytes,
        totalBytes: event.totalBytes,
        loadingProgress:
          event.totalBytes > 0
            ? (event.loadedBytes / event.totalBytes) * 100
            : 0,
      };
    }
    case "queued": {
      return {
        isVisible: true,
        isConverting: true,
        isQueueWaiting: true,
        conversionMessage: t("loading.queue.waiting"),
      };
    }
    case "converting": {
      return {
        isConverting: true,
        isQueueWaiting: false,
        isHeicFormat: event.format === "HEIC",
        loadedBytes: event.originalSize,
        totalBytes: event.originalSize,
        loadingProgress: 100,
        conversionMessage:
          event.format === "HEIC"
            ? t("loading.heic.converting")
            : event.format === "TIFF"
              ? t("loading.tiff.converting")
              : undefined,
      };
    }
    case "native-fallback":
    case "loaded": {
      return {
        isVisible: false,
        isConverting: false,
        isQueueWaiting: false,
        conversionMessage: undefined,
      };
    }
  }
}
