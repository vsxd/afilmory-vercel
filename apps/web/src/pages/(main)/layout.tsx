import { ScrollArea, ScrollElementContext } from "@afilmory/ui";
import { useAtomValue, useSetAtom } from "jotai";
import type { RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
  useSearchParams,
} from "react-router";

import type { GallerySetting } from "~/atoms/app";
import { gallerySettingAtom } from "~/atoms/app";
import { siteConfig } from "~/config";
import { useMobile } from "~/hooks/useMobile";
import {
  getViewerPhotos,
  getViewerSourceMode,
  usePhotos,
  usePhotoViewer,
  usePhotoViewerBodyScrollLock,
} from "~/hooks/usePhotoViewer";
import {
  applyGalleryFiltersToSearch,
  getGalleryFiltersFromSearch,
} from "~/lib/gallery-filter-url";
import { buildPhotoDetailPathname } from "~/lib/photo-detail-route";
import { getSafeReturnTo, syncPhotoDetailSearch } from "~/lib/return-to";
import { MasonryRoot } from "~/modules/gallery/MasonryRoot";
import { PhotosProvider } from "~/providers/photos-provider";
import { useAfilmoryRuntime } from "~/runtime/app-runtime";

type UrlRestoreState = {
  isRestored: boolean;
  pendingUrlRestoreSearch: string | null;
};

export const Component = () => {
  usePhotoViewerBodyScrollLock();
  const urlRestoreStateRef = useRef<UrlRestoreState>({
    isRestored: false,
    pendingUrlRestoreSearch: null,
  });
  useStateRestoreFromUrl(urlRestoreStateRef);
  useSyncStateToUrl(urlRestoreStateRef);

  // const location = useLocation()
  const isMobile = useMobile();
  const { isOpen: isPhotoViewerOpen } = usePhotoViewer();
  const galleryHiddenClassName = isPhotoViewerOpen
    ? "pointer-events-none invisible"
    : undefined;

  const photos = usePhotos();
  const mobileScrollElement =
    typeof document === "undefined" ? null : document.body;

  return (
    <>
      <PhotosProvider photos={photos}>
        {siteConfig.accentColor && (
          <style>{`
          :root:has(input.theme-controller[value=dark]:checked), [data-theme="dark"] {
            --color-primary: ${siteConfig.accentColor};
            --color-accent: ${siteConfig.accentColor};
            --color-secondary: ${siteConfig.accentColor};
          }
          `}</style>
        )}

        {isMobile ? (
          <ScrollElementContext value={mobileScrollElement}>
            <div className={galleryHiddenClassName}>
              <MasonryRoot />
            </div>
          </ScrollElementContext>
        ) : (
          <ScrollArea
            rootClassName={
              galleryHiddenClassName
                ? `h-svh w-full ${galleryHiddenClassName}`
                : "h-svh w-full"
            }
            viewportClassName="size-full"
          >
            <MasonryRoot />
          </ScrollArea>
        )}

        <Outlet />
      </PhotosProvider>
    </>
  );
};

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const useRestoreGalleryFilters = () => {
  const setGallerySetting = useSetAtom(gallerySettingAtom);
  return useCallback(
    (
      filters: Pick<
        GallerySetting,
        | "selectedTags"
        | "selectedCameras"
        | "selectedLenses"
        | "selectedGeoCountries"
        | "selectedGeoRegions"
        | "selectedGeoCities"
        | "selectedGeoDistricts"
      >,
    ) => {
      setGallerySetting((prev) => ({
        ...prev,
        ...filters,
      }));
    },
    [setGallerySetting],
  );
};

const useStateRestoreFromUrl = (
  urlRestoreStateRef: RefObject<UrlRestoreState>,
) => {
  const { currentIndex, goToIndex, isOpen, openViewer } = usePhotoViewer();
  const { photoId } = useParams();
  const runtime = useAfilmoryRuntime();
  const restoreGalleryFilters = useRestoreGalleryFilters();
  const viewerStateRef = useRef({
    currentIndex,
    goToIndex,
    isOpen,
    openViewer,
  });

  const location = useLocation();

  useEffect(() => {
    viewerStateRef.current = { currentIndex, goToIndex, isOpen, openViewer };
  }, [currentIndex, goToIndex, isOpen, openViewer]);

  useBrowserLayoutEffect(() => {
    urlRestoreStateRef.current.isRestored = true;
    urlRestoreStateRef.current.pendingUrlRestoreSearch = location.search;

    // 恢复筛选设置
    const galleryFilters = getGalleryFiltersFromSearch(location.search);

    restoreGalleryFilters(galleryFilters);

    // 如果 URL 中有 photoId，打开查看器
    // 找到对应的照片索引，确保 currentIndex 和 URL 保持一致
    if (photoId) {
      const photos = getViewerPhotos(runtime, photoId);
      const index = photos.findIndex((photo) => photo.id === photoId);
      if (index !== -1) {
        const viewerState = viewerStateRef.current;
        if (viewerState.isOpen) {
          if (viewerState.currentIndex !== index) {
            viewerState.goToIndex(index);
          }
        } else {
          viewerState.openViewer(index, {
            sourceMode: getViewerSourceMode(runtime, photoId),
            sourcePhotoIds: photos.map((photo) => photo.id),
          });
        }
      }
    }
  }, [
    location.search,
    photoId,
    restoreGalleryFilters,
    runtime,
    urlRestoreStateRef,
  ]);
};

