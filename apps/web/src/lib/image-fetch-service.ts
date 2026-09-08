import { detectFileTypeFromBlob } from "~/lib/file-type";

import type { LoadingCallbacks } from "./image-loading-types";
import { createAbortError } from "./image-loading-types";
import { MediaTaskError } from "./media-task";

export const IMAGE_DOWNLOAD_IDLE_TIMEOUT_MS = 60_000;

/** One request per loader. Progress renews the deadline so large files can keep downloading. */
export class ImageFetchService {
  private cancelCurrent: (() => void) | null = null;

  constructor(private readonly idleTimeoutMs = IMAGE_DOWNLOAD_IDLE_TIMEOUT_MS) {
    if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0)
      throw new TypeError("Image download timeout must be positive and finite");
  }

  fetchBlob(src: string, callbacks: LoadingCallbacks = {}): Promise<Blob> {
    this.cleanup();
    return new Promise((resolve, reject) => {
      let settled = false;
      let xhr: XMLHttpRequest | null = null;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let loadedBytes = 0;
      const finish = (result: { blob: Blob } | { error: Error }) => {
        if (settled) return;
        settled = true;
        clearTimeout(delay);
        clearTimeout(deadline);
        if (this.cancelCurrent === cancel) this.cancelCurrent = null;
        if (xhr) {
          xhr.onload =
            xhr.onprogress =
            xhr.onerror =
            xhr.onabort =
            xhr.ontimeout =
              null;
          if ("error" in result) xhr.abort();
        }
        if ("error" in result) reject(result.error);
        else resolve(result.blob);
      };
      const cancel = () =>
        finish({ error: createAbortError("Image load cancelled") });
      const timeout = () =>
        finish({
          error: new MediaTaskError(
            "fetch",
            "timeout",
            "Image download stalled",
          ),
        });
      const renewDeadline = () => {
        clearTimeout(deadline);
        deadline = setTimeout(timeout, this.idleTimeoutMs);
      };
      this.cancelCurrent = cancel;
      const delay = setTimeout(
        () => {
          try {
            const request = new XMLHttpRequest();
            xhr = request;
            request.open("GET", src);
            request.responseType = "blob";
            request.onload = async () => {
              if (settled) return;
              if (request.status !== 200) {
                finish({
                  error: new MediaTaskError(
                    "fetch",
                    "http",
                    `HTTP ${request.status}`,
                  ),
                });
                return;
              }
              try {
                const blob: Blob = request.response;
                if (!blob || blob.size === 0)
                  throw new MediaTaskError(
                    "detect",
                    "invalid-image",
                    "Empty image response",
                  );
                const type = await detectFileTypeFromBlob(blob);
                if (!type?.mime.startsWith("image/"))
                  throw new MediaTaskError(
                    "detect",
                    "invalid-image",
                    "Response is not a valid image",
                  );
                finish({ blob });
              } catch (cause) {
                finish({
                  error:
                    cause instanceof MediaTaskError
                      ? cause
                      : new MediaTaskError(
                          "detect",
                          "detection-failed",
                          "Image format detection failed",
                          { cause },
                        ),
                });
              }
            };
            request.onprogress = (event) => {
              if (settled) return;
              if (event.loaded > loadedBytes) {
                loadedBytes = event.loaded;
                renewDeadline();
              }
              if (!event.lengthComputable || event.total <= 0) return;
              callbacks.onEvent?.({
                type: "progress",
                loadedBytes: event.loaded,
                totalBytes: event.total,
              });
              callbacks.onProgress?.((event.loaded / event.total) * 100);
            };
            request.onabort = cancel;
            request.onerror = () =>
              finish({
                error: new MediaTaskError(
                  "fetch",
                  "network",
                  "Image network error",
                ),
              });
            request.ontimeout = timeout;
            renewDeadline();
            request.send();
          } catch (cause) {
            finish({
              error: new MediaTaskError(
                "fetch",
                "network",
                "Could not start image request",
                { cause },
              ),
            });
          }
        },
        callbacks.priority === "high" ? 0 : 300,
      );
    });
  }

  cleanup(): void {
    this.cancelCurrent?.();
  }
}
