/**
 * WebGL图像查看器React组件
 *
 * 高性能的WebGL图像查看器组件
 */

import * as React from "react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  defaultDoubleClickConfig,
  defaultPanningConfig,
  defaultPinchConfig,
  defaultWheelConfig,
} from "./constants";
import DebugInfoComponent from "./DebugInfo";
import type {
  DebugInfo,
  WebGLImageViewerProps,
  WebGLImageViewerRef,
} from "./interface";
import { WebGLViewerSession } from "./viewer-session";
import type { WebGLImageViewerEngine } from "./WebGLImageViewerEngine";

/**
 * WebGL图像查看器组件
 */
export const WebGLImageViewer = ({
  ref,
  src,
  sourceBlob,
  previewCache,
  viewerSession,
  detailSrc = "",
  detailSourceBlob,
  onDetailRequested,
  onDetailError,
  className = "",
  width,
  height,
  initialScale = 1,
  minScale = 0.1,
  maxScale = 10,
  wheel = defaultWheelConfig,
  pinch = defaultPinchConfig,
  doubleClick = defaultDoubleClickConfig,
  panning = defaultPanningConfig,
  limitToBounds = true,
  centerOnInit = true,
  smooth = true,
  onZoomChange,
  onLoadingStateChange,
  onImagePainted,
  onError,
  debug = false,
  ...divProps
}: WebGLImageViewerProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, "className"> & {
    ref?: React.RefObject<WebGLImageViewerRef | null>;
  }) => {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<WebGLImageViewerEngine | null>(null);
  const initialLoadRef = useRef<Promise<void> | null>(null);
  const localSession = useMemo(() => new WebGLViewerSession(), []);
  const session = viewerSession ?? localSession;
  const [tileOutlineEnabled, setTileOutlineEnabled] = useState(false);
  const [shouldReduceMotion, setShouldReduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false),
  );
  const effectiveSmooth = smooth && !shouldReduceMotion;
  const smoothRef = useRef(effectiveSmooth);
  smoothRef.current = effectiveSmooth;

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setShouldReduceMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const setDebugInfo = useRef<(debugInfo: DebugInfo) => void>(() => {});

  // 回调走 ref：引擎只在构造时捕获一次回调，这里让它捕获到的是「读最新 prop」
  // 的稳定包装，回调引用变化（如内联箭头函数）就不再需要重建引擎。
  const callbacksRef = useRef({
    onZoomChange,
    onLoadingStateChange,
    onImagePainted,
    onError,
    onDetailRequested,
    onDetailError,
  });
  useEffect(() => {
    callbacksRef.current = {
      onZoomChange,
      onLoadingStateChange,
      onImagePainted,
      onError,
      onDetailRequested,
      onDetailError,
    };
  });

  // 交互配置逐字段取值参与依赖：内联的同值对象字面量不触发重建。
  const { step: wheelStep, wheelDisabled } = {
    ...defaultWheelConfig,
    ...wheel,
  };
  const { disabled: pinchDisabled } = { ...defaultPinchConfig, ...pinch };
  const {
    step: doubleClickStep,
    disabled: doubleClickDisabled,
    mode: doubleClickMode,
    animationTime: doubleClickAnimationTime,
  } = { ...defaultDoubleClickConfig, ...doubleClick };
  const { disabled: panningDisabled } = { ...defaultPanningConfig, ...panning };

  // Only image/config changes start a new lease; callbacks and styles stay live.
  const config: Omit<Required<WebGLImageViewerProps>, "smooth"> = useMemo(
    () => ({
      src,
      sourceBlob: sourceBlob ?? null,
      previewCache: previewCache ?? null,
      viewerSession: null,
      detailSrc,
      // Source upgrades have their own effect and must not reset the view.
      detailSourceBlob: null,
      onDetailRequested: () => callbacksRef.current.onDetailRequested?.(),
      onDetailError: (error) => callbacksRef.current.onDetailError?.(error),
      // 引擎不读 className（真实值直接应用在 canvas 上），给常量以免样式变化重建引擎
      className: "",
      width: width || 0,
      height: height || 0,
      initialScale,
      minScale,
      maxScale,
      wheel: { step: wheelStep, wheelDisabled },
      pinch: { disabled: pinchDisabled },
      doubleClick: {
        step: doubleClickStep,
        disabled: doubleClickDisabled,
        mode: doubleClickMode,
        animationTime: doubleClickAnimationTime,
      },
      panning: { disabled: panningDisabled },
      limitToBounds,
      centerOnInit,
      onZoomChange: (originalScale, relativeScale) =>
        callbacksRef.current.onZoomChange?.(originalScale, relativeScale),
      onLoadingStateChange: (isLoading, state, quality) =>
        callbacksRef.current.onLoadingStateChange?.(isLoading, state, quality),
      onImagePainted: () => callbacksRef.current.onImagePainted?.(),
      onError: (error) => callbacksRef.current.onError?.(error),
      debug: debug || false,
    }),
    [
      src,
      sourceBlob,
      previewCache,
      detailSrc,
      width,
      height,
      initialScale,
      minScale,
      maxScale,
      wheelStep,
      wheelDisabled,
      pinchDisabled,
      doubleClickStep,
      doubleClickDisabled,
      doubleClickMode,
      doubleClickAnimationTime,
      panningDisabled,
      limitToBounds,
      centerOnInit,
      debug,
    ],
  );

  useImperativeHandle(ref, () => ({
    zoomIn: (animated?: boolean) => viewerRef.current?.zoomIn(animated),
    zoomOut: (animated?: boolean) => viewerRef.current?.zoomOut(animated),
    resetView: (animated?: boolean) => viewerRef.current?.resetView(animated),
    getScale: () => viewerRef.current?.getScale() || 1,
  }));

  useEffect(() => {
    if (!canvasHostRef.current) return;

    let webGLImageViewerEngine: WebGLImageViewerEngine | null = null;
    let release: (() => void) | undefined;
    let cancelled = false;

    try {
      const lease = session.attach(
        canvasHostRef.current,
        { ...config, smooth: smoothRef.current },
        debug ? setDebugInfo : undefined,
      );
      webGLImageViewerEngine = lease.engine;
      release = lease.release;
      // 如果提供了尺寸，传递给loadImage进行优化
      const preknownWidth = config.width > 0 ? config.width : undefined;
      const preknownHeight = config.height > 0 ? config.height : undefined;
      const initialLoad = webGLImageViewerEngine.loadImage(
        config.src,
        preknownWidth,
        preknownHeight,
        config.sourceBlob,
      );
      initialLoadRef.current = initialLoad;
      initialLoad.catch((error) => {
        if (cancelled) return;
        console.error("Failed to load WebGL image:", error);
        config.onError(error);
      });
      viewerRef.current = webGLImageViewerEngine;
      setTileOutlineEnabled(webGLImageViewerEngine.isTileOutlineEnabled());
    } catch (error) {
      console.error("Failed to initialize WebGL Image Viewer:", error);
      config.onError(error);
    }

    return () => {
      cancelled = true;
      release?.();
      viewerRef.current = null;
      initialLoadRef.current = null;
    };
  }, [config, debug, session]);

  useEffect(() => () => localSession.reset(), [localSession]);

  useEffect(() => {
    const canvas = canvasHostRef.current?.querySelector("canvas");
    if (canvas) canvas.className = className;
  }, [className, config, session]);

  useEffect(() => {
    if (!detailSourceBlob || !detailSrc) return;
    let cancelled = false;
    const engine = viewerRef.current;
    // An already-cached original can be supplied on mount. Always establish
    // the fallback first, so an upgrade cannot supersede the initial load.
    void initialLoadRef.current?.then(
      () => {
        if (cancelled) return;
        return engine
          ?.upgradeSource(detailSrc, detailSourceBlob)
          .catch((error) => {
            if (!cancelled) callbacksRef.current.onDetailError?.(error);
          });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [detailSrc, detailSourceBlob, config, session]);

  // Animation preferences are live state, not GPU resource configuration.
  // Rebuilding here would lose the canvas context and decode the image again.
  useEffect(() => {
    viewerRef.current?.setSmooth(effectiveSmooth);
  }, [effectiveSmooth]);

  const handleOutlineToggle = useCallback(
    (enabled: boolean) => {
      setTileOutlineEnabled(enabled);
      viewerRef.current?.setTileOutlineEnabled(enabled);
    },
    [setTileOutlineEnabled],
  );

  return (
    <div
      {...divProps}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...divProps.style,
      }}
    >
      <div ref={canvasHostRef} style={{ width: "100%", height: "100%" }} />
      {debug && (
        <DebugInfoComponent
          outlineEnabled={tileOutlineEnabled}
          onToggleOutline={handleOutlineToggle}
          ref={(e) => {
            if (e) {
              setDebugInfo.current = e.updateDebugInfo;
            }
          }}
        />
      )}
    </div>
  );
};

// 设置显示名称用于React DevTools
WebGLImageViewer.displayName = "WebGLImageViewer";

// 导出类型定义

export {
  type WebGLImageViewerProps,
  type WebGLImageViewerRef,
} from "./interface";
