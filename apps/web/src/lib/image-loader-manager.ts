import type { RegularImageCache } from "~/lib/image-cache-service";
import { createRegularImageCache } from "~/lib/image-cache-service";
import { ImageConversionService } from "~/lib/image-conversion-service";
import { ImageFetchService } from "~/lib/image-fetch-service";
import type {
  ImageLoadResult,
  LoadingCallbacks,
  VideoProcessResult,
  VideoSource,
} from "~/lib/image-loading-types";
import { VideoLoadService } from "~/lib/video-load-service";

import {
  abortable,
  MediaResourceScope,
  throwIfAborted,
} from "./media-resource";
import { MediaTaskError } from "./media-task";

export class ImageLoaderManager {
  private imageTask: AbortController | null = null;
  private readonly resources: MediaResourceScope;
  private readonly imageFetchService: Pick<
    ImageFetchService,
    "fetchBlob" | "cleanup"
  >;
  private readonly imageConversionService: ImageConversionService;
  private readonly videoLoadService: VideoLoadService;

  constructor(
    regularImageCache: RegularImageCache = createRegularImageCache(),
    services: {
      resources?: MediaResourceScope;
      imageFetchService?: Pick<ImageFetchService, "fetchBlob" | "cleanup">;
      imageConversionService?: ImageConversionService;
      videoLoadService?: VideoLoadService;
    } = {},
  ) {
    this.resources = services.resources ?? new MediaResourceScope();
    this.imageFetchService =
      services.imageFetchService ?? new ImageFetchService();
    this.imageConversionService =
      services.imageConversionService ??
      new ImageConversionService(regularImageCache);
    this.videoLoadService = services.videoLoadService ?? new VideoLoadService();
  }

  async loadImage(
    src: string,
    callbacks: LoadingCallbacks = {},
  ): Promise<ImageLoadResult> {
    this.imageTask?.abort();
    this.imageFetchService.cleanup();
    const task = new AbortController();
    this.imageTask = task;
    const { signal } = task;
    const guarded: LoadingCallbacks = {
      priority: callbacks.priority,
      onProgress: (value) => {
        if (!signal.aborted) callbacks.onProgress?.(value);
      },
      onError: (error) => {
        if (!signal.aborted) callbacks.onError?.(error);
      },
      onEvent: (event) => {
        if (!signal.aborted) callbacks.onEvent?.(event);
      },
      onLoadingStateUpdate: (state) => {
        if (!signal.aborted) callbacks.onLoadingStateUpdate?.(state);
      },
    };
    try {
      let blob = this.imageConversionService.getCachedRegularImage(src);
      if (!blob) {
        guarded.onEvent?.({ type: "fetching" });
        const original = await abortable(
          this.imageFetchService.fetchBlob(src, guarded),
          signal,
        );
        throwIfAborted(signal);
        try {
          blob = await abortable(
            this.imageConversionService.processImageBlob(
              original,
              src,
              guarded,
              signal,
            ),
            signal,
          );
        } catch (error) {
          throwIfAborted(signal);
          if (
            !(error instanceof MediaTaskError) ||
            error.code !== "conversion-failed"
          )
            throw error;
          // A native decoder may still handle this format. Do not cache the
          // failed conversion as a success: later requests may retry conversion.
          guarded.onEvent?.({ type: "native-fallback", error });
          console.warn(
            "Image conversion failed; trying the native decoder:",
            error,
          );
          blob = original;
        }
      }
      throwIfAborted(signal);
      guarded.onEvent?.({ type: "loaded" });
      throwIfAborted(signal);
      return this.resources.acquire(blob);
    } catch (error) {
      if (!signal.aborted) {
        guarded.onLoadingStateUpdate?.({ isVisible: false });
        guarded.onError?.(
          error instanceof Error
            ? error
            : new Error("Image load failed", { cause: error }),
        );
      }
      throw error;
    }
  }

  async processVideo(
    videoSource: VideoSource,
    videoElement: HTMLVideoElement,
    callbacks: LoadingCallbacks = {},
  ): Promise<VideoProcessResult> {
    return await this.videoLoadService.processVideo(
      videoSource,
      videoElement,
      callbacks,
    );
  }

  cleanup(): void {
    this.imageTask?.abort();
    this.imageTask = null;
    this.imageFetchService.cleanup();
    this.videoLoadService.cleanup();
  }
}

export {
  createRegularImageCache,
  type ImageCacheResult,
  type RegularImageCache,
} from "~/lib/image-cache-service";
export {
  type ImageLoadResult,
  type LoadingCallbacks,
  type LoadingState,
  type VideoProcessResult,
} from "~/lib/image-loading-types";
