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

const resolveViewerPhotos = (
  photoId: string | null | undefined,
  allPhotos: readonly PhotoManifest[],
  filteredPhotos: readonly PhotoManifest[],
  sortOrder: "asc" | "desc",
  viewerSourcePhotoIds?: string[] | null,
) => {
  if (viewerSourcePhotoIds?.length) {
    const sourcePhotos = getPhotosByIds(allPhotos, viewerSourcePhotoIds);
    if (!photoId || sourcePhotos.some((photo) => photo.id === photoId)) {
      return sourcePhotos;
    }
  }

  return photoId && !filteredPhotos.some((photo) => photo.id === photoId)
    ? getAllPhotosForViewer(allPhotos, sortOrder)
    : filteredPhotos;
};

export const getFilteredPhotos = (runtime: AppRuntime) => {
  const currentGallerySetting = runtime.navigation.getGallerySettings();
  return filterAndSortPhotos(
    runtime.photoRepository.getPhotos(),
    currentGallerySetting,
  );
};

export const getViewerPhotos = (
  runtime: AppRuntime,
  photoId?: string | null,
) => {
  const { sortOrder } = runtime.navigation.getGallerySettings();
  const allPhotos = runtime.photoRepository.getPhotos();
  const filteredPhotos = getFilteredPhotos(runtime);
  const viewerSourcePhotoIds = runtime.navigation.getPhotoIds();

  return resolveViewerPhotos(
    photoId,
    allPhotos,
    filteredPhotos,
    sortOrder,
    viewerSourcePhotoIds,
  );
};

export const usePhotos = () => {
  const [gallerySetting] = useGallerySettings();
  const allPhotos = usePhotoRepositorySnapshot();

  const masonryItems = useMemo(() => {
    return filterAndSortPhotos(allPhotos, gallerySetting);
  }, [allPhotos, gallerySetting]);

  return masonryItems;
};

export const useViewerPhotos = (photoId?: string | null) => {
  const [{ sortOrder }] = useGallerySettings();
  const navigation = useAppNavigation();
  useNavigationLocation();
  const isOpen = navigation.isPhotoOpen();
  const viewerSourcePhotoIds = navigation.getPhotoIds();
  const filteredPhotos = usePhotos();
  const allPhotos = usePhotoRepositorySnapshot();

  return useMemo(
    () =>
      resolveViewerPhotos(
        photoId,
        allPhotos,
        filteredPhotos,
        sortOrder,
        isOpen ? viewerSourcePhotoIds : null,
      ),
    [
      allPhotos,
      filteredPhotos,
      isOpen,
      photoId,
      sortOrder,
      viewerSourcePhotoIds,
    ],
  );
};

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
