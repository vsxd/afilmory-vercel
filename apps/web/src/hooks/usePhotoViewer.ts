import { photoMatchesGeoFilters } from "@afilmory/schema/geo";
import { use, useCallback, useMemo } from "react";

import type { GallerySetting } from "~/atoms/app";
import { useModalIsolation } from "~/hooks/useModalIsolation";
import { getPhotoSortTime } from "~/lib/photo-date";
import {
  useAppNavigation,
  useGallerySettings,
  useIsPhotoPresented,
  useNavigationLocation,
} from "~/navigation/hooks";
import { PhotosContext } from "~/providers/photos-provider";
import type { AppRuntime } from "~/runtime/app-runtime";
import { usePhotoRepositorySnapshot } from "~/runtime/app-runtime";
import type { PhotoManifest } from "~/types/photo";

const sortPhotos = (
  photos: readonly PhotoManifest[],
  sortOrder: "asc" | "desc",
) => {
  return photos.toSorted((a, b) => {
    const aTime = getPhotoSortTime(a);
    const bTime = getPhotoSortTime(b);

    return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
  });
};

const filterAndSortPhotosImpl = (
  photos: readonly PhotoManifest[],
  gallerySetting: GallerySetting,
) => {
  let filteredPhotos = photos;
  const {
    selectedTags,
    selectedCameras,
    selectedLenses,
    selectedGeoCountries,
    selectedGeoRegions,
    selectedGeoCities,
    selectedGeoDistricts,
    sortOrder,
  } = gallerySetting;

  // Same filter group uses OR semantics. Different groups are applied in
  // sequence, which gives cross-group AND semantics.
  if (selectedTags.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) =>
      selectedTags.some((tag) => photo.tags.includes(tag)),
    );
  }

  if (selectedCameras.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.Make || !photo.exif?.Model) return false;
      const cameraDisplayName = `${photo.exif.Make.trim()} ${photo.exif.Model.trim()}`;
      return selectedCameras.includes(cameraDisplayName);
    });
  }

  if (selectedLenses.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.LensModel) return false;
      const lensModel = photo.exif.LensModel.trim();
      const lensMake = photo.exif.LensMake?.trim();
      const lensDisplayName = lensMake ? `${lensMake} ${lensModel}` : lensModel;
      return selectedLenses.includes(lensDisplayName);
    });
  }

  if (
    selectedGeoCountries.length > 0 ||
    selectedGeoRegions.length > 0 ||
    selectedGeoCities.length > 0 ||
    selectedGeoDistricts.length > 0
  ) {
    filteredPhotos = filteredPhotos.filter((photo) =>
      photoMatchesGeoFilters(photo, {
        selectedGeoCountries,
        selectedGeoRegions,
        selectedGeoCities,
        selectedGeoDistricts,
      }),
    );
  }

  const sortedPhotos = sortPhotos(filteredPhotos, sortOrder);

  return sortedPhotos;
};

// Repository and URL filter snapshots have stable identities; reuse derived lists.
const filterResultCache = new WeakMap<
  readonly PhotoManifest[],
  WeakMap<GallerySetting, readonly PhotoManifest[]>
>();

export const filterAndSortPhotos = (
  photos: readonly PhotoManifest[],
  gallerySetting: GallerySetting,
) => {
  let settingCache = filterResultCache.get(photos);
  if (!settingCache) {
    settingCache = new WeakMap();
    filterResultCache.set(photos, settingCache);
  }

  const cached = settingCache.get(gallerySetting);
  if (cached) return cached;

  const result = filterAndSortPhotosImpl(photos, gallerySetting);
  settingCache.set(gallerySetting, result);
  return result;
};

const getAllPhotosForViewer = (
  photos: readonly PhotoManifest[],
  sortOrder: "asc" | "desc",
) => {
  return sortPhotos(photos, sortOrder);
};

const photoMapsByArray = new WeakMap<
  readonly PhotoManifest[],
  Map<string, PhotoManifest>
>();
const photosBySourceIds = new WeakMap<
  readonly PhotoManifest[],
  WeakMap<string[], readonly PhotoManifest[]>
>();

const getPhotosByIds = (
  photos: readonly PhotoManifest[],
  photoIds: string[],
) => {
  let byIds = photosBySourceIds.get(photos);
  if (!byIds) {
    byIds = new WeakMap();
    photosBySourceIds.set(photos, byIds);
  }
  const cached = byIds.get(photoIds);
  if (cached) return cached;

  let photoMap = photoMapsByArray.get(photos);
  if (!photoMap) {
    photoMap = new Map(photos.map((photo) => [photo.id, photo]));
    photoMapsByArray.set(photos, photoMap);
  }
  const resolved = photoIds.flatMap((photoId) => {
    const photo = photoMap.get(photoId);
    return photo ? [photo] : [];
  });
  byIds.set(photoIds, resolved);
  return resolved;
};

export type ViewerSequenceSource = "all" | "filtered" | "map" | "sequence";

export interface ViewerSequence {
  photos: readonly PhotoManifest[];
  source: ViewerSequenceSource;
}

const hasGalleryFilters = (settings: GallerySetting) =>
  settings.selectedTags.length > 0 ||
  settings.selectedCameras.length > 0 ||
  settings.selectedLenses.length > 0 ||
  settings.selectedGeoCountries.length > 0 ||
  settings.selectedGeoRegions.length > 0 ||
  settings.selectedGeoCities.length > 0 ||
  settings.selectedGeoDistricts.length > 0;

