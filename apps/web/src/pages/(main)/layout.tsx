import { ScrollArea, ScrollElementContext } from "@afilmory/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { siteConfig } from "~/config";
import { useMobile } from "~/hooks/useMobile";
import { useIsPhotoViewerOpen, usePhotos } from "~/hooks/usePhotoViewer";
import { getReadableTextColor } from "~/lib/color-contrast";
import { MasonryRoot } from "~/modules/gallery/MasonryRoot";
import { GalleryModalIsolation } from "~/providers/gallery-modal-isolation";
import { PhotoRouteAvailabilityProvider } from "~/providers/photo-route-availability";
import { PhotosProvider } from "~/providers/photos-provider";

export const Component = () => {
  const { t } = useTranslation();
  const isMobile = useMobile();
  // Subscribe only to visibility; replacing the photo URL does not rerender the gallery.
  const isPhotoViewerOpen = useIsPhotoViewerOpen();
  const [isPhotoRouteUnavailable, setPhotoRouteUnavailable] = useState(false);
  const galleryHiddenClassName = isPhotoRouteUnavailable
    ? "hidden"
    : isPhotoViewerOpen
      ? "pointer-events-none invisible"
      : undefined;

  const photos = usePhotos();
  // The app intentionally makes <body> the mobile scroll container while
  // <html> stays fixed/overflow-hidden (see styles/index.css).
  const mobileScrollElement =
    typeof document === "undefined" ? null : document.body;
  const accentContentColor = getReadableTextColor(siteConfig.accentColor);

  return (
    <>
      {!isPhotoRouteUnavailable && (
        <a
          href="#main-content"
          className="bg-material-opaque text-text fixed top-2 left-2 z-[100] -translate-y-20 rounded-lg px-4 py-2 shadow-lg transition-transform focus-visible:translate-y-0"
        >
          {t("common.skip-to-gallery")}
        </a>
      )}
      <GalleryModalIsolation />
      <PhotosProvider photos={photos}>
        {siteConfig.accentColor && (
          <style>{`
          :root:has(input.theme-controller[value=dark]:checked), [data-theme="dark"] {
            --color-primary: ${siteConfig.accentColor};
            --color-accent: ${siteConfig.accentColor};
            --color-secondary: ${siteConfig.accentColor};
            --color-accent-content: ${accentContentColor};
          }
          `}</style>
        )}

        <main
          id="main-content"
          tabIndex={-1}
          inert={isPhotoRouteUnavailable}
          aria-hidden={isPhotoRouteUnavailable || undefined}
          className={galleryHiddenClassName}
        >
          {isMobile ? (
            <ScrollElementContext value={mobileScrollElement}>
              <MasonryRoot />
            </ScrollElementContext>
          ) : (
            <ScrollArea
              rootClassName="h-svh w-full"
              viewportClassName="size-full"
            >
              <MasonryRoot />
            </ScrollArea>
          )}
        </main>

        <PhotoRouteAvailabilityProvider value={setPhotoRouteUnavailable}>
          <Outlet />
        </PhotoRouteAvailabilityProvider>
      </PhotosProvider>
    </>
  );
};
