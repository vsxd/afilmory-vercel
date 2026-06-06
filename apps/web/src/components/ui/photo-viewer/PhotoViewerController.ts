import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import type { Swiper as SwiperType } from "swiper";

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function hasNestedKeyboardOverlay(): boolean {
  return document.querySelector("[data-photo-viewer-nested-overlay]") !== null;
}

export function usePhotoViewerBlobSource(): {
  currentBlobSrc: string | null;
  resetBlobSource: () => void;
  handleBlobSrcChange: (blobSrc: string | null) => void;
} {
  const [currentBlobSrc, setCurrentBlobSrc] = useState<string | null>(null);

  return {
    currentBlobSrc,
    resetBlobSource: useCallback(() => setCurrentBlobSrc(null), []),
    handleBlobSrcChange: useCallback((blobSrc: string | null) => {
      setCurrentBlobSrc(blobSrc);
    }, []),
  };
}

export function useSwiperIndexSync({
  currentIndex,
  onIndexSynced,
  swiper,
}: {
  currentIndex: number;
  onIndexSynced: () => void;
  swiper: RefObject<SwiperType | null>;
}): void {
  useEffect(() => {
    if (swiper.current && swiper.current.activeIndex !== currentIndex) {
      swiper.current.slideTo(currentIndex, 300);
    }
    onIndexSynced();
  }, [currentIndex, onIndexSynced, swiper]);
}

export function useSwiperZoomLock({
  isImageZoomed,
  swiper,
}: {
  isImageZoomed: boolean;
  swiper: RefObject<SwiperType | null>;
}): void {
  useEffect(() => {
    if (swiper.current) {
      swiper.current.allowTouchMove = !isImageZoomed;
    }
  }, [isImageZoomed, swiper]);
}

export function usePhotoViewerKeyboard({
  isOpen,
  onClose,
  onNext,
  onPrevious,
}: {
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}): void {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      if (hasNestedKeyboardOverlay()) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft": {
          event.preventDefault();
          onPrevious();
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          onNext();
          break;
        }
        case "Escape": {
          event.preventDefault();
          onClose();
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onPrevious, onNext, onClose]);
}
