import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

const MIN_VISIBLE_DURATION_MS = 300;

// WebGL 纹理质量徽标：文案走 i18n，颜色用调色板工具类
// （与旧内联 hex 等值：#4ade80→green-400、#fbbf24→amber-400、#f87171→red-400）。
const WEBGL_QUALITY_BADGES = {
  high: {
    labelKey: "loading.webgl.quality.high",
    className: "text-green-400",
  },
  medium: {
    labelKey: "loading.webgl.quality.medium",
    className: "text-amber-400",
  },
  low: {
    labelKey: "loading.webgl.quality.low",
    className: "text-red-400",
  },
} as const;

interface LoadingState {
  isVisible: boolean;
  isConverting: boolean;
  isQueueWaiting: boolean;
  isHeicFormat: boolean;
  loadingProgress: number;
  loadedBytes: number;
  totalBytes: number;
  conversionMessage?: string; // 视频转换消息

  // WebGL 相关状态
  isWebGLLoading?: boolean; // WebGL 纹理是否正在加载
  webglMessage?: string; // WebGL 加载消息
  webglQuality?: "high" | "medium" | "low" | "unknown"; // WebGL 纹理质量

  // 错误状态
  isError?: boolean; // 是否出现错误
  errorMessage?: string; // 错误消息
  errorDescription?: string;
  onRetry?: () => void;
}

interface LoadingIndicatorRef {
  updateLoadingState: (state: Partial<LoadingState>) => void;
  resetLoadingState: () => void;
}

const initialLoadingState: LoadingState = {
  isVisible: false,
  isConverting: false,
  isHeicFormat: false,
  loadingProgress: 0,
  loadedBytes: 0,
  totalBytes: 0,
  conversionMessage: undefined,
  isQueueWaiting: false,

  isWebGLLoading: false,
  webglMessage: undefined,
  webglQuality: "unknown",

  isError: false,
  errorMessage: undefined,
  errorDescription: undefined,
  onRetry: undefined,
};

export const LoadingIndicator = ({
  ref,
}: {
  ref?: React.Ref<LoadingIndicatorRef | null>;
}) => {
  const { t } = useTranslation();
  const [loadingState, setLoadingState] =
    useState<LoadingState>(initialLoadingState);
  const visibleSinceRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const hideImmediately = useCallback(() => {
    clearHideTimer();
    visibleSinceRef.current = null;
    setLoadingState(initialLoadingState);
  }, [clearHideTimer]);

  useEffect(() => hideImmediately, [hideImmediately]);

  useImperativeHandle(
    ref,
    useCallback(
      () => ({
        updateLoadingState: (partialState: Partial<LoadingState>) => {
          if (partialState.isVisible === false) {
            const visibleSince = visibleSinceRef.current;
            if (visibleSince === null) {
              hideImmediately();
              return;
            }

            const elapsed = Date.now() - visibleSince;
            const remaining = MIN_VISIBLE_DURATION_MS - elapsed;
            if (remaining <= 0) {
              hideImmediately();
              return;
            }

            clearHideTimer();
            hideTimerRef.current = setTimeout(() => {
              hideImmediately();
            }, remaining);
            return;
          }

          clearHideTimer();
          setLoadingState((prev) => {
            if (!prev.isVisible) {
              visibleSinceRef.current = Date.now();
            }
            return { ...prev, ...partialState, isVisible: true };
          });
        },
        resetLoadingState: () => {
          hideImmediately();
        },
      }),
      [clearHideTimer, hideImmediately],
    ),
  );

  if (!loadingState.isVisible) {
    return null;
  }

  const webglQualityBadge =
    loadingState.webglQuality && loadingState.webglQuality !== "unknown"
      ? WEBGL_QUALITY_BADGES[loadingState.webglQuality]
      : null;

  return (
    // 加载进度使用 polite；错误态切换为 alert，避免读屏器错过最终失败。
    <div
      role={loadingState.isError ? "alert" : "status"}
      aria-live={loadingState.isError ? "assertive" : "polite"}
      aria-atomic="true"
      data-photo-viewer-gesture-ignore
      className={`${loadingState.isError ? "pointer-events-auto" : "pointer-events-none"} absolute right-4 bottom-4 left-4 z-10 max-w-sm rounded-xl border border-white/10 bg-black/80 px-3 py-2 backdrop-blur sm:left-auto`}
    >
      <div className="flex items-center gap-3 text-white">
        <div className="relative">
          {loadingState.isError ? (
            <div className="i-mingcute-warning-line text-lg text-red-400" />
          ) : (
            <div className="i-mingcute-loading-3-line animate-spin text-lg" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          {loadingState.isError ? (
            // 错误状态
            <>
              <p className="text-sm font-medium text-red-400">
                {loadingState.errorMessage || t("photo.error.loading")}
              </p>
              {loadingState.errorDescription && (
                <p className="text-xs leading-relaxed text-white/80">
                  {loadingState.errorDescription}
                </p>
              )}
              {loadingState.onRetry && (
                <button
                  type="button"
                  onClick={loadingState.onRetry}
                  className="mt-2 min-h-11 self-start rounded-lg border border-white/20 px-3 text-sm font-medium text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                >
                  {t("photo.error.retry")}
                </button>
              )}
            </>
          ) : loadingState.isConverting ? (
            // 视频转换状态
            <>
              <p className="text-xs font-medium text-white tabular-nums">
                {loadingState.isQueueWaiting
                  ? loadingState.conversionMessage || t("loading.queue.waiting")
                  : loadingState.conversionMessage || t("loading.converting")}
              </p>
            </>
          ) : loadingState.isWebGLLoading ? (
            // WebGL 加载状态
            <>
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-white">
                  {loadingState.webglMessage || t("loading.webgl.main")}
                </p>
                {webglQualityBadge && (
                  <span className={`text-xs ${webglQualityBadge.className}`}>
                    {t(webglQualityBadge.labelKey)}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/70">
                {t("loading.webgl.building")}
              </p>
            </>
          ) : (
            // 图片加载状态
            <>
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-white">
                  {loadingState.isHeicFormat
                    ? t("loading.heic.main")
                    : t("loading.default")}
                </p>
                <span className="text-xs text-white/60 tabular-nums">
                  {Math.round(loadingState.loadingProgress)}%
                </span>
              </div>
              {loadingState.totalBytes > 0 && (
                <p className="text-xs text-white/70 tabular-nums">
                  {(loadingState.loadedBytes / 1024 / 1024).toFixed(1)}MB /{" "}
                  {(loadingState.totalBytes / 1024 / 1024).toFixed(1)}MB
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export type { LoadingIndicatorRef, LoadingState };
