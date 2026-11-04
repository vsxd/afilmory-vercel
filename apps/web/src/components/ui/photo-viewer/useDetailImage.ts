import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MediaLease } from "~/lib/media-resource";
import { useAfilmoryRuntime } from "~/runtime/app-runtime";

import type { LoadingIndicatorRef } from "./LoadingIndicator";
import {
  presentMediaTaskError,
  presentMediaTaskEvent,
} from "./media-loading-presentation";

/** Original bytes are requested by zoom, independently of the painted display image. */
export function useDetailImage(
  src: string,
  active: boolean,
  indicatorRef: RefObject<LoadingIndicatorRef | null>,
) {
  const runtime = useAfilmoryRuntime();
  const { t } = useTranslation();
  const [request, setRequest] = useState<{
    src: string;
    attempt: number;
  } | null>(null);
  const [loaded, setLoaded] = useState<{
    request: typeof request;
    lease: MediaLease;
  } | null>(null);
  const [failedRequest, setFailedRequest] = useState<typeof request>(null);
  const requestDetail = useCallback(() => {
    if (active)
      setRequest((previous) =>
        previous?.src === src ? previous : { src, attempt: 0 },
      );
  }, [active, src]);
  const retry = useCallback(() => {
    if (!active) return;
    // Format detection may have cached a response whose decoder later failed.
    // A user retry must be able to recover when the origin replaces those bytes.
    runtime.imageCache.delete(src);
    setRequest((previous) => ({
      src,
      attempt: (previous?.attempt ?? 0) + 1,
    }));
  }, [active, src, runtime.imageCache]);
  const enabled = active && request?.src === src;
  const latest = useRef({ t, indicatorRef, enabled, request });
  latest.current = { t, indicatorRef, enabled, request };
  const reportFailure = useCallback(
    (cause: unknown) => {
      if (!latest.current.enabled || latest.current.request !== request) return;
      setFailedRequest(request);
      const error =
        cause instanceof Error
          ? cause
          : new Error("Original image failed", { cause });
      latest.current.indicatorRef.current?.updateLoadingState({
        ...presentMediaTaskError(error, latest.current.t),
        onRetry: retry,
      });
    },
    [request, retry],
  );

  useEffect(() => {
    if (!active) {
      setRequest(null);
      setLoaded(null);
    }
  }, [active]);

  useEffect(() => {
    if (!enabled) return;
    const loader = runtime.imageLoading.createLoader();
    let cancelled = false;
    let lease: MediaLease | undefined;
    latest.current.indicatorRef.current?.resetLoadingState();
    void loader
      .loadImage(src, {
        priority: "high",
        onEvent: (event) => {
          if (!cancelled)
            latest.current.indicatorRef.current?.updateLoadingState(
              presentMediaTaskEvent(event, latest.current.t),
            );
        },
      })
      .then((result) => {
        if (cancelled) {
          result.release();
          return;
        }
        lease = result;
        setLoaded({ request, lease: result });
      })
      .catch((cause: unknown) => {
        if (
          cancelled ||
          (cause instanceof Error && cause.name === "AbortError")
        )
          return;
        reportFailure(cause);
      });
    return () => {
      cancelled = true;
      runtime.imageLoading.cleanupLoader(loader);
      lease?.release();
    };
  }, [enabled, src, request, reportFailure, runtime.imageLoading]);

  return {
    requestDetail,
    reportFailure,
    hasError: enabled && failedRequest === request,
    lease:
      enabled && failedRequest !== request && loaded?.request === request
        ? loaded.lease
        : null,
  };
}
