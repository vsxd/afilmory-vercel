import { createAbortError } from "./image-loading-types";
import { LRUCache } from "./lru-cache";
import { abortable, throwIfAborted } from "./media-resource";
import { relabelMovAsMp4 } from "./video-converter";

interface PendingVideo {
  controller: AbortController;
  promise: Promise<Blob>;
  consumers: number;
}

/** Runtime-scoped shared work. A subscriber never owns the shared signal. */
export class VideoBlobCache {
  private readonly cache = new LRUCache<string, Blob>(10, undefined, {
    maxBytes: 64 * 1024 * 1024,
    sizeOf: (blob) => blob.size,
  });
  private readonly pending = new Map<string, PendingVideo>();
  private disposed = false;

  async get(url: string, signal: AbortSignal): Promise<Blob> {
    throwIfAborted(signal);
    if (this.disposed) throw createAbortError("Video cache disposed");
    const cached = this.cache.get(url);
    if (cached) return cached;
    let task = this.pending.get(url);
    if (!task) {
      const controller = new AbortController();
      const newTask: PendingVideo = {
        controller,
        consumers: 0,
        promise: Promise.resolve()
          .then(async () => {
            throwIfAborted(controller.signal);
            const blob = await abortable(
              relabelMovAsMp4(url, {
                signal: controller.signal,
              }),
              controller.signal,
            );
            throwIfAborted(controller.signal);
            this.cache.set(url, blob);
            return blob;
          })
          .finally(() => {
            if (this.pending.get(url) === newTask) this.pending.delete(url);
          }),
      };
      task = newTask;
      this.pending.set(url, task);
    }
    task.consumers++;
    const subscription = task;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", release);
      subscription.consumers--;
      if (
        subscription.consumers === 0 &&
        this.pending.get(url) === subscription
      ) {
        this.pending.delete(url);
        subscription.controller.abort();
      }
    };
    signal.addEventListener("abort", release, { once: true });
    try {
      return await abortable(subscription.promise, signal);
    } finally {
      release();
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const task of this.pending.values()) task.controller.abort();
    this.pending.clear();
    this.cache.clear();
  }
}
