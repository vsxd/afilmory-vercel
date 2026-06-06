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

export class ImageLoaderManager {
  private readonly imageFetchService: ImageFetchService;
  private readonly imageConversionService: ImageConversionService;
  private readonly videoLoadService: VideoLoadService;

  constructor(
    regularImageCache: RegularImageCache = createRegularImageCache(),
    services: {
      imageFetchService?: ImageFetchService;
      imageConversionService?: ImageConversionService;
      videoLoadService?: VideoLoadService;
    } = {},
  ) {
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
    const cachedRegularImage =
      this.imageConversionService.getCachedRegularImage(src, callbacks);

    if (cachedRegularImage) {
      return cachedRegularImage;
    }

    callbacks.onLoadingStateUpdate?.({
      isVisible: true,
    });

    try {
      const blob = await this.imageFetchService.fetchBlob(src, callbacks);
      return await this.imageConversionService.processImageBlob(
        blob,
        src,
        callbacks,
      );
    } catch (error) {
      callbacks.onLoadingStateUpdate?.({
        isVisible: false,
      });
      callbacks.onError?.();
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
