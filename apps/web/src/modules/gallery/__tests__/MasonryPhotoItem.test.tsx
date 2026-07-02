import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { HTMLAttributes, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gallerySettingAtom } from "~/atoms/app";
import { navigateAtom, routeAtom } from "~/atoms/route";
import {
  getThumbnailLoadCacheKey,
  markThumbnailLoaded,
  resetThumbnailLoadCache,
} from "~/lib/thumbnail-load-cache";
import type { PhotoManifest } from "~/types/photo";

import { MasonryPhotoItem } from "../MasonryPhotoItem";

const openViewer = vi.fn();
const navigate = vi.fn();
let contextPhotos: PhotoManifest[] = [];
let gallerySetting = {
  selectedTags: [],
  selectedCameras: ["SONY ILCE-7C"],
  selectedLenses: [],
  selectedGeoCountries: [],
  selectedGeoRegions: [],
  selectedGeoCities: [],
  selectedGeoDistricts: [],
};

const photo = {
  aspectRatio: 1.5,
  dateTaken: "2026-06-06T00:00:00.000Z",
  description: "",
  etag: "etag-photo-1",
  exif: null,
  height: 4000,
  id: "photo-1",
  lastModified: "2026-06-06T00:00:00.000Z",
  location: null,
  originalUrl: "/original.jpg",
  s3Key: "photo-1.jpg",
  size: 1024,
  tags: [],
  thumbnailUrl: "/thumb.jpg",
  thumbHash: null,
  title: "A7C01202",
  toneAnalysis: null,
  width: 6000,
} satisfies PhotoManifest;

vi.mock("@afilmory/ui", () => ({
  Thumbhash: ({ className }: { className?: string }) => (
    <div className={className} />
  ),
}));

vi.mock("motion/react", () => ({
  m: {
    div: ({
      children,
      ...props
    }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("~/hooks/useLivePhotoHandler", () => ({
  useLivePhotoHandler: () => ({
    videoRef: { current: null },
    hasVideo: false,
    isPlayingLivePhoto: false,
    isConvertingVideo: false,
    videoConversionError: null,
    handleMouseEnter: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleVideoEnded: vi.fn(),
  }),
}));

vi.mock("~/hooks/usePhotoViewer", () => ({
  useContextPhotos: () => contextPhotos,
  useOpenPhotoViewer: () => openViewer,
  usePhotoViewer: () => ({
    openViewer,
  }),
}));

vi.mock("~/lib/gallery-thumbnail-cache", () => ({
  getGalleryThumbnailCacheKey: (_id: string, url: string) => url,
  hasLoadedGalleryThumbnail: () => false,
  markGalleryThumbnailLoaded: vi.fn(),
}));

vi.mock("~/lib/image-utils", () => ({
  getImageFormat: () => "jpg",
}));

vi.mock("~/lib/startup-metrics", () => ({
  flushStartupMetrics: vi.fn(),
  markStartupOnce: () => false,
}));

describe("MasonryPhotoItem", () => {
  let store: ReturnType<typeof createStore>;

  // 组件现在通过 jotai store 读取路由/导航/画廊设置（而非订阅 react-router/atom），
  // 因此用真实 store 播种这些值，并用 Provider 包裹渲染。
  const renderItem = (props: {
    data: PhotoManifest;
    width: number;
    index: number;
  }) =>
    render(<MasonryPhotoItem {...props} />, {
      wrapper: ({ children }: PropsWithChildren) => (
        <Provider store={store}>{children}</Provider>
      ),
    });

  afterEach(() => {
    cleanup();
    resetThumbnailLoadCache();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    contextPhotos = [photo];
    gallerySetting = {
      selectedTags: [],
      selectedCameras: ["SONY ILCE-7C"],
      selectedLenses: [],
      selectedGeoCountries: [],
      selectedGeoRegions: [],
      selectedGeoCities: [],
      selectedGeoDistricts: [],
    };

    store = createStore();
    store.set(gallerySettingAtom, {
      ...store.get(gallerySettingAtom),
      ...gallerySetting,
    });
    store.set(routeAtom, {
      ...store.get(routeAtom),
      location: {
        ...store.get(routeAtom).location,
        search: "?cameras=SONY%20ILCE-7C",
      },
    });
    store.set(navigateAtom, { fn: navigate });
  });

  it("opens a filtered viewer session and navigates to the photo detail route with filters intact", () => {
    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });

    fireEvent.click(getByRole("button", { name: "A7C01202" }));

    expect(openViewer).toHaveBeenCalledWith(0, {
      element: expect.any(HTMLElement),
      sourceMode: "filtered",
      sourcePhotoIds: ["photo-1"],
    });
    expect(navigate).toHaveBeenCalledWith({
      pathname: "/photos/photo-1",
      search: "?cameras=SONY+ILCE-7C",
    });
  });

  it("still navigates when the current masonry index is temporarily missing from context photos", () => {
    contextPhotos = [];

    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });

    fireEvent.click(getByRole("button", { name: "A7C01202" }));

    expect(openViewer).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({
      pathname: "/photos/photo-1",
      search: "?cameras=SONY+ILCE-7C",
    });
  });

  it("eagerly loads the first few thumbnails as LCP candidates with high priority", () => {
    const { getByAltText } = renderItem({ data: photo, width: 300, index: 0 });

    const img = getByAltText("A7C01202");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("loading")).toBe("eager");
  });

  it("marks later thumbnails as low priority/lazy so detail images can win user-initiated loads", () => {
    const { getByAltText } = renderItem({ data: photo, width: 300, index: 8 });

    const img = getByAltText("A7C01202");
    expect(img.getAttribute("fetchpriority")).toBe("low");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("reloads previously cached thumbnails eagerly on remount (skip lazy re-decision)", () => {
    // 虚拟列表滚回时格子重挂载：图已在缓存里，eager 跳过浏览器 lazy 观察延迟，
    // 缩短重挂载的空窗（fetchPriority 仍保持 low，不与首屏抢带宽）。
    markThumbnailLoaded(getThumbnailLoadCacheKey(photo.id, photo.thumbnailUrl));

    const { getByAltText } = renderItem({ data: photo, width: 300, index: 8 });

    const img = getByAltText("A7C01202");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("low");
  });

  it("waits for async route navigation before opening the viewer", async () => {
    let resolveNavigation!: () => void;
    navigate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveNavigation = resolve;
      }),
    );

    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });

    fireEvent.click(getByRole("button", { name: "A7C01202" }));

    expect(navigate).toHaveBeenCalledWith({
      pathname: "/photos/photo-1",
      search: "?cameras=SONY+ILCE-7C",
    });
    expect(openViewer).not.toHaveBeenCalled();

    resolveNavigation();

    await waitFor(() => {
      expect(openViewer).toHaveBeenCalledWith(0, {
        element: expect.any(HTMLElement),
        sourceMode: "filtered",
        sourcePhotoIds: ["photo-1"],
      });
    });
  });
});
