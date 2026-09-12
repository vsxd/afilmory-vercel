import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhotoManifest } from "~/types/photo";

import { PhotoViewer } from "../PhotoViewer";

// ExifPanel 与 GalleryThumbnail 是 PhotoViewer 里真正的 lazy() 分割点：本测试
// 渲染真实的懒加载链路（named export → default 的映射、Suspense fallback），
// 只 mock 掉与分割无关的重型邻居（swiper 轮播、入场动画、raw EXIF 查看器等）。

vi.stubGlobal(
  "ResizeObserver",
  vi.fn(
    class {
      disconnect = vi.fn();
      observe = vi.fn();
    },
  ),
);

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

vi.mock("@afilmory/ui", () => ({
  clsxm: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  ScrollArea: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Spring: {
    presets: {
      smooth: {},
      snappy: {},
    },
  },
  Thumbhash: () => <div data-testid="thumbhash" />,
}));

vi.mock("motion/react", () => {
  const MotionDiv = ({
    children,
    // 剥掉 motion 专有 props，避免它们泄漏到 DOM 上
    initial: _initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    variants: _variants,
    onAnimationComplete: _onAnimationComplete,
    ...props
  }: ComponentProps<"div"> & Record<string, unknown>) => (
    <div {...(props as ComponentProps<"div">)}>{children}</div>
  );
  return {
    AnimatePresence: ({ children }: PropsWithChildren) => <>{children}</>,
    m: { div: MotionDiv },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("react-intersection-observer", () => ({
  useInView: () => ({
    ref: vi.fn(),
    inView: false,
  }),
}));

vi.mock("~/hooks/useExifPanel", () => ({
  useExifPanel: () => ({
    showExifPanel: false,
    toggleExifPanel: vi.fn(),
    closeExifPanel: vi.fn(),
  }),
}));

vi.mock("~/hooks/useMobile", () => ({
  useMobile: () => false,
}));

vi.mock("~/hooks/usePhotoNavigation", () => ({
  usePhotoNavigation: () => ({
    handlePrevious: vi.fn(),
    handleNext: vi.fn(),
    canGoPrevious: false,
    canGoNext: false,
  }),
}));

vi.mock("~/lib/dom", () => ({
  nextFrame: (callback: () => void) => callback(),
}));

vi.mock("~/lib/i18n-dynamic", () => ({
  translateDynamicKey: (_i18n: unknown, key: string) => key,
}));

vi.mock("../animations/PhotoViewerTransitionPreview", () => ({
  PhotoViewerTransitionPreview: () => null,
}));

vi.mock("../animations/usePhotoViewerTransitions", () => ({
  usePhotoViewerTransitions: () => ({
    containerRef: { current: null },
    entryTransition: null,
    exitTransition: null,
    isViewerContentVisible: true,
    isEntryAnimating: false,
    shouldRenderBackdrop: false,
    thumbHash: null,
    shouldRenderThumbhash: false,
    handleEntryAnimationComplete: vi.fn(),
    handleExitAnimationComplete: vi.fn(),
  }),
}));

vi.mock("../ExifPanelSections", () => ({
  ExifPanelSections: () => <div data-testid="basic-exif-section" />,
}));

vi.mock("../PhotoViewerController", () => ({
  usePhotoViewerBlobSource: () => ({
    currentBlobSrc: null,
    resetBlobSource: vi.fn(),
    handleBlobSrcChange: vi.fn(),
  }),
  usePhotoViewerKeyboard: vi.fn(),
  useSwiperIndexSync: vi.fn(),
  useSwiperZoomLock: vi.fn(),
}));

vi.mock("../PhotoViewerMediaCarousel", () => ({
  PhotoViewerMediaCarousel: () => <div data-testid="media-carousel" />,
}));

vi.mock("../PhotoViewerToolbar", () => ({
  PhotoViewerToolbar: () => <div data-testid="toolbar" />,
}));

vi.mock("../RawExifViewer", () => ({
  RawExifViewer: () => null,
}));

vi.mock("../useDismissGesture", () => ({
  useDismissGesture: () => ({
    contentX: 0,
    contentY: 0,
    contentScale: 1,
    chromeOpacity: 1,
    revealOpacity: 1,
  }),
}));

const photo = {
  id: "photo-1",
  title: "Test photo",
  description: "",
  dateTaken: "2026-06-06T00:00:00.000Z",
  tags: [],
  originalUrl: "/original.jpg",
  thumbnailUrl: "/thumb.jpg",
  thumbHash: null,
  width: 100,
  height: 100,
  aspectRatio: 1,
  s3Key: "photo.jpg",
  lastModified: "2026-06-06T00:00:00.000Z",
  size: 100,
  exif: null,
  toneAnalysis: null,
  location: null,
} satisfies PhotoManifest;

describe("PhotoViewer lazy shell", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the real ExifPanel and GalleryThumbnail through the lazy Suspense boundaries", async () => {
    render(
      <PhotoViewer
        photos={[photo]}
        currentIndex={0}
        isOpen
        onClose={vi.fn()}
        onIndexChange={vi.fn()}
        triggerElement={null}
      />,
    );

    // 懒加载的 chunk 解析后，两个组件的真实内容必须出现——named export →
    // default 的映射一旦写错，这里会以 “Element type is invalid” 失败。
    expect(await screen.findByText("exif.header.title")).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "photo.thumbnail.open" }),
    ).toBeTruthy();
    expect(screen.getByTestId("basic-exif-section")).toBeTruthy();
  });
});
