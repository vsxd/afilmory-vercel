import { RootPortal, RootPortalProvider } from "@afilmory/ui";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RemoveScroll } from "react-remove-scroll";
import { useParams } from "react-router";

import { NotFound } from "~/components/common/NotFound";
import { PhotoViewer } from "~/components/ui/photo-viewer";
import { usePhotoViewer, useViewerPhotos } from "~/hooks/usePhotoViewer";
import { useTitle } from "~/hooks/useTitle";
import { applyAccentTransitionStyle } from "~/lib/accent-transition-style";
import { deriveAccentFromSources } from "~/lib/color";
import { getReadableTextColor } from "~/lib/color-contrast";
import { usePhotoRouteUnavailable } from "~/providers/photo-route-availability";
import { usePhotoRepository } from "~/runtime/app-runtime";

export const Component = () => {
  const { t } = useTranslation();
  const { photoId } = useParams();
  const photoRepository = usePhotoRepository();
  const photos = useViewerPhotos(photoId);
  const photoViewer = usePhotoViewer();

  // 直接根据 photoId 从 Context 的照片列表中查找照片和索引
  const photoIndex = useMemo(() => {
    if (!photoId) {
      return -1;
    }
    if (!photos || photos.length === 0) {
      return -1;
    }
    const index = photos.findIndex((photo) => photo?.id === photoId);
    return index;
  }, [photos, photoId]);

  const currentPhoto = useMemo(() => {
    const photo =
      photoIndex !== -1 && photos[photoIndex] ? photos[photoIndex] : null;
    return photo;
  }, [photos, photoIndex]);

  useEffect(() => {
    if (!photoId || photoIndex < 0) return;
    let cancelled = false;
    let idleCallbackId: number | undefined;
    let prefetchTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const neighborIds = [
      photos[photoIndex - 1]?.id,
      photos[photoIndex + 1]?.id,
    ].flatMap((id) => (id ? [id] : []));

    void photoRepository
      .ensurePhotoDetails(photoId)
      .then(() => {
        if (cancelled || neighborIds.length === 0) return;
        const prefetch = () => {
          void photoRepository.prefetchPhotoDetails(neighborIds).catch(() => {
            // Adjacent-photo prefetch is opportunistic; navigation still has
            // its own foreground hydration path.
          });
        };
        if (typeof requestIdleCallback === "function") {
          idleCallbackId = requestIdleCallback(prefetch, { timeout: 1_500 });
        } else {
          prefetchTimeoutId = setTimeout(prefetch, 200);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn(
            `Failed to hydrate photo details for ${photoId}:`,
            error,
          );
        }
      });

    return () => {
      cancelled = true;
      if (idleCallbackId !== undefined) {
        cancelIdleCallback(idleCallbackId);
      }
      if (prefetchTimeoutId !== undefined) {
        clearTimeout(prefetchTimeoutId);
      }
    };
  }, [photoId, photoIndex, photoRepository, photos]);
  const isPhotoRouteUnavailable = !currentPhoto || photoIndex === -1;
  usePhotoRouteUnavailable(isPhotoRouteUnavailable);

  // Photo stepping replaces the current URL while retaining its origin.
  const handleIndexChange = useCallback(
    (newIndex: number) => {
      if (newIndex >= 0 && newIndex < photos.length) {
        photoViewer.goToIndex(newIndex);
      }
    },
    [photos, photoViewer],
  );

  const [ref, setRef] = useState<HTMLElement | null>(null);
  const rootPortalValue = useMemo(
    () => ({
      to: ref as HTMLElement,
    }),
    [ref],
  );
  useTitle(currentPhoto?.title || t("error.not-found.title"));

  const [accentColor, setAccentColor] = useState<string | null>(null);

  useEffect(() => {
    if (!currentPhoto) return;

    let isCancelled = false;
    let cleanupAccentTransitionStyle: (() => void) | null = null;

    (async () => {
      try {
        const color = await deriveAccentFromSources({
          thumbHash: currentPhoto.thumbHash,
          thumbnailUrl: currentPhoto.thumbnailUrl,
        });
        if (!isCancelled) {
          cleanupAccentTransitionStyle = applyAccentTransitionStyle(100);
          setAccentColor(color ?? null);
        }
      } catch {
        if (!isCancelled) setAccentColor(null);
      }
    })();

    return () => {
      isCancelled = true;
      cleanupAccentTransitionStyle?.();
    };
  }, [currentPhoto]);

  // 如果照片不存在，显示 NotFound
  if (isPhotoRouteUnavailable) {
    return <NotFound />;
  }

  return (
    <RootPortal>
      <RootPortalProvider value={rootPortalValue}>
        <RemoveScroll
          style={
            {
              ...(accentColor
                ? {
                    "--color-accent": accentColor,
                    "--color-accent-content": getReadableTextColor(accentColor),
                  }
                : {}),
            } as React.CSSProperties
          }
          ref={setRef}
          className={clsx(
            photoViewer.isOpen
              ? "fixed inset-0 z-9999"
              : "pointer-events-none fixed inset-0 z-40",
          )}
        >
          <PhotoViewer
            photos={photos}
            currentIndex={photoIndex}
            isOpen={photoViewer.isOpen}
            triggerElement={photoViewer.triggerElement}
            onClose={photoViewer.closeViewer}
            onExitComplete={photoViewer.completeClose}
            onIndexChange={handleIndexChange}
          />
        </RemoveScroll>
      </RootPortalProvider>
    </RootPortal>
  );
};
