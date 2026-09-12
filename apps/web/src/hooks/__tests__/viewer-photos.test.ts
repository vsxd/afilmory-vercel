import type { PhotoManifestItem } from "@afilmory/schema";
import { createManifest } from "@afilmory/schema";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "jotai";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GallerySetting } from "~/atoms/app";
import {
  filterAndSortPhotos,
  getFilteredPhotos,
  getViewerPhotos,
  getViewerSequence,
  usePhotoViewer,
  usePhotoViewerBodyScrollLock,
  useViewerSequence,
} from "~/hooks/usePhotoViewer";
import { createTestNavigation } from "~/navigation/__tests__/test-router";
import { useAppNavigation } from "~/navigation/hooks";
import type { AppRuntime } from "~/runtime/app-runtime";
import { createAppRuntime } from "~/runtime/app-runtime";
import { AfilmoryRuntimeProvider } from "~/runtime/app-runtime-provider";

const defaultGallerySetting: GallerySetting = {
  sortOrder: "desc",
  selectedTags: [],
  selectedCameras: [],
  selectedLenses: [],
  selectedGeoCountries: [],
  selectedGeoRegions: [],
  selectedGeoCities: [],
  selectedGeoDistricts: [],
};

const createPhoto = (
  overrides: Partial<PhotoManifestItem>,
): PhotoManifestItem => ({
  id: "photo",
  title: "photo",
  dateTaken: "2026-04-12T00:00:00.000Z",
  tags: [],
  description: "",
  originalUrl: "/photos/photo.jpg",
  thumbnailUrl: "/thumbnails/photo.jpg",
  thumbHash: null,
  width: 1000,
  height: 800,
  aspectRatio: 1.25,
  s3Key: "photo.jpg",
  lastModified: "2026-04-12T00:00:00.000Z",
  size: 1024,
  exif: null,
  toneAnalysis: null,
  location: null,
  ...overrides,
});

const manifest = createManifest({
  photos: [
    createPhoto({
      id: "visible-photo",
      title: "Visible Photo",
      dateTaken: "2026-04-12T00:00:00.000Z",
      s3Key: "visible-photo.jpg",
      originalUrl: "/photos/visible-photo.jpg",
      thumbnailUrl: "/thumbnails/visible-photo.jpg",
      tags: ["keep"],
    }),
    createPhoto({
      id: "hidden-photo",
      title: "Hidden Photo",
      dateTaken: "2026-04-11T00:00:00.000Z",
      lastModified: "2026-04-11T00:00:00.000Z",
      s3Key: "hidden-photo.jpg",
      originalUrl: "/photos/hidden-photo.jpg",
      thumbnailUrl: "/thumbnails/hidden-photo.jpg",
      tags: ["other"],
    }),
  ],
});

let runtime: AppRuntime;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    AfilmoryRuntimeProvider,
    { runtime },
    React.createElement(Provider, { store: runtime.store }, children),
  );

