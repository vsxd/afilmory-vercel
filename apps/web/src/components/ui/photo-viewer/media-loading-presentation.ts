import type { TFunction } from "i18next";

import type { MediaTaskEvent } from "~/lib/media-task";
import { MediaTaskError } from "~/lib/media-task";

import type { LoadingState } from "./LoadingIndicator";

const ERROR_TRANSLATIONS = {
  forbidden: {
    title: "photo.error.forbidden.title",
    description: "photo.error.forbidden.description",
  },
  "not-found": {
    title: "photo.error.not-found.title",
    description: "photo.error.not-found.description",
  },
  server: {
    title: "photo.error.server.title",
    description: "photo.error.server.description",
  },
  timeout: {
    title: "photo.error.timeout.title",
    description: "photo.error.timeout.description",
  },
  network: {
    title: "photo.error.network.title",
    description: "photo.error.network.description",
  },
  "invalid-image": {
    title: "photo.error.invalid-image.title",
    description: "photo.error.invalid-image.description",
  },
  unsupported: {
    title: "photo.error.unsupported.title",
    description: "photo.error.unsupported.description",
  },
  unknown: {
    title: "photo.error.unknown.title",
    description: "photo.error.unknown.description",
  },
} as const;

function getFailureReason(error: Error) {
  if (!(error instanceof MediaTaskError)) return "unknown";
  switch (error.code) {
    case "http": {
      if (error.httpStatus === 403) return "forbidden";
      if (error.httpStatus === 404) return "not-found";
      return "server";
    }
    case "timeout":
    case "network": {
      return error.code;
    }
    case "invalid-image":
    case "detection-failed": {
      return "invalid-image";
    }
    case "decode-failed":
    case "conversion-failed": {
      return "unsupported";
    }
  }
}

export function presentMediaTaskError(error: Error, t: TFunction) {
  const reason = getFailureReason(error);
  const keys = ERROR_TRANSLATIONS[reason];
  return {
    isVisible: true,
    isError: true,
    errorMessage: t(keys.title),
    errorDescription: t(keys.description),
  };
}

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
