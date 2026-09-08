import { createAbortError } from "../image-loading-types";

export interface PipelineOptions {
  maxConcurrent?: number;
}
interface QueueTask {
  run: () => Promise<void>;
  cancel: () => void;
}

function concurrency(value: number): number {
  if (!Number.isFinite(value))
    throw new TypeError("maxConcurrent must be a finite number");
  return Math.max(1, Math.floor(value));
}

/** Cancellation settles the caller immediately; an active codec retains its slot until it exits. */
export class ImageConversionPipeline {
  private maxConcurrent: number;
  private readonly queue: QueueTask[] = [];
  private readonly tasks = new Set<QueueTask>();
  private readonly idleWaiters = new Set<() => void>();
  private activeCount = 0;
  private disposed = false;

  constructor(options: PipelineOptions = {}) {
    this.maxConcurrent = concurrency(options.maxConcurrent ?? 2);
  }

  enqueue<T>(execute: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.disposed || signal?.aborted)
      return Promise.reject(createAbortError("Image conversion cancelled"));
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let started = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", task.cancel);
        callback();
      };
      const task: QueueTask = {
        cancel: () => {
          finish(() => reject(createAbortError("Image conversion cancelled")));
          if (!started) {
            const index = this.queue.indexOf(task);
            if (index !== -1) this.queue.splice(index, 1);
            this.tasks.delete(task);
            this.notifyIdle();
          }
        },
        run: async () => {
          started = true;
          this.activeCount++;
          try {
            const result = await execute();
            finish(() => resolve(result));
          } catch (error) {
            finish(() => reject(error));
          } finally {
            this.activeCount--;
            this.tasks.delete(task);
            this.drainQueue();
            this.notifyIdle();
          }
        },
      };
      signal?.addEventListener("abort", task.cancel, { once: true });
      this.tasks.add(task);
      this.queue.push(task);
      this.drainQueue();
    });
  }

  getActiveCount(): number {
    return this.activeCount;
  }
  getPendingCount(): number {
    return this.queue.length;
  }
  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  setMaxConcurrent(value: number): void {
    this.maxConcurrent = concurrency(value);
    this.drainQueue();
  }

  /** Cancels queued/active callers now; resolves once non-interruptible codecs have drained. */
  dispose(): Promise<void> {
    this.disposed = true;
    for (const task of this.tasks) task.cancel();
    if (this.activeCount === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  private drainQueue(): void {
    while (!this.disposed && this.activeCount < this.maxConcurrent) {
      const task = this.queue.shift();
      if (!task) return;
      void task.run();
    }
  }

  private notifyIdle(): void {
    if (this.activeCount !== 0 || this.queue.length > 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
}
