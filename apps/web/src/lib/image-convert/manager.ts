/**
 * 图像转换策略模式实现
 * 支持多种浏览器原生不支持的图片格式转换
 */
import { debugLog } from "~/lib/debug-log";
import { detectFileTypeFromBlob } from "~/lib/file-type";

import type { LoadingCallbacks } from "../image-loading-types";
import { createAbortError } from "../image-loading-types";
import { abortable, throwIfAborted } from "../media-resource";
import type { MediaTaskEvent } from "../media-task";
import { MediaTaskError } from "../media-task";
import type { PipelineOptions } from "./pipeline";
import { ImageConversionPipeline } from "./pipeline";
import { HeicConverterStrategy } from "./strategies/heic";
import { TiffConverterStrategy } from "./strategies/tiff";
import type {
  ImageConversionOutcome,
  ImageConverterStrategy,
  OriginalImageReason,
} from "./type";

interface PendingConversion {
  controller: AbortController;
  promise: Promise<ImageConversionOutcome>;
  listeners: Set<(event: MediaTaskEvent) => void>;
  lastEvent?: MediaTaskEvent;
}

// 图像转换策略管理器
export class ImageConverterManager {
  private strategies = new Map<string, ImageConverterStrategy>();
  private readonly conversionPipeline: ImageConversionPipeline;
  private readonly pendingConversions = new Map<string, PendingConversion>();
  private disposed = false;

  constructor(options: PipelineOptions = {}) {
    this.conversionPipeline = new ImageConversionPipeline({
      maxConcurrent: options.maxConcurrent ?? 2,
    });
    // 注册默认策略
    this.registerStrategy(new HeicConverterStrategy());
    this.registerStrategy(new TiffConverterStrategy());
  }

  /**
   * 注册转换策略
   */
  registerStrategy(strategy: ImageConverterStrategy): void {
    // 为每个支持的格式注册策略
    strategy.getSupportedFormats().forEach((format) => {
      this.strategies.set(format, strategy);
    });
    debugLog(`Registered image converter strategy: ${strategy.getName()}`);
  }

  /**
   * 移除转换策略
   */
  removeStrategy(strategyName: string): boolean {
    let removed = false;
    const strategy = Array.from(this.strategies.values()).find(
      (s) => s.getName() === strategyName,
    );

    if (strategy) {
      strategy.getSupportedFormats().forEach((format) => {
        if (this.strategies.get(format) === strategy) {
          this.strategies.delete(format);
          removed = true;
        }
      });
      if (removed)
        debugLog(`Removed image converter strategy: ${strategyName}`);
    }
    return removed;
  }

  /**
   * 获取所有已注册的策略
   */
  getStrategies(): ImageConverterStrategy[] {
    const uniqueStrategies = new Set(this.strategies.values());
    return Array.from(uniqueStrategies);
  }

  /**
   * 使用 file-type 直接查找适合的转换策略
   */
  private async findSuitableStrategy(
    blob: Blob,
  ): Promise<
    | { kind: "convert"; strategy: ImageConverterStrategy }
    | { kind: "original"; reason: OriginalImageReason }
  > {
    try {
      const fileType = await detectFileTypeFromBlob(blob);
      if (!fileType) return { kind: "original", reason: "unidentified" };
      const strategy = this.strategies.get(fileType.mime);
      if (!strategy) return { kind: "original", reason: "unhandled" };
      return (await strategy.shouldConvert(blob))
        ? { kind: "convert", strategy }
        : { kind: "original", reason: "native" };
    } catch (cause) {
      throw new MediaTaskError(
        "detect",
        "detection-failed",
        "Image format detection failed",
        { cause },
      );
    }
  }