describe("viewer photo resolution", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  beforeEach(() => {
    runtime = createAppRuntime({ manifest });
    runtime.navigation = createTestNavigation().navigation;
  });

  it("memoizes filterAndSortPhotos on (photos, setting) reference identity", () => {
    const photos = [
      createPhoto({ id: "a", tags: ["keep"] }),
      createPhoto({ id: "b", tags: ["other"] }),
    ];
    const setting = { ...defaultGallerySetting, selectedTags: ["keep"] };

    const first = filterAndSortPhotos(photos, setting);
    const second = filterAndSortPhotos(photos, setting);

    // 同引用重复调用必须返回同一个结果数组（引用相等）
    expect(second).toBe(first);
    expect(first.map((photo) => photo.id)).toEqual(["a"]);

    // setting 引用变化（即使内容相同）要重算
    const recomputed = filterAndSortPhotos(photos, { ...setting });
    expect(recomputed).not.toBe(first);
    expect(recomputed.map((photo) => photo.id)).toEqual(["a"]);

    // photos 引用变化也要重算
    const otherPhotos = [...photos];
    const recomputedForPhotos = filterAndSortPhotos(otherPhotos, setting);
    expect(recomputedForPhotos).not.toBe(first);
    expect(recomputedForPhotos.map((photo) => photo.id)).toEqual(["a"]);
  });

  it("sorts mixed raw-EXIF and ISO dated photos chronologically", () => {
    // 旧实现按原始日期串 localeCompare：EXIF 的 ':' 比 ISO 的 '-' 大，
    // 三月的 EXIF 照片会被排到六月的 ISO 照片之后。
    const exifMarch = createPhoto({
      id: "exif-march",
      dateTaken: "",
      exif: { DateTimeOriginal: "2026:03:15 14:30:00" },
      lastModified: "2026-01-01T00:00:00.000Z",
    });
    const isoFeb = createPhoto({
      id: "iso-feb",
      dateTaken: "",
      lastModified: "2026-02-01T12:00:00.000Z",
    });
    const isoJune = createPhoto({
      id: "iso-june",
      dateTaken: "",
      lastModified: "2026-06-01T12:00:00.000Z",
    });

    expect(
      filterAndSortPhotos(
        [isoFeb, isoJune, exifMarch],
        defaultGallerySetting,
      ).map((photo) => photo.id),
    ).toEqual(["iso-june", "exif-march", "iso-feb"]);

    expect(
      filterAndSortPhotos([exifMarch, isoJune, isoFeb], {
        ...defaultGallerySetting,
        sortOrder: "asc",
      }).map((photo) => photo.id),
    ).toEqual(["iso-feb", "exif-march", "iso-june"]);
  });

  it("returns referentially equal results across getFilteredPhotos calls with stable runtime state", () => {
    runtime.navigation.updateGallerySettings({
      ...defaultGallerySetting,
      selectedTags: ["keep"],
    });

    // layout.tsx 在同一个 effect 里连续调用 getViewerPhotos/getViewerSourceMode，
    // 两次内部的 getFilteredPhotos 应命中备忘、返回同一数组
    expect(getFilteredPhotos(runtime)).toBe(getFilteredPhotos(runtime));

    runtime.navigation.updateGallerySettings({ ...defaultGallerySetting });
    const afterSettingChange = getFilteredPhotos(runtime);
    expect(afterSettingChange.map((photo) => photo.id)).toEqual([
      "visible-photo",
      "hidden-photo",
    ]);
  });

  it("keeps the filtered viewer set when the requested photo is still visible", () => {
    runtime.navigation.updateGallerySettings({
      ...defaultGallerySetting,
      selectedTags: ["keep"],
    });

    const filteredPhotos = getFilteredPhotos(runtime);
    const viewerPhotos = getViewerPhotos(runtime, "visible-photo");

    expect(filteredPhotos.map((photo) => photo.id)).toEqual(["visible-photo"]);
    expect(viewerPhotos.map((photo) => photo.id)).toEqual(["visible-photo"]);
    expect(getViewerSequence(runtime, "visible-photo").source).toBe("filtered");
  });

  it("uses OR within a filter group and AND across filter groups", () => {
    const photos = [
      createPhoto({
        id: "sony-street",
        tags: ["street"],
        exif: { Make: "SONY", Model: "A7C" },
      }),
      createPhoto({
        id: "sony-night",
        tags: ["night"],
        exif: { Make: "SONY", Model: "A7C" },
      }),
      createPhoto({
        id: "fuji-night",
        tags: ["night"],
        exif: { Make: "FUJIFILM", Model: "X-T5" },
      }),
    ];

    expect(
      filterAndSortPhotos(photos, {
        ...defaultGallerySetting,
        selectedTags: ["street", "night"],
        selectedCameras: ["SONY A7C"],
      }).map((photo) => photo.id),
    ).toEqual(["sony-street", "sony-night"]);
  });

  it("falls back to the full photo set when the requested photo is excluded by filters", () => {
    runtime.navigation.updateGallerySettings({
      ...defaultGallerySetting,
      selectedTags: ["keep"],
    });

    const filteredPhotos = getFilteredPhotos(runtime);
    const viewerPhotos = getViewerPhotos(runtime, "hidden-photo");

    expect(filteredPhotos.map((photo) => photo.id)).toEqual(["visible-photo"]);
    expect(viewerPhotos.map((photo) => photo.id)).toEqual([
      "visible-photo",
      "hidden-photo",
    ]);
    expect(viewerPhotos.findIndex((photo) => photo.id === "hidden-photo")).toBe(
      1,
    );
  });

  it("preserves the active sort order when falling back to the full photo set", () => {
    runtime.navigation.updateGallerySettings({
      ...defaultGallerySetting,
      sortOrder: "asc",
      selectedTags: ["keep"],
    });

    const viewerPhotos = getViewerPhotos(runtime, "hidden-photo");

    expect(viewerPhotos.map((photo) => photo.id)).toEqual([
      "hidden-photo",
      "visible-photo",
    ]);
    expect(viewerPhotos.findIndex((photo) => photo.id === "hidden-photo")).toBe(
      0,
    );
  });

  it("bounds stepping by the source sequence", () => {
    runtime.navigation.openPhoto("visible-photo", {
      photoIds: ["visible-photo"],
    });
    const { result } = renderHook(() => usePhotoViewer(), { wrapper });
    act(() => result.current.goToIndex(1));
    expect(result.current.currentIndex).toBe(0);
    expect(runtime.navigation.getPhotoId()).toBe("visible-photo");
  });

  it("retains an all-photo sequence when stepping to a photo included in filters", () => {
    runtime.navigation.updateGallerySettings({
      ...defaultGallerySetting,
      selectedTags: ["keep"],
    });
    runtime.navigation.openPhoto("hidden-photo", {
      photoIds: ["visible-photo", "hidden-photo"],
    });
    const { result } = renderHook(() => usePhotoViewer(), { wrapper });
    act(() => result.current.goToIndex(0));
    expect(runtime.navigation.getPhotoId()).toBe("visible-photo");
    expect(
      getViewerPhotos(runtime, "visible-photo").map((photo) => photo.id),
    ).toEqual(["visible-photo", "hidden-photo"]);
    act(() => runtime.navigation.closePhoto());
    expect(
      getViewerPhotos(runtime, "visible-photo").map((photo) => photo.id),
    ).toEqual(["visible-photo"]);
  });

  it("falls back to all photos when the requested ID is outside the stored sequence", () => {
    runtime.navigation.updateGallerySettings({
      ...defaultGallerySetting,
      selectedTags: ["keep"],
    });
    runtime.navigation.openPhoto("visible-photo", {
      photoIds: ["visible-photo"],
    });
    expect(
      getViewerPhotos(runtime, "hidden-photo").map((photo) => photo.id),
    ).toEqual(["visible-photo", "hidden-photo"]);
  });

  it("labels an unfiltered direct link as all photos", () => {
    runtime.navigation = createTestNavigation(
      "/photos/hidden-photo",
    ).navigation;
    const sequence = getViewerSequence(runtime, "hidden-photo");
    expect(sequence.source).toBe("all");
    expect(sequence.photos.map((photo) => photo.id)).toEqual([
      "visible-photo",
      "hidden-photo",
    ]);
  });

  it("labels the selected-filter sequence even when it matches the whole library", () => {
    runtime.navigation.updateGallerySettings({
      ...defaultGallerySetting,
      selectedTags: ["keep", "other"],
    });
    runtime.navigation.openPhoto("visible-photo", {
      photoIds: ["visible-photo", "hidden-photo"],
    });
    expect(getViewerSequence(runtime, "visible-photo").source).toBe("filtered");
  });

  it("labels full-library fallback truthfully after stepping back into a filter match", () => {
    runtime.navigation = createTestNavigation(
      "/photos/hidden-photo?tags=keep",
    ).navigation;
    const { result } = renderHook(
      () => ({
        viewer: usePhotoViewer(),
        sequence: useViewerSequence(runtime.navigation.getPhotoId()),
      }),
      { wrapper },
    );
    expect(result.current.sequence.source).toBe("all");
    act(() => result.current.viewer.goToIndex(0));
    expect(runtime.navigation.getPhotoId()).toBe("visible-photo");
    expect(result.current.sequence.source).toBe("all");
    expect(result.current.sequence.photos).toHaveLength(2);
  });

  it("retains map sequence order and source while stepping", () => {
    runtime.navigation = createTestNavigation(
      "/explore?mode=photos",
    ).navigation;
    runtime.navigation.openPhoto("hidden-photo", {
      photoIds: ["hidden-photo", "visible-photo"],
    });
    const { result } = renderHook(() => usePhotoViewer(), { wrapper });
    expect(getViewerSequence(runtime, "hidden-photo").source).toBe("map");
    expect(
      getViewerSequence(runtime, "hidden-photo").photos.map(
        (photo) => photo.id,
      ),
    ).toEqual(["hidden-photo", "visible-photo"]);
    act(() => result.current.goToIndex(1));
    expect(getViewerSequence(runtime, "visible-photo").source).toBe("map");
    expect(runtime.navigation.getPhotoSequenceOrigin()).toBe("map");
  });

  it("does not call a fallback full-library sequence map photos just because it came from a map", () => {
    runtime.navigation = createTestNavigation("/explore").navigation;
    runtime.navigation.openPhoto("hidden-photo");
    expect(getViewerSequence(runtime, "hidden-photo").source).toBe("all");
    const { result } = renderHook(() => usePhotoViewer(), { wrapper });
    act(() => result.current.goToIndex(0));
    expect(getViewerSequence(runtime, "visible-photo").source).toBe("all");
    expect(runtime.navigation.getPhotoSequenceOrigin()).toBeNull();

    act(() => {
      runtime.navigation.closePhoto();
      runtime.navigation.openPhoto("visible-photo", {
        photoIds: ["visible-photo"],
      });
    });
    expect(getViewerSequence(runtime, "hidden-photo").source).toBe("all");
  });

  it("does not mislabel an arbitrary stored subset as all photos or current filters", () => {
    runtime.navigation.openPhoto("visible-photo", {
      photoIds: ["visible-photo"],
    });
    expect(getViewerSequence(runtime, "visible-photo").source).toBe("sequence");
  });

  it("restores body overflow on close and unmount", async () => {
    document.body.style.overflow = "clip";
    const { unmount } = renderHook(() => usePhotoViewerBodyScrollLock(), {
      wrapper,
    });
    act(() => runtime.navigation.openPhoto("visible-photo"));
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
    act(() => runtime.navigation.requestPhotoClose());
    await waitFor(() => expect(document.body.style.overflow).toBe("clip"));
    act(() => runtime.navigation.openPhoto("hidden-photo"));
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
    unmount();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("keeps body locking outside action-only consumers", () => {
    document.body.style.overflow = "clip";
    const { result } = renderHook(() => useAppNavigation(), { wrapper });
    act(() => result.current.openPhoto("visible-photo"));
    expect(document.body.style.overflow).toBe("clip");
  });
});
