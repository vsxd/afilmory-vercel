import { useReducedMotion } from "motion/react";
import type { RefObject } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { getGalleryVirtualPhotoTargetRect } from "~/lib/gallery-virtual-target";
import type { PhotoManifest } from "~/types/photo";

import type { DismissTransform } from "../useDismissGesture";
import type {
  PhotoViewerTransition,
  PhotoViewerTransitionState,
} from "./types";
import {
  computeViewerImageFrame,
  escapeAttributeValue,
  getBorderRadius,
} from "./utils";

interface UsePhotoViewerTransitionsParams {
  isOpen: boolean;
  triggerElement: HTMLElement | null;
  currentPhoto: PhotoManifest | undefined;
  currentBlobSrc: string | null;
  isMobile: boolean;
  /** The untransformed photo viewport, excluding toolbar, filmstrip and EXIF. */
  mediaRef?: RefObject<HTMLElement | null>;
  /**
   * 下滑关闭释放时的拖拽变换。存在时，退出 FLIP 的 `from` 用它做种子，
   * 让照片从被拖到的位置无缝飞回原格子（否则从居中帧起飞会跳变）。
   */
  dismissTransformRef?: RefObject<DismissTransform | null>;
  onExitComplete?: () => void;
}

interface UsePhotoViewerTransitionsResult {
  containerRef: RefObject<HTMLDivElement | null>;
  entryTransition: PhotoViewerTransition | null;
  exitTransition: PhotoViewerTransition | null;
  isViewerContentVisible: boolean;
  isEntryAnimating: boolean;
  shouldRenderBackdrop: boolean;
  thumbHash: string | null;
  shouldRenderThumbhash: boolean;
  handleEntryAnimationComplete: () => void;
  handleExitAnimationComplete: () => void;
}

