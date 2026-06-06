import type { PhotoManifestItem } from "@afilmory/schema";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { use, useCallback, useEffect, useMemo } from "react";

import type { GallerySetting } from "~/atoms/app";
import { gallerySettingAtom } from "~/atoms/app";
import { photoMatchesGeoFilters } from "~/lib/geo-regions";
import { getPhotoDateString } from "~/lib/photo-date";
import { PhotosContext } from "~/providers/photos-provider";
import type { AppRuntime } from "~/runtime/app-runtime";
import { useAfilmoryRuntime, usePhotoRepository } from "~/runtime/app-runtime";

const openAtom = atom(false);
const currentIndexAtom = atom(0);
const triggerElementAtom = atom<HTMLElement | null>(null);
const viewerSourceModeAtom = atom<ViewerSourceMode | null>(null);
const viewerSourcePhotoIdsAtom = atom<string[] | null>(null);

type ViewerSourceMode = "filtered" | "all";

const sortPhotos = (photos: PhotoManifestItem[], sortOrder: "asc" | "desc") => {
  return photos.toSorted((a, b) => {
    const aDateStr = getPhotoDateString(a);
    const bDateStr = getPhotoDateString(b);

    return sortOrder === "asc"
      ? aDateStr.localeCompare(bDateStr)
      : bDateStr.localeCompare(aDateStr);
  });
};

export const filterAndSortPhotos = (
  photos: PhotoManifestItem[],
  gallerySetting: Pick<
    GallerySetting,
    | "selectedTags"
    | "selectedCameras"
    | "selectedLenses"
    | "selectedGeoCountries"
    | "selectedGeoRegions"
    | "selectedGeoCities"
    | "selectedGeoDistricts"
    | "sortOrder"
    | "tagFilterMode"
  >,
) => {
  // 根据 tags、cameras 和 lenses 筛选
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
    tagFilterMode = "union",
  } = gallerySetting;

  // Tags 筛选：根据模式进行并集或交集筛选
  if (selectedTags.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (tagFilterMode === "intersection") {
        // 交集模式：照片必须包含所有选中的标签
        return selectedTags.every((tag) => photo.tags.includes(tag));
      } else {
        // 并集模式：照片必须包含至少一个选中的标签
        return selectedTags.some((tag) => photo.tags.includes(tag));
      }
    });
  }

  // Cameras 筛选：照片的相机必须匹配选中的相机之一
  if (selectedCameras.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.Make || !photo.exif?.Model) return false;
      const cameraDisplayName = `${photo.exif.Make.trim()} ${photo.exif.Model.trim()}`;
      return selectedCameras.includes(cameraDisplayName);
    });
  }

  // Lenses 筛选：照片的镜头必须匹配选中的镜头之一
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

  // 然后排序
  const sortedPhotos = sortPhotos(filteredPhotos, sortOrder);

  return sortedPhotos;
};

const getAllPhotosForViewer = (
  photos: PhotoManifestItem[],
  sortOrder: "asc" | "desc",
) => {
  return sortPhotos(photos, sortOrder);
};

const getPhotosByIds = (photos: PhotoManifestItem[], photoIds: string[]) => {
  const photoMap = new Map(photos.map((photo) => [photo.id, photo]));
  return photoIds.flatMap((photoId) => {
    const photo = photoMap.get(photoId);
    return photo ? [photo] : [];
  });
};

const resolveViewerSourceMode = (
  photoId: string | null | undefined,
  filteredPhotos: ReturnType<typeof getFilteredPhotos>,
): ViewerSourceMode => {
  if (!photoId) {
    return "filtered";
  }

  return filteredPhotos.some((photo) => photo.id === photoId)
    ? "filtered"
    : "all";
};

const resolveViewerPhotos = (
  photoId: string | null | undefined,
  allPhotos: PhotoManifestItem[],
  filteredPhotos: PhotoManifestItem[],
  sortOrder: "asc" | "desc",
  viewerSourceMode?: ViewerSourceMode | null,
  viewerSourcePhotoIds?: string[] | null,
) => {
  if (viewerSourcePhotoIds?.length) {
    const sourcePhotos = getPhotosByIds(allPhotos, viewerSourcePhotoIds);
    if (!photoId || sourcePhotos.some((photo) => photo.id === photoId)) {
      return sourcePhotos;
    }
  }

  const sourceMode =
    viewerSourceMode === "filtered" &&
    photoId &&
    !filteredPhotos.some((photo) => photo.id === photoId)
      ? "all"
      : (viewerSourceMode ?? resolveViewerSourceMode(photoId, filteredPhotos));

  return sourceMode === "all"
    ? getAllPhotosForViewer(allPhotos, sortOrder)
    : filteredPhotos;
};

export const getFilteredPhotos = (runtime: AppRuntime) => {
  const currentGallerySetting = runtime.store.get(gallerySettingAtom);
  return filterAndSortPhotos(
    runtime.photoRepository.getPhotos(),
    currentGallerySetting,
  );
};

