import { createAbortError } from "./image-loading-types";

export interface MediaLease {
  blob: Blob;
  blobSrc: string;
  /** The consumer releases its URL when it no longer renders/uses the media. */
  release: () => void;
}

/** Cache entries never own URLs. Each consumer gets an independent lease. */
export class MediaResourceScope {
  private readonly releases = new Set<() => void>();
  private disposed = false;

  acquire(blob: Blob): MediaLease {
    if (this.disposed) throw createAbortError("Media runtime disposed");
    const blobSrc = URL.createObjectURL(blob);
    const release = () => {
      if (!this.releases.delete(release)) return;
      URL.revokeObjectURL(blobSrc);
    };
    this.releases.add(release);
    return { blob, blobSrc, release };
  }

  dispose(): void {
    this.disposed = true;
    for (const release of this.releases) release();
  }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw createAbortError("Media load cancelled");
}

/** Settle cancellation promptly even when a codec cannot interrupt its work. */
export function abortable<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError("Media load cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) onAbort();
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
