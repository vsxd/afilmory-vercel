import { createAbortError } from "./abortable";

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

export { abortable, throwIfAborted } from "./abortable";
