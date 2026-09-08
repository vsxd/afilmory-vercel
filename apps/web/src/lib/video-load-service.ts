import { getI18n } from "~/i18n";

import type {
  LoadingCallbacks,
  VideoProcessResult,
  VideoSource,
} from "./image-loading-types";
import { createAbortError } from "./image-loading-types";
import type { MediaLease } from "./media-resource";
import {
  abortable,
  MediaResourceScope,
  throwIfAborted,
} from "./media-resource";
import { extractMotionPhotoVideo } from "./motion-photo-extractor";
import { VideoBlobCache } from "./video-blob-cache";
import { needsVideoConversion } from "./video-converter";

interface VideoTask {
  controller: AbortController;
  element: HTMLVideoElement;
  lease?: MediaLease;
  attached: boolean;
}

export class VideoLoadService {
  private current: VideoTask | null = null;

  constructor(
    private readonly readyTimeoutMs = 15_000,
    private readonly cache = new VideoBlobCache(),
    private readonly resources = new MediaResourceScope(),
  ) {}

  async processVideo(
    source: VideoSource,
    element: HTMLVideoElement,
    callbacks: LoadingCallbacks = {},
  ): Promise<VideoProcessResult> {
    this.cleanup();
    const task: VideoTask = {
      controller: new AbortController(),
      element,
      attached: false,
    };
    this.current = task;
    const { signal } = task.controller;
    const update: NonNullable<LoadingCallbacks["onLoadingStateUpdate"]> = (
      state,
    ) => {
      if (!signal.aborted && this.current === task)
        callbacks.onLoadingStateUpdate?.(state);
    };
    try {
      let src: string;
      let result: VideoProcessResult;
      if (source.type === "motion-photo") {
        update({
          isVisible: true,
          conversionMessage: getI18n().t("video.motion-photo.extracting"),
        });
        const blob = await abortable(
          extractMotionPhotoVideo(
            source.imageUrl,
            {
              motionPhotoOffset: source.offset,
              motionPhotoVideoSize: source.size,
              presentationTimestampUs: source.presentationTimestamp,
            },
            signal,
          ),
          signal,
        );
        throwIfAborted(signal);
        if (!blob) throw new Error("Failed to extract Motion Photo video");
        task.lease = this.resources.acquire(blob);
        src = task.lease.blobSrc;
        result = {
          convertedVideoUrl: src,
          conversionMethod: "motion-photo-extraction",
        };
      } else if (source.type === "live-photo") {
        if (needsVideoConversion(source.videoUrl)) {
          update({ isVisible: true, isConverting: true, loadingProgress: 0 });
          const blob = await abortable(
            this.cache.get(source.videoUrl, signal),
            signal,
          );
          throwIfAborted(signal);
          task.lease = this.resources.acquire(blob);
          src = task.lease.blobSrc;
          result = { convertedVideoUrl: src };
        } else {
          src = source.videoUrl;
          result = { conversionMethod: "" };
        }
      } else {
        throw new Error("No video source provided");
      }
      throwIfAborted(signal);
      update({ isVisible: false, isConverting: false });
      await this.waitUntilReady(task, src);
      throwIfAborted(signal);
      return result;
    } catch (error) {
      if (!signal.aborted && this.current === task) {
        console.error("Failed to process video:", error);
        update({ isVisible: false, isConverting: false });
        this.cleanup();
      }
      throw error;
    }
  }

  cleanup(): void {
    const task = this.current;
    if (!task) return;
    this.current = null;
    task.controller.abort();
    if (task.attached) {
      task.element.pause();
      task.element.removeAttribute("src");
      task.element.load();
    }
    task.lease?.release();
  }

  private waitUntilReady(task: VideoTask, src: string): Promise<void> {
    const {
      element,
      controller: { signal },
    } = task;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        for (const event of ["loadeddata", "canplay", "canplaythrough"])
          element.removeEventListener(event, ready);
        element.removeEventListener("error", failed);
        signal.removeEventListener("abort", aborted);
        clearTimeout(timeout);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("Video failed to load"));
      };
      const aborted = () => {
        cleanup();
        reject(createAbortError("Video load cancelled"));
      };
      for (const event of ["loadeddata", "canplay", "canplaythrough"])
        element.addEventListener(event, ready);
      element.addEventListener("error", failed);
      signal.addEventListener("abort", aborted, { once: true });
      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Video did not become ready within ${this.readyTimeoutMs}ms`,
          ),
        );
      }, this.readyTimeoutMs);
      if (signal.aborted) {
        aborted();
        return;
      }
      task.attached = true;
      try {
        element.src = src;
        element.load();
        if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
}
