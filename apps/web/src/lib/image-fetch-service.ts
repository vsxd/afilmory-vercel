import { debugLog } from "~/lib/debug-log";
import { detectFileTypeFromBlob } from "~/lib/file-type";
import type { LoadingCallbacks } from "~/lib/image-loading-types";
import { createAbortError } from "~/lib/image-loading-types";

export class ImageFetchService {
  private currentXHR: XMLHttpRequest | null = null;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReject: ((reason?: unknown) => void) | null = null;

  async fetchBlob(
    src: string,
    callbacks: LoadingCallbacks = {},
  ): Promise<Blob> {
    const { priority, onProgress } = callbacks;
    const startDelay = priority === "high" ? 0 : 300;

    return new Promise((resolve, reject) => {
      this.pendingReject = reject;

      const rejectFetch = (error: unknown) => {
        if (this.pendingReject === reject) {
          this.pendingReject = null;
        }
        reject(error);
      };

      this.delayTimer = setTimeout(() => {
        this.delayTimer = null;
        const xhr = new XMLHttpRequest();
        xhr.open("GET", src);
        xhr.responseType = "blob";
        this.currentXHR = xhr;

        xhr.onload = async () => {
          if (this.currentXHR === xhr) {
            this.currentXHR = null;
          }

          if (xhr.status !== 200) {
            rejectFetch(new Error(`HTTP ${xhr.status}`));
            return;
          }

          try {
            const blob = xhr.response as Blob;
            if (!(await this.isValidImageBlob(blob))) {
              rejectFetch(new Error("Response is not a valid image"));
              return;
            }

            if (this.pendingReject === reject) {
              this.pendingReject = null;
            }
            resolve(blob);
          } catch (error) {
            rejectFetch(error);
          }
        };

        xhr.onprogress = (event) => {
          if (!event.lengthComputable) {
            return;
          }

          const progress = (event.loaded / event.total) * 100;
          callbacks.onLoadingStateUpdate?.({
            loadingProgress: progress,
            loadedBytes: event.loaded,
            totalBytes: event.total,
          });
          onProgress?.(progress);
        };

        xhr.onabort = () => {
          if (this.currentXHR === xhr) {
            this.currentXHR = null;
          }
          rejectFetch(createAbortError("Image load cancelled"));
        };

        xhr.onerror = () => {
          if (this.currentXHR === xhr) {
            this.currentXHR = null;
          }
          rejectFetch(new Error("Network error"));
        };

        xhr.send();
      }, startDelay);
    });
  }

  cleanup(): void {
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;

      if (this.pendingReject) {
        const reject = this.pendingReject;
        this.pendingReject = null;
        reject(createAbortError("Image load cancelled"));
      }
    }

    if (this.currentXHR) {
      this.currentXHR.abort();
      this.currentXHR = null;
    }
  }

  private async isValidImageBlob(blob: Blob): Promise<boolean> {
    if (blob.size === 0) {
      console.warn("Empty blob detected");
      return false;
    }

    try {
      const fileType = await detectFileTypeFromBlob(blob);

      if (!fileType) {
        console.warn("Could not detect file type from blob");
        return false;
      }

      const isValidImage = fileType.mime.startsWith("image/");

      if (!isValidImage) {
        console.warn(
          `Invalid file type detected: ${fileType.ext} (${fileType.mime})`,
        );
        return false;
      }

      debugLog(`Valid image detected: ${fileType.ext} (${fileType.mime})`);
      return true;
    } catch (error) {
      console.error("Failed to detect file type:", error);
      return false;
    }
  }
}
