import { cleanup, fireEvent, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getThumbnailLoadCacheKey,
  markThumbnailLoaded,
  resetThumbnailLoadCache,
} from "~/lib/thumbnail-load-cache";
import type { PhotoManifest } from "~/types/photo";

import { MasonryPhotoItem } from "../MasonryPhotoItem";

const device = vi.hoisted(() => ({ isMobile: false }));
vi.mock("~/lib/device-viewport", () => ({
  get isMobileDevice() {
    return device.isMobile;
  },
}));

const navigate = vi.fn();
let contextPhotos: PhotoManifest[] = [];
vi.mock("~/navigation/hooks", () => ({
  useAppNavigation: () => ({
    openPhoto: navigate,
    photoHref: (id: string) =>
      `/photos/${encodeURIComponent(id)}?cameras=SONY+ILCE-7C`,
  }),
}));

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

vi.mock("@afilmory/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@afilmory/ui")>()),
  Thumbhash: ({ className }: { className?: string }) => (
    <div className={className} />
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // 简单插值：断言未命名照片 aria-label 里的日期是否被真正传入
    t: (key: string, options?: Record<string, unknown>) =>
      options && "date" in options ? `${key}:${String(options.date)}` : key,
    i18n: { language: "en" },
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
    onFocus?: (index: number) => void;
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
    device.isMobile = false;
    contextPhotos = [photo];
    store = createStore();
  });

  it("opens a filtered viewer session and navigates to the photo detail route with filters intact", () => {
    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });

    fireEvent.click(getByRole("link", { name: "A7C01202" }));

    expect(navigate).toHaveBeenCalledWith("photo-1", { photoIds: ["photo-1"] });
  });

  it("activates on Space like the former role=button (native anchors are Enter-only)", () => {
    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });
    const link = getByRole("link", { name: "A7C01202" });

    // 带修饰键的 Space 不拦截（保留原生滚动/浏览器行为）。
    fireEvent.keyDown(link, { key: " ", metaKey: true });
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.keyDown(link, { key: " " });

    expect(navigate).toHaveBeenCalledWith("photo-1", { photoIds: ["photo-1"] });
  });

  it("reports focus with its own index so the parent handler can stay identity-stable", () => {
    const onFocus = vi.fn();
    const { getByRole } = renderItem({
      data: photo,
      width: 300,
      index: 7,
      onFocus,
    });

    fireEvent.focus(getByRole("link", { name: "A7C01202" }));

    expect(onFocus).toHaveBeenCalledWith(7);
  });

  it("still navigates when the current masonry index is temporarily missing from context photos", () => {
    contextPhotos = [];

    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });

    fireEvent.click(getByRole("link", { name: "A7C01202" }));

    expect(navigate).toHaveBeenCalledWith("photo-1", { photoIds: [] });
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

  it("keeps the shared keyboard outline inside the clipped photo cell", () => {
    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });
    const cell = getByRole("link", { name: "A7C01202" });
    expect(cell.style.outlineOffset).toBe("-3px");
    expect(cell.className).not.toContain("focus-visible:ring-");
  });

  it("reveals metadata for keyboard focus on a touch device without adding it to scrolling cells", () => {
    device.isMobile = true;
    markThumbnailLoaded(getThumbnailLoadCacheKey(photo.id, photo.thumbnailUrl));
    const { getByRole, queryByRole } = renderItem({
      data: photo,
      width: 300,
      index: 0,
    });
    const link = getByRole("link", { name: "A7C01202" });
    expect(queryByRole("heading", { level: 2 })).toBeNull();

    fireEvent.focus(link);
    expect(getByRole("heading", { level: 2, name: "A7C01202" })).toBeTruthy();

    fireEvent.blur(link);
    expect(queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("uses a level-two heading beneath the gallery's page heading", () => {
    markThumbnailLoaded(getThumbnailLoadCacheKey(photo.id, photo.thumbnailUrl));
    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });

    expect(getByRole("heading", { level: 2, name: "A7C01202" })).toBeTruthy();
  });

  it("labels untitled photos with their formatted taken date for screen readers", () => {
    const untitled = { ...photo, title: "", description: "" };
    // 期望值用同一套 Intl 参数计算，避免测试机时区导致日期偏移
    const expectedDate = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(untitled.dateTaken));

    const { getByRole } = renderItem({ data: untitled, width: 300, index: 0 });

    expect(
      getByRole("link", {
        name: `photo.untitled.taken-on:${expectedDate}`,
      }),
    ).toBeTruthy();
  });

  it("falls back to a generic untitled label when the taken date is invalid", () => {
    const untitled = { ...photo, title: "", description: "", dateTaken: "" };

    const { getByRole } = renderItem({ data: untitled, width: 300, index: 0 });

    expect(getByRole("link", { name: "photo.untitled.fallback" })).toBeTruthy();
  });

  it("preserves modified click semantics without dispatching navigation", () => {
    const { getByRole } = renderItem({ data: photo, width: 300, index: 0 });
    const link = getByRole("link");
    link.setAttribute("href", "#photo"); // Avoid jsdom attempting document navigation.
    fireEvent.click(link, { ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });
});