const useSyncStateToUrl = (urlRestoreStateRef: RefObject<UrlRestoreState>) => {
  const runtime = useAfilmoryRuntime();
  const restoreGalleryFilters = useRestoreGalleryFilters();
  const wasOpenRef = useRef(false);
  const closeReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const {
    selectedTags,
    selectedCameras,
    selectedLenses,
    selectedGeoCountries,
    selectedGeoRegions,
    selectedGeoCities,
    selectedGeoDistricts,
    sortOrder,
  } = useAtomValue(gallerySettingAtom);
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const navigationType = useNavigationType();

  const location = useLocation();
  const { photoId } = useParams();
  const { closeViewer, isOpen, currentIndex } = usePhotoViewer();

  useEffect(
    () => () => {
      if (closeReturnTimerRef.current) {
        clearTimeout(closeReturnTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!urlRestoreStateRef.current.isRestored) return;

    const isPhotoDetailPath = /^\/photos\/[^/]+$/.test(location.pathname);

    if (isOpen) {
      if (
        !isPhotoDetailPath &&
        navigationType === "POP" &&
        wasOpenRef.current
      ) {
        closeViewer();
        return;
      }

      if (closeReturnTimerRef.current) {
        clearTimeout(closeReturnTimerRef.current);
        closeReturnTimerRef.current = null;
      }
      wasOpenRef.current = true;
      const photos = getViewerPhotos(runtime, photoId);
      // 确保 currentIndex 在有效范围内，避免筛选条件变化时数组越界
      if (currentIndex >= 0 && currentIndex < photos.length) {
        const targetPhotoId = photos[currentIndex].id;
        const targetPathname = buildPhotoDetailPathname(targetPhotoId);
        const targetSearch = syncPhotoDetailSearch(
          location.search,
          targetPhotoId,
        );
        if (
          location.pathname !== targetPathname ||
          location.search !== targetSearch
        ) {
          // 使用 replace 避免在浏览器历史中堆积过多记录
          navigate(
            { pathname: targetPathname, search: targetSearch },
            { replace: true },
          );
        }
      }
      return;
    }

    const justClosedViewer = wasOpenRef.current;
    wasOpenRef.current = false;

    if (justClosedViewer && isPhotoDetailPath) {
      const returnTo = getSafeReturnTo(location.search);
      const gallerySearchParams = new URLSearchParams(location.search);
      gallerySearchParams.delete("returnTo");
      const gallerySearch = gallerySearchParams.toString();
      const returnTarget = returnTo || {
        pathname: "/",
        search: gallerySearch ? `?${gallerySearch}` : "",
      };
      const returnGalleryFilters =
        getGalleryFiltersFromSearch(gallerySearchParams);

      closeReturnTimerRef.current = setTimeout(() => {
        closeReturnTimerRef.current = null;
        if (!returnTo) {
          restoreGalleryFilters(returnGalleryFilters);
        }
        navigate(returnTarget, { replace: true });
      }, 500);
    }
  }, [
    closeViewer,
    currentIndex,
    isOpen,
    location.pathname,
    location.search,
    navigate,
    navigationType,
    photoId,
    restoreGalleryFilters,
    runtime,
    selectedTags,
    selectedCameras,
    selectedLenses,
    selectedGeoCountries,
    selectedGeoRegions,
    selectedGeoCities,
    selectedGeoDistricts,
    sortOrder,
    urlRestoreStateRef,
  ]);

  useEffect(() => {
    if (!urlRestoreStateRef.current.isRestored) return;
    if (!isOpen && /^\/photos\/[^/]+$/.test(location.pathname)) return;

    const searchParams = new URLSearchParams(location.search);
    const hasLegacyRating = searchParams.has("rating");
    const hasLegacyRegionId = searchParams.has("regionId");
    const newer = applyGalleryFiltersToSearch(searchParams, {
      selectedTags,
      selectedCameras,
      selectedLenses,
      selectedGeoCountries,
      selectedGeoRegions,
      selectedGeoCities,
      selectedGeoDistricts,
    });

    // Remove legacy rating filters; the static gallery does not support starring.
    newer.delete("rating");

    if (
      newer.toString() === searchParams.toString() &&
      !hasLegacyRating &&
      !hasLegacyRegionId
    ) {
      if (
        urlRestoreStateRef.current.pendingUrlRestoreSearch === location.search
      ) {
        urlRestoreStateRef.current.pendingUrlRestoreSearch = null;
      }
      return;
    }

    if (
      urlRestoreStateRef.current.pendingUrlRestoreSearch === location.search &&
      !hasLegacyRating &&
      !hasLegacyRegionId
    ) {
      return;
    }

    setSearchParams(newer);
  }, [
    isOpen,
    location.pathname,
    location.search,
    selectedTags,
    selectedCameras,
    selectedLenses,
    selectedGeoCountries,
    selectedGeoRegions,
    selectedGeoCities,
    selectedGeoDistricts,
    setSearchParams,
    urlRestoreStateRef,
  ]);
};