export const usePhotoViewerTransitions = ({
  isOpen,
  triggerElement,
  currentPhoto,
  currentBlobSrc,
  isMobile,
  mediaRef,
  dismissTransformRef,
  onExitComplete,
}: UsePhotoViewerTransitionsParams): UsePhotoViewerTransitionsResult => {
  const exitCallbackRef = useRef(onExitComplete);
  useEffect(() => {
    exitCallbackRef.current = onExitComplete;
  }, [onExitComplete]);
  const shouldReduceMotion = useReducedMotion() === true;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cachedTriggerRef = useRef<HTMLElement | null>(triggerElement);
  const wasOpenRef = useRef(isOpen);
  const activeExitRef = useRef<PhotoViewerTransition | null>(null);
  const viewerBoundsRef = useRef<DOMRect | null>(null);
  const mediaBoundsRef = useRef<DOMRect | null>(null);
  const hiddenTriggerRef = useRef<HTMLElement | null>(null);
  const hiddenTriggerPrevVisibilityRef = useRef<string | null>(null);

  const [entryTransition, setEntryTransition] =
    useState<PhotoViewerTransition | null>(null);
  const [exitTransition, setExitTransition] =
    useState<PhotoViewerTransition | null>(null);
  const [isViewerContentVisible, setIsViewerContentVisible] = useState(false);

  const isElementForCurrentPhoto = useCallback(
    (element: HTMLElement | null) => {
      if (!currentPhoto || !element) return false;

      const photoElement = element.closest<HTMLElement>("[data-photo-id]");
      return photoElement?.dataset.photoId === currentPhoto.id;
    },
    [currentPhoto],
  );

  const restoreTriggerElementVisibility = useCallback(() => {
    const trigger = hiddenTriggerRef.current;
    if (trigger) {
      const prevVisibility = hiddenTriggerPrevVisibilityRef.current;
      if (prevVisibility != null) {
        trigger.style.visibility = prevVisibility;
      } else {
        trigger.style.removeProperty("visibility");
      }
    }
    hiddenTriggerRef.current = null;
    hiddenTriggerPrevVisibilityRef.current = null;
  }, []);

  const hideTriggerElement = useCallback((element: HTMLElement) => {
    hiddenTriggerRef.current = element;
    hiddenTriggerPrevVisibilityRef.current = element.style.visibility || null;
    element.style.visibility = "hidden";
  }, []);

  const resolveTriggerElement = useCallback((): HTMLElement | null => {
    if (!currentPhoto) return null;

    const selector = `[data-photo-id="${escapeAttributeValue(currentPhoto.id)}"]`;
    const liveTriggerEl =
      typeof document === "undefined"
        ? null
        : document.querySelector<HTMLElement>(selector);

    if (liveTriggerEl && liveTriggerEl.isConnected) {
      cachedTriggerRef.current = liveTriggerEl;
      return liveTriggerEl;
    }

    if (
      triggerElement &&
      triggerElement.isConnected &&
      isElementForCurrentPhoto(triggerElement)
    ) {
      cachedTriggerRef.current = triggerElement;
      return triggerElement;
    }

    if (
      cachedTriggerRef.current &&
      cachedTriggerRef.current.isConnected &&
      isElementForCurrentPhoto(cachedTriggerRef.current)
    ) {
      return cachedTriggerRef.current;
    }

    return null;
  }, [currentPhoto, isElementForCurrentPhoto, triggerElement]);

  useEffect(() => {
    if (triggerElement && isElementForCurrentPhoto(triggerElement)) {
      cachedTriggerRef.current = triggerElement;
    }
  }, [isElementForCurrentPhoto, triggerElement]);

  useEffect(() => {
    return () => {
      restoreTriggerElementVisibility();
    };
  }, [restoreTriggerElementVisibility]);

  useEffect(() => {
    if (!isOpen) {
      setEntryTransition(null);
      setIsViewerContentVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    resolveTriggerElement();
  }, [isOpen, resolveTriggerElement]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    // A new opening must never inherit a viewport from the previous session.
    viewerBoundsRef.current = null;
    mediaBoundsRef.current = null;
    const updateBounds = () => {
      viewerBoundsRef.current =
        getVisibleBounds(containerRef.current) ?? viewerBoundsRef.current;
      mediaBoundsRef.current =
        getVisibleBounds(mediaRef?.current) ?? mediaBoundsRef.current;
    };

    updateBounds();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateBounds);
    if (containerRef.current) observer?.observe(containerRef.current);
    if (mediaRef?.current) observer?.observe(mediaRef.current);
    window.addEventListener("resize", updateBounds);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [isOpen, mediaRef]);

  const resolveViewerImageFrame = useCallback(
    (photo: PhotoManifest) =>
      computeViewerImageFrame(
        photo,
        getVisibleBounds(containerRef.current) ?? viewerBoundsRef.current,
        isMobile,
        getVisibleBounds(mediaRef?.current) ?? mediaBoundsRef.current,
      ),
    [isMobile, mediaRef],
  );

  useLayoutEffect(() => {
    if (!isOpen || !currentPhoto) return;
    if (entryTransition || isViewerContentVisible) return;

    if (shouldReduceMotion) {
      restoreTriggerElementVisibility();
      setEntryTransition(null);
      setIsViewerContentVisible(true);
      return;
    }

    if (typeof window === "undefined") {
      setIsViewerContentVisible(true);
      return;
    }

    const triggerEl = resolveTriggerElement();

    if (!triggerEl) {
      setIsViewerContentVisible(true);
      return;
    }

    const fromRect = triggerEl.getBoundingClientRect();
    const targetFrame = resolveViewerImageFrame(currentPhoto);

    if (
      !fromRect.width ||
      !fromRect.height ||
      !targetFrame.width ||
      !targetFrame.height
    ) {
      setIsViewerContentVisible(true);
      return;
    }

    const imageSrc =
      currentBlobSrc ||
      currentPhoto.thumbnailUrl ||
      currentPhoto.originalUrl ||
      null;

    if (!imageSrc) {
      setIsViewerContentVisible(true);
      return;
    }

    hideTriggerElement(triggerEl);

    const triggerBorderRadius = getBorderRadius(
      triggerEl instanceof HTMLImageElement && triggerEl.parentElement
        ? triggerEl.parentElement
        : triggerEl,
    );

    setIsViewerContentVisible(true);
    const transitionState: PhotoViewerTransitionState = {
      photoId: currentPhoto.id,
      imageSrc,
      thumbHash: currentPhoto.thumbHash,
      from: {
        left: fromRect.left,
        top: fromRect.top,
        width: fromRect.width,
        height: fromRect.height,
        borderRadius: triggerBorderRadius,
      },
      to: {
        left: targetFrame.left,
        top: targetFrame.top,
        width: targetFrame.width,
        height: targetFrame.height,
        borderRadius: targetFrame.borderRadius,
      },
    };

    setEntryTransition({ ...transitionState, variant: "entry" });
  }, [
    isOpen,
    currentPhoto,
    entryTransition,
    isViewerContentVisible,
    currentBlobSrc,
    resolveViewerImageFrame,
    resolveTriggerElement,
    hideTriggerElement,
    restoreTriggerElementVisibility,
    shouldReduceMotion,
  ]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      activeExitRef.current = null;
      setExitTransition(null);
      return;
    }

    if (!wasOpenRef.current || !currentPhoto) {
      wasOpenRef.current = false;
      restoreTriggerElementVisibility();
      return;
    }

    if (shouldReduceMotion) {
      wasOpenRef.current = false;
      activeExitRef.current = null;
      setExitTransition(null);
      restoreTriggerElementVisibility();
      exitCallbackRef.current?.();
      return;
    }

    // 消费本次关闭的下滑拖拽变换（若有）：用于把退出 FLIP 的起点定在被拖到的位置
    const dismiss = dismissTransformRef?.current ?? null;
    if (dismissTransformRef?.current) {
      dismissTransformRef.current = null;
    }

    if (typeof window === "undefined") {
      wasOpenRef.current = false;
      restoreTriggerElementVisibility();
      exitCallbackRef.current?.();
      return;
    }

    const triggerEl = resolveTriggerElement();
    const virtualTargetRect = triggerEl
      ? null
      : getGalleryVirtualPhotoTargetRect(currentPhoto.id);
    const targetRect = triggerEl?.getBoundingClientRect() ?? virtualTargetRect;
    if (!targetRect || !targetRect.width || !targetRect.height) {
      wasOpenRef.current = false;
      restoreTriggerElementVisibility();
      activeExitRef.current = null;
      setExitTransition(null);
      exitCallbackRef.current?.();
      return;
    }

    // Refit the current photo against today's layout. Entry geometry can be
    // obsolete after a panel resize, orientation change or photo navigation.
    const computedFrame = resolveViewerImageFrame(currentPhoto);
    const viewerFrame = {
      left: computedFrame.left,
      top: computedFrame.top,
      width: computedFrame.width,
      height: computedFrame.height,
      borderRadius: computedFrame.borderRadius,
    };

    if (!viewerFrame.width || !viewerFrame.height) {
      wasOpenRef.current = false;
      restoreTriggerElementVisibility();
      activeExitRef.current = null;
      setExitTransition(null);
      exitCallbackRef.current?.();
      return;
    }

    const borderRadius = triggerEl
      ? getBorderRadius(
          triggerEl instanceof HTMLImageElement && triggerEl.parentElement
            ? triggerEl.parentElement
            : triggerEl,
        )
      : (virtualTargetRect?.borderRadius ?? 0);

    const imageSrc =
      currentPhoto.thumbnailUrl ||
      currentBlobSrc ||
      currentPhoto.originalUrl ||
      null;

    if (!imageSrc) {
      wasOpenRef.current = false;
      restoreTriggerElementVisibility();
      activeExitRef.current = null;
      setExitTransition(null);
      exitCallbackRef.current?.();
      return;
    }

    restoreTriggerElementVisibility();
    if (triggerEl) {
      hideTriggerElement(triggerEl);
    }

    // 若为下滑关闭，把居中帧按拖拽的 {scale, x, y} 变换成实际被拖到的矩形作为起点
    let fromRect = viewerFrame;
    if (dismiss) {
      const cx = viewerFrame.left + viewerFrame.width / 2;
      const cy = viewerFrame.top + viewerFrame.height / 2;
      const w = viewerFrame.width * dismiss.scale;
      const h = viewerFrame.height * dismiss.scale;
      fromRect = {
        left: cx - w / 2 + dismiss.x,
        top: cy - h / 2 + dismiss.y,
        width: w,
        height: h,
        borderRadius: viewerFrame.borderRadius,
      };
    }

    const transitionState: PhotoViewerTransitionState = {
      photoId: currentPhoto.id,
      imageSrc,
      thumbHash: currentPhoto.thumbHash,
      from: {
        left: fromRect.left,
        top: fromRect.top,
        width: fromRect.width,
        height: fromRect.height,
        borderRadius: fromRect.borderRadius,
      },
      to: {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        borderRadius,
      },
      // 下滑关闭：把释放速度（px/s）交给退出 FLIP 的 y 弹簧，实现速度连续
      velocityY: dismiss ? dismiss.velocity : undefined,
    };

    const exit: PhotoViewerTransition = { ...transitionState, variant: "exit" };
    activeExitRef.current = exit;
    setExitTransition(exit);

    wasOpenRef.current = false;
  }, [
    isOpen,
    currentPhoto,
    currentBlobSrc,
    resolveViewerImageFrame,
    dismissTransformRef,
    resolveTriggerElement,
    restoreTriggerElementVisibility,
    hideTriggerElement,
    shouldReduceMotion,
  ]);

  const handleEntryAnimationComplete = useCallback(() => {
    setIsViewerContentVisible(true);
    setEntryTransition(null);
  }, []);

  const handleExitAnimationComplete = useCallback(() => {
    if (!exitTransition || activeExitRef.current !== exitTransition) return;
    activeExitRef.current = null;
    restoreTriggerElementVisibility();
    setExitTransition(null);
    onExitComplete?.();
  }, [exitTransition, onExitComplete, restoreTriggerElementVisibility]);

  const isEntryAnimating = Boolean(entryTransition);
  const shouldRenderBackdrop =
    isOpen || Boolean(exitTransition) || Boolean(entryTransition);

  const thumbHash =
    typeof currentPhoto?.thumbHash === "string" ? currentPhoto.thumbHash : null;
  const shouldRenderThumbhash = shouldRenderBackdrop && Boolean(thumbHash);

  return {
    containerRef,
    entryTransition,
    exitTransition,
    isViewerContentVisible,
    isEntryAnimating,
    shouldRenderBackdrop,
    thumbHash,
    shouldRenderThumbhash,
    handleEntryAnimationComplete,
    handleExitAnimationComplete,
  };
};

const getVisibleBounds = (element: HTMLElement | null | undefined) => {
  const rect = element?.getBoundingClientRect();
  return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};
