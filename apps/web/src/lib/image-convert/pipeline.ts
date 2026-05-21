export interface PipelineOptions {
  maxConcurrent?: number;
}

type TaskExecutor<T> = () => Promise<T>;

type QueueTask<T> = {
  execute: TaskExecutor<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Lightweight promise queue to throttle image conversion workloads
 */
export class ImageConversionPipeline {
  private maxConcurrent: number;
  private readonly queue: Array<QueueTask<any>> = [];
  private activeCount = 0;

  constructor(options: PipelineOptions = {}) {
    const { maxConcurrent = 2 } = options;
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  enqueue<T>(task: TaskExecutor<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queueTask: QueueTask<T> = {
        execute: task,
        resolve,
        reject,
      };

      this.queue.push(queueTask);
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

  setMaxConcurrent(maxConcurrent: number): void {
    if (!Number.isFinite(maxConcurrent)) {
      throw new TypeError("maxConcurrent must be a finite number");
    }

    const normalizedValue = Math.max(1, Math.floor(maxConcurrent));
    if (normalizedValue === this.maxConcurrent) {
      return;
    }

    this.maxConcurrent = normalizedValue;
    this.drainQueue();
  }

  private drainQueue(): void {
    if (this.activeCount >= this.maxConcurrent) {
      return;
    }

    const nextTask = this.queue.shift();
    if (!nextTask) {
      return;
    }

    this.activeCount += 1;

    // Run task asynchronously without blocking
    (async () => {
      try {
        const result = await nextTask.execute();
        nextTask.resolve(result);
      } catch (error) {
        nextTask.reject(error);
      } finally {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.drainQueue();
      }
    })();
  }
}