  convertImage(
    blob: Blob,
    originalUrl: string,
    callbacks?: LoadingCallbacks,
    signal?: AbortSignal,
  ): Promise<ImageConversionOutcome> {
    if (this.disposed || signal?.aborted)
      return Promise.reject(
        createAbortError("Image converter disposed or cancelled"),
      );
    let pending = this.pendingConversions.get(originalUrl);
    if (!pending) {
      const controller = new AbortController();
      const task: PendingConversion = {
        controller,
        listeners: new Set(),
        promise: Promise.resolve()
          .then(async () => {
            throwIfAborted(controller.signal);
            const selection = await abortable(
              this.findSuitableStrategy(blob),
              controller.signal,
            );
            throwIfAborted(controller.signal);
            if (selection.kind === "original") return { ...selection, blob };
            const { strategy } = selection;
            const emit = (event: MediaTaskEvent) => {
              if (controller.signal.aborted) return;
              task.lastEvent = event;
              for (const listener of task.listeners) listener(event);
            };
            if (
              this.conversionPipeline.getActiveCount() >=
              this.conversionPipeline.getMaxConcurrent()
            ) {
              emit({ type: "queued", format: strategy.getName() });
            }
            return await this.conversionPipeline.enqueue(
              async (): Promise<ImageConversionOutcome> => {
                emit({
                  type: "converting",
                  format: strategy.getName(),
                  originalSize: blob.size,
                });
                throwIfAborted(controller.signal);
                try {
                  const converted = await strategy.convert(blob, originalUrl);
                  throwIfAborted(controller.signal);
                  return { kind: "converted", ...converted };
                } catch (cause) {
                  throwIfAborted(controller.signal);
                  throw new MediaTaskError(
                    "convert",
                    "conversion-failed",
                    `${strategy.getName()} conversion failed`,
                    { cause },
                  );
                }
              },
              controller.signal,
            );
          })
          .finally(() => {
            if (this.pendingConversions.get(originalUrl) === task)
              this.pendingConversions.delete(originalUrl);
          }),
      };
      this.pendingConversions.set(originalUrl, task);
      pending = task;
    }
    return this.subscribe(originalUrl, pending, callbacks, signal);
  }

  private subscribe(
    key: string,
    task: PendingConversion,
    callbacks?: LoadingCallbacks,
    signal?: AbortSignal,
  ): Promise<ImageConversionOutcome> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const release = () => {
        signal?.removeEventListener("abort", onAbort);
        task.listeners.delete(notify);
        if (
          task.listeners.size === 0 &&
          this.pendingConversions.get(key) === task
        ) {
          this.pendingConversions.delete(key);
          task.controller.abort();
        }
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        release();
        callback();
      };
      const onAbort = () =>
        finish(() => reject(createAbortError("Image conversion cancelled")));
      const notify = (event: MediaTaskEvent) => {
        if (settled) return;
        try {
          callbacks?.onEvent?.(event);
        } catch (error) {
          finish(() => reject(error));
        }
      };
      task.listeners.add(notify);
      signal?.addEventListener("abort", onAbort, { once: true });
      task.promise.then(
        (result) => finish(() => resolve(result)),
        (error: unknown) => finish(() => reject(error)),
      );
      if (task.lastEvent) notify(task.lastEvent);
    });
  }

  /** Runtime ownership ends synchronously; callers can await decoder drainage. */
  dispose(): Promise<void> {
    this.disposed = true;
    for (const task of this.pendingConversions.values())
      task.controller.abort();
    this.pendingConversions.clear();
    this.strategies.clear();
    return this.conversionPipeline.dispose();
  }

  /**
   * 获取支持的格式列表
   */
  getSupportedFormats(): string[] {
    return Array.from(this.strategies.keys());
  }

  getPipelineStats(): {
    active: number;
    pending: number;
  } {
    return {
      active: this.conversionPipeline.getActiveCount(),
      pending: this.conversionPipeline.getPendingCount(),
    };
  }

  /**
   * 调整管道的最大并发转换数量
   */
  setMaxConcurrentConversions(maxConcurrent: number): void {
    this.conversionPipeline.setMaxConcurrent(maxConcurrent);
  }
}
