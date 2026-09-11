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
  readonly httpStatus?: number;

  constructor(
    readonly stage: MediaTaskStage,
    readonly code: MediaTaskErrorCode,
    message: string,
    options?: ErrorOptions & { httpStatus?: number },
  ) {
    super(message, options);
    this.httpStatus = options?.httpStatus;
  }
}

/** Do not log decoder/network messages or causes: they can contain signed URLs. */
export function getMediaTaskDiagnostic(error: unknown) {
  if (!(error instanceof MediaTaskError)) return { code: "unknown" };
  return {
    stage: error.stage,
    code: error.code,
    ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
    ...(error.code === "network"
      ? {
          hint: "Check connectivity and the photo host's public access and CORS settings. The browser cannot identify which one caused this failure.",
        }
      : {}),
  };
}

export type MediaTaskEvent =
  | { type: "fetching" }
  | { type: "progress"; loadedBytes: number; totalBytes: number }
  | { type: "queued"; format: string }
  | { type: "converting"; format: string; originalSize: number }
  | { type: "native-fallback"; error: MediaTaskError }
  | { type: "loaded" };