const hasSamePhotoIds = (
  photos: readonly PhotoManifest[],
  candidates: readonly PhotoManifest[],
) => {
  if (photos.length !== candidates.length) return false;
  const ids = new Set(photos.map((photo) => photo.id));
  return (
    ids.size === photos.length && candidates.every((photo) => ids.has(photo.id))
  );
};

// Resolve the list and its label together: an origin alone cannot tell us
// whether a stale source or an out-of-filter search fell back to all photos.
const resolveViewerSequence = (
  photoId: string | null | undefined,
  allPhotos: readonly PhotoManifest[],
  filteredPhotos: readonly PhotoManifest[],
  gallerySetting: GallerySetting,
  viewerSourcePhotoIds?: string[] | null,
  photoSequenceOrigin?: "map" | "gallery" | null,
): ViewerSequence => {
  const isFiltered = hasGalleryFilters(gallerySetting);
  if (viewerSourcePhotoIds?.length) {
    const sourcePhotos = getPhotosByIds(allPhotos, viewerSourcePhotoIds);
    if (!photoId || sourcePhotos.some((photo) => photo.id === photoId)) {
      const source =
        photoSequenceOrigin === "map"
          ? "map"
          : isFiltered && hasSamePhotoIds(sourcePhotos, filteredPhotos)
            ? "filtered"
            : hasSamePhotoIds(sourcePhotos, allPhotos)
              ? "all"
              : "sequence";
      return { photos: sourcePhotos, source };
    }
  }

  return photoId && !filteredPhotos.some((photo) => photo.id === photoId)
    ? {
        photos: getAllPhotosForViewer(allPhotos, gallerySetting.sortOrder),
        source: "all",
      }
    : { photos: filteredPhotos, source: isFiltered ? "filtered" : "all" };
};

export const getFilteredPhotos = (runtime: AppRuntime) => {
  const currentGallerySetting = runtime.navigation.getGallerySettings();
  return filterAndSortPhotos(
    runtime.photoRepository.getPhotos(),
    currentGallerySetting,
  );
};

export const getViewerSequence = (
  runtime: AppRuntime,
  photoId?: string | null,
) => {
  const gallerySetting = runtime.navigation.getGallerySettings();
  const allPhotos = runtime.photoRepository.getPhotos();
  const filteredPhotos = getFilteredPhotos(runtime);
  const viewerSourcePhotoIds = runtime.navigation.getPhotoIds();

  return resolveViewerSequence(
    photoId,
    allPhotos,
    filteredPhotos,
    gallerySetting,
    viewerSourcePhotoIds,
    runtime.navigation.getPhotoSequenceOrigin(),
  );
};

export const getViewerPhotos = (runtime: AppRuntime, photoId?: string | null) =>
  getViewerSequence(runtime, photoId).photos;

export const usePhotos = () => {
  const [gallerySetting] = useGallerySettings();
  const allPhotos = usePhotoRepositorySnapshot();

  const masonryItems = useMemo(() => {
    return filterAndSortPhotos(allPhotos, gallerySetting);
  }, [allPhotos, gallerySetting]);

  return masonryItems;
};

export const useViewerSequence = (photoId?: string | null) => {
  const [gallerySetting] = useGallerySettings();
  const navigation = useAppNavigation();
  useNavigationLocation();
  const isOpen = navigation.isPhotoOpen();
  const viewerSourcePhotoIds = navigation.getPhotoIds();
  const photoSequenceOrigin = navigation.getPhotoSequenceOrigin();
  const filteredPhotos = usePhotos();
  const allPhotos = usePhotoRepositorySnapshot();

  return useMemo(
    () =>
      resolveViewerSequence(
        photoId,
        allPhotos,
        filteredPhotos,
        gallerySetting,
        isOpen ? viewerSourcePhotoIds : null,
        photoSequenceOrigin,
      ),
    [
      allPhotos,
      filteredPhotos,
      gallerySetting,
      isOpen,
      photoId,
      photoSequenceOrigin,
      viewerSourcePhotoIds,
    ],
  );
};

export const useViewerPhotos = (photoId?: string | null) =>
  useViewerSequence(photoId).photos;

export const useContextPhotos = () => {
  const photos = use(PhotosContext);
  if (!photos) {
    throw new Error("PhotosContext is not initialized");
  }
  return photos;
};

// Presentation visibility is a narrow snapshot; changing the photo does not notify the gallery.

export const usePhotoViewerBodyScrollLock = () => {
  useModalIsolation(useIsPhotoPresented());
};

export const usePhotoViewer = () => {
  const navigation = useAppNavigation();
  const location = useNavigationLocation();
  const photos = useViewerPhotos(navigation.getPhotoId());
  const isOpen = useIsPhotoPresented();
  const currentIndex = photos.findIndex(
    (photo) => photo.id === navigation.getPhotoId(),
  );
  const triggerElement =
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(
          `[data-gallery-photo-link][data-photo-id="${CSS.escape(navigation.getPhotoId() ?? "")}"]`,
        );
  const closeViewer = useCallback(
    () => navigation.requestPhotoClose(),
    [navigation],
  );
  const completeClose = useCallback(
    () => navigation.completePhotoClose(location.key),
    [navigation, location.key],
  );
  const goToIndex = useCallback(
    (index: number) => {
      const photo = photos[index];
      if (photo)
        navigation.stepPhoto(
          photo.id,
          navigation.getPhotoIds() ?? photos.map((item) => item.id),
        );
    },
    [navigation, photos],
  );
  return {
    isOpen,
    currentIndex,
    triggerElement,
    closeViewer,
    completeClose,
    goToIndex,
  };
};

export { useIsPhotoPresented as useIsPhotoViewerOpen } from "~/navigation/hooks";
