import { ImageFetchService } from "./image-fetch-service";
import type { LoadingCallbacks } from "./image-loading-types";
import { abortable } from "./media-resource";

interface SharedFetch {
  service: Pick<ImageFetchService, "fetchBlob" | "cleanup">;
  consumers: Set<LoadingCallbacks>;
  promise: Promise<Blob>;
}

/** Runtime-owned in-flight downloads; a prefetch and its arriving viewer share bytes. */
export class SharedImageFetchService {
  private readonly pending = new Map<string, SharedFetch>();

  constructor(
    private readonly createService: () => Pick<
      ImageFetchService,
      "fetchBlob" | "cleanup"
    > = () => new ImageFetchService(),
  ) {}

  createConsumer(): Pick<ImageFetchService, "fetchBlob" | "cleanup"> {
    let cancel: (() => void) | undefined;
    return {
      cleanup: () => cancel?.(),
      fetchBlob: (src, callbacks = {}) => {
        cancel?.();
        let task = this.pending.get(src);
        if (!task) {
          const service = this.createService();
          const consumers = new Set<LoadingCallbacks>();
          task = {
            service,
            consumers,
            // Prefetch scheduling happens at the carousel. Do not leave a
            // current-image consumer behind a background request's 300ms delay.
            promise: service.fetchBlob(src, {
              priority: "high",
              onProgress: (progress) => {
                for (const consumer of consumers)
                  consumer.onProgress?.(progress);
              },
              onEvent: (event) => {
                for (const consumer of consumers) consumer.onEvent?.(event);
              },
            }),
          };
          this.pending.set(src, task);
          const activeTask = task;
          void task.promise.then(
            () => {
              if (this.pending.get(src) === activeTask)
                this.pending.delete(src);
            },
            () => {
              if (this.pending.get(src) === activeTask)
                this.pending.delete(src);
            },
          );
        }
        task.consumers.add(callbacks);
        const controller = new AbortController();
        const activeTask = task;
        const release = () => {
          if (!activeTask.consumers.delete(callbacks)) return;
          controller.abort();
          // React cleans up the prefetch effect before setting up the newly
          // active slide. Let it adopt this request within the same commit.
          queueMicrotask(() => {
            if (
              activeTask.consumers.size === 0 &&
              this.pending.get(src) === activeTask
            ) {
              this.pending.delete(src);
              activeTask.service.cleanup();
            }
          });
        };
        cancel = release;
        return abortable(task.promise, controller.signal).finally(() => {
          release();
          if (cancel === release) cancel = undefined;
        });
      },
    };
  }

  dispose(): void {
    for (const task of this.pending.values()) task.service.cleanup();
    this.pending.clear();
  }
}