export const getViewerPhotos = (
  runtime: AppRuntime,
  photoId?: string | null,
) => {
  const { sortOrder } = runtime.store.get(gallerySettingAtom);
  const allPhotos = runtime.photoRepository.getPhotos();
  const filteredPhotos = getFilteredPhotos(runtime);
  const viewerSourceMode = runtime.store.get(openAtom)
    ? runtime.store.get(viewerSourceModeAtom)
    : null;
  const viewerSourcePhotoIds = runtime.store.get(openAtom)
    ? runtime.store.get(viewerSourcePhotoIdsAtom)
    : null;

  return resolveViewerPhotos(
    photoId,
    allPhotos,
    filteredPhotos,
    sortOrder,
    viewerSourceMode,
    viewerSourcePhotoIds,
  );
};

export const getViewerSourceMode = (
  runtime: AppRuntime,
  photoId?: string | null,
) => {
  return resolveViewerSourceMode(photoId, getFilteredPhotos(runtime));
};

export const usePhotos = () => {
  const gallerySetting = useAtomValue(gallerySettingAtom);
  const photoRepository = usePhotoRepository();
  const allPhotos = photoRepository.getPhotos();

  const masonryItems = useMemo(() => {
    return filterAndSortPhotos(allPhotos, gallerySetting);
  }, [allPhotos, gallerySetting]);

  return masonryItems;
};

export const useViewerPhotos = (photoId?: string | null) => {
  const { sortOrder } = useAtomValue(gallerySettingAtom);
  const isOpen = useAtomValue(openAtom);
  const viewerSourceMode = useAtomValue(viewerSourceModeAtom);
  const viewerSourcePhotoIds = useAtomValue(viewerSourcePhotoIdsAtom);
  const filteredPhotos = usePhotos();
  const photoRepository = usePhotoRepository();
  const allPhotos = photoRepository.getPhotos();

  return useMemo(
    () =>
      resolveViewerPhotos(
        photoId,
        allPhotos,
        filteredPhotos,
        sortOrder,
        isOpen ? viewerSourceMode : null,
        isOpen ? viewerSourcePhotoIds : null,
      ),
    [
      allPhotos,
      filteredPhotos,
      isOpen,
      photoId,
      sortOrder,
      viewerSourceMode,
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

export const usePhotoViewerBodyScrollLock = () => {
  const isOpen = useAtomValue(openAtom);
  const runtime = useAfilmoryRuntime();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    return runtime.bodyScrollLock.lock();
  }, [isOpen, runtime]);
};

export const useOpenPhotoViewer = () => {
  const setIsOpen = useSetAtom(openAtom);
  const setCurrentIndex = useSetAtom(currentIndexAtom);
  const setTriggerElement = useSetAtom(triggerElementAtom);
  const setViewerSourceMode = useSetAtom(viewerSourceModeAtom);
  const setViewerSourcePhotoIds = useSetAtom(viewerSourcePhotoIdsAtom);

  return useCallback(
    (
      index: number,
      options?: {
        element?: HTMLElement | null;
        sourceMode?: ViewerSourceMode;
        sourcePhotoIds?: string[] | null;
      },
    ) => {
      setCurrentIndex(index);
      setTriggerElement(options?.element || null);
      setViewerSourceMode(options?.sourceMode ?? null);
      setViewerSourcePhotoIds(options?.sourcePhotoIds ?? null);
      setIsOpen(true);
    },
    [
      setCurrentIndex,
      setIsOpen,
      setTriggerElement,
      setViewerSourceMode,
      setViewerSourcePhotoIds,
    ],
  );
};

export const usePhotoViewer = (photoCount?: number) => {
  const [isOpen, setIsOpen] = useAtom(openAtom);
  const [currentIndex, setCurrentIndex] = useAtom(currentIndexAtom);
  const [triggerElement, setTriggerElement] = useAtom(triggerElementAtom);
  const [viewerSourceMode, setViewerSourceMode] = useAtom(viewerSourceModeAtom);
  const [viewerSourcePhotoIds, setViewerSourcePhotoIds] = useAtom(
    viewerSourcePhotoIdsAtom,
  );
  const openViewer = useOpenPhotoViewer();
  const runtime = useAfilmoryRuntime();

  const closeViewer = useCallback(() => {
    setIsOpen(false);
    setTriggerElement(null);
    setViewerSourceMode(null);
    setViewerSourcePhotoIds(null);
  }, [
    setIsOpen,
    setTriggerElement,
    setViewerSourceMode,
    setViewerSourcePhotoIds,
  ]);

  const goToIndex = useCallback(
    (index: number) => {
      const maxPhotoCount =
        (photoCount ?? viewerSourcePhotoIds?.length) ||
        (viewerSourceMode === "all"
          ? runtime.photoRepository.getPhotos().length
          : getFilteredPhotos(runtime).length);
      if (index >= 0 && index < maxPhotoCount) {
        setCurrentIndex(index);
      }
    },
    [
      photoCount,
      runtime,
      setCurrentIndex,
      viewerSourceMode,
      viewerSourcePhotoIds,
    ],
  );

  return {
    isOpen,
    currentIndex,
    triggerElement,
    viewerSourceMode,
    viewerSourcePhotoIds,
    openViewer,
    closeViewer,

    goToIndex,
  };
};
