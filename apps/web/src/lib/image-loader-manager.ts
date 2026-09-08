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

export class ImageLoaderManager {
  private imageTask: AbortController | null = null;
  private readonly resources: MediaResourceScope;
  private readonly imageFetchService: ImageFetchService;
  private readonly imageConversionService: ImageConversionService;
  private readonly videoLoadService: VideoLoadService;

  constructor(
    regularImageCache: RegularImageCache = createRegularImageCache(),
    services: {
      resources?: MediaResourceScope;
      imageFetchService?: ImageFetchService;
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
      onError: () => {
        if (!signal.aborted) callbacks.onError?.();
      },
      onLoadingStateUpdate: (state) => {
        if (!signal.aborted) callbacks.onLoadingStateUpdate?.(state);
      },
    };
    try {
      let blob = this.imageConversionService.getCachedRegularImage(src);
      if (!blob) {
        guarded.onLoadingStateUpdate?.({ isVisible: true });
        const original = await abortable(
          this.imageFetchService.fetchBlob(src, guarded),
          signal,
        );
        throwIfAborted(signal);
        blob = await abortable(
          this.imageConversionService.processImageBlob(
            original,
            src,
            guarded,
            signal,
          ),
          signal,
        );
      }
      throwIfAborted(signal);
      guarded.onLoadingStateUpdate?.({ isVisible: false });
      throwIfAborted(signal);
      return this.resources.acquire(blob);
    } catch (error) {
      if (!signal.aborted) {
        guarded.onLoadingStateUpdate?.({ isVisible: false });
        guarded.onError?.();
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
