import type { VideoSource } from "~/components/ui/photo-viewer/types";
import { getI18n } from "~/i18n";
import { debugLog } from "~/lib/debug-log";
import type {
  LoadingCallbacks,
  VideoProcessResult,
} from "~/lib/image-loading-types";
import { createAbortError } from "~/lib/image-loading-types";
import { extractMotionPhotoVideo } from "~/lib/motion-photo-extractor";
import { convertMovToMp4, needsVideoConversion } from "~/lib/video-converter";

export class VideoLoadService {
  private pendingReject: ((reason?: unknown) => void) | null = null;
  private pendingCleanup: (() => void) | null = null;
  private currentAbortController: AbortController | null = null;
  private activeVideoElement: HTMLVideoElement | null = null;
  private ownedVideoUrl: string | null = null;

  async processVideo(
    videoSource: VideoSource,
    videoElement: HTMLVideoElement,
    callbacks: LoadingCallbacks = {},
  ): Promise<VideoProcessResult> {
    const { onLoadingStateUpdate } = callbacks;
    const i18n = getI18n();

    this.currentAbortController?.abort();
    this.currentAbortController = new AbortController();

    try {
      if (videoSource.type === "motion-photo") {
        debugLog("Processing Motion Photo embedded video...");
        onLoadingStateUpdate?.({
          isVisible: true,
          conversionMessage: i18n.t("video.motion-photo.extracting"),
        });

        const extractedVideoUrl = await extractMotionPhotoVideo(
          videoSource.imageUrl,
          {
            motionPhotoOffset: videoSource.offset,
            motionPhotoVideoSize: videoSource.size,
            presentationTimestampUs: videoSource.presentationTimestamp,
          },
          this.currentAbortController.signal,
        );

        if (!extractedVideoUrl) {
          throw new Error("Failed to extract Motion Photo video");
        }

        this.setVideoSource(videoElement, extractedVideoUrl, {
          ownedBlobUrl: true,
        });
        debugLog("Motion Photo video extracted successfully");
        onLoadingStateUpdate?.({
          isVisible: false,
        });

        return await this.waitForVideoReady(videoElement, {
          convertedVideoUrl: extractedVideoUrl,
          conversionMethod: "motion-photo-extraction",
        });
      }

      if (videoSource.type === "live-photo") {
        if (needsVideoConversion(videoSource.videoUrl)) {
          return await this.convertVideo(
            videoSource.videoUrl,
            videoElement,
            callbacks,
          );
        }

        return await this.loadDirectVideo(videoSource.videoUrl, videoElement);
      }

      throw new Error("No video source provided");
    } catch (error) {
      console.error("Failed to process video:", error);
      onLoadingStateUpdate?.({
        isVisible: false,
      });
      throw error;
    }
  }

  cleanup(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    if (this.pendingReject) {
      this.rejectPending(createAbortError("Video load cancelled"));
    }

    this.clearVideoElement();
  }

  private rejectPending(error: Error): void {
    if (!this.pendingReject) {
      return;
    }

    const reject = this.pendingReject;
    this.pendingReject = null;
    reject(error);
  }

  private clearVideoElement(): void {
    this.rejectPending(createAbortError("Video load cancelled"));

    if (this.pendingCleanup) {
      this.pendingCleanup();
      this.pendingCleanup = null;
    }

    const videoElement = this.activeVideoElement;
    if (videoElement) {
      try {
        videoElement.pause();
      } catch (error) {
        console.warn("Failed to pause video during cleanup:", error);
      }

      videoElement.removeAttribute("src");
      videoElement.load();
    }

    if (this.ownedVideoUrl) {
      try {
        URL.revokeObjectURL(this.ownedVideoUrl);
        debugLog("Revoked owned video blob URL during cleanup");
      } catch (error) {
        console.warn("Failed to revoke owned video blob URL:", error);
      }
    }

    this.activeVideoElement = null;
    this.ownedVideoUrl = null;
  }

  private setVideoSource(
    videoElement: HTMLVideoElement,
    src: string,
    options: { ownedBlobUrl?: boolean } = {},
  ): void {
    this.clearVideoElement();
    this.activeVideoElement = videoElement;
    this.ownedVideoUrl = options.ownedBlobUrl ? src : null;
    videoElement.src = src;
    videoElement.load();
  }

  private waitForVideoReady(
    videoElement: HTMLVideoElement,
    result: VideoProcessResult,
  ): Promise<VideoProcessResult> {
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;

      const cleanup = () => {
        videoElement.removeEventListener("canplaythrough", handleVideoCanPlay);
        videoElement.removeEventListener("error", handleVideoError);
        if (this.pendingCleanup === cleanup) {
          this.pendingCleanup = null;
        }
        if (this.pendingReject === reject) {
          this.pendingReject = null;
        }
      };

      const handleVideoCanPlay = () => {
        cleanup();
        resolve(result);
      };

      const handleVideoError = () => {
        cleanup();
        reject(new Error("Video failed to load"));
      };

      this.pendingCleanup = cleanup;

      videoElement.addEventListener("canplaythrough", handleVideoCanPlay);
      videoElement.addEventListener("error", handleVideoError);
    });
  }

  private async convertVideo(
    livePhotoVideoUrl: string,
    videoElement: HTMLVideoElement,
    callbacks: LoadingCallbacks,
  ): Promise<VideoProcessResult> {
    const { onLoadingStateUpdate } = callbacks;
    const i18n = getI18n();

    onLoadingStateUpdate?.({
      isVisible: true,
      isConverting: true,
      loadingProgress: 0,
    });

    debugLog("Converting MOV video to MP4...");

    const result = await convertMovToMp4(
      livePhotoVideoUrl,
      (progress) => {
        const codecKeywords: string[] = [
          i18n.t("video.codec.keyword"),
          "encoder",
          "codec",
          "编码器",
        ];
        const isCodecInfo = codecKeywords.some((keyword: string) =>
          progress.message.toLowerCase().includes(keyword.toLowerCase()),
        );

        onLoadingStateUpdate?.({
          isVisible: true,
          isConverting: progress.isConverting,
          loadingProgress: progress.progress,
          conversionMessage: progress.message,
          codecInfo: isCodecInfo ? progress.message : undefined,
        });
      },
      false,
      { signal: this.currentAbortController?.signal },
    );

    if (!result.success || !result.videoUrl) {
      console.error("Video conversion failed:", result.error);
      onLoadingStateUpdate?.({
        isVisible: false,
      });
      throw new Error(result.error || "Video conversion failed");
    }

    const convertedVideoUrl = result.videoUrl;
    this.setVideoSource(videoElement, result.videoUrl);
    debugLog(
      `Video conversion completed. Size: ${result.convertedSize ? Math.round(result.convertedSize / 1024) : "unknown"}KB`,
    );

    onLoadingStateUpdate?.({
      isVisible: false,
    });

    return await this.waitForVideoReady(videoElement, {
      convertedVideoUrl,
    });
  }

  private async loadDirectVideo(
    livePhotoVideoUrl: string,
    videoElement: HTMLVideoElement,
  ): Promise<VideoProcessResult> {
    this.setVideoSource(videoElement, livePhotoVideoUrl);

    return await this.waitForVideoReady(videoElement, {
      conversionMethod: "",
    });
  }
}
