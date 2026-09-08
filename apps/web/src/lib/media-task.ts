export type MediaTaskStage = "fetch" | "detect" | "convert" | "decode";
export type MediaTaskErrorCode =
  | "network"
  | "http"
  | "timeout"
  | "invalid-image"
  | "detection-failed"
  | "conversion-failed"
  | "decode-failed";

/** Stable machine-readable context; display text belongs to the caller. */
export class MediaTaskError extends Error {
  readonly name = "MediaTaskError";

  constructor(
    readonly stage: MediaTaskStage,
    readonly code: MediaTaskErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export type MediaTaskEvent =
  | { type: "fetching" }
  | { type: "progress"; loadedBytes: number; totalBytes: number }
  | { type: "queued"; format: string }
  | { type: "converting"; format: string; originalSize: number }
  | { type: "native-fallback"; error: MediaTaskError }
  | { type: "loaded" };
