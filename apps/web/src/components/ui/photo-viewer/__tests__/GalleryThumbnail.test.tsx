import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getThumbnailLoadCacheKey,
  markThumbnailLoaded,
  resetThumbnailLoadCache,
} from "~/lib/thumbnail-load-cache";
import type { PhotoManifest } from "~/types/photo";

import { GalleryThumbnail } from "../GalleryThumbnail";

vi.stubGlobal(
  "ResizeObserver",
  vi.fn(() => ({
    disconnect: vi.fn(),
    observe: vi.fn(),
  })),
);

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

vi.mock("@afilmory/ui", () => ({
  clsxm: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
  Spring: {
    presets: {
      smooth: {},
    },
  },
  Thumbhash: ({ thumbHash }: { thumbHash: string }) => (
    <div data-testid="thumbhash" data-thumbhash={thumbHash} />
  ),
}));

vi.mock("motion/react", () => ({
  m: {
    div: ({ children, ...props }: ComponentProps<"div">) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-intersection-observer", () => ({
  useInView: () => ({
    ref: vi.fn(),
    inView: false,
  }),
}));

vi.mock("~/hooks/useMobile", () => ({
  useMobile: () => false,
}));

vi.mock("~/lib/dom", () => ({
  nextFrame: (callback: () => void) => callback(),
}));

const photo = {
  id: "photo-1",
  title: "Cached photo",
  description: "",
  dateTaken: "2026-06-06T00:00:00.000Z",
  tags: [],
  originalUrl: "/original.jpg",
  thumbnailUrl: "/thumb.jpg",
  thumbHash: "mock-thumbhash",
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

describe("GalleryThumbnail", () => {
  afterEach(() => {
    cleanup();
    resetThumbnailLoadCache();
  });

  it("renders cached viewer thumbnails as already loaded on the first frame", () => {
    markThumbnailLoaded(getThumbnailLoadCacheKey(photo.id, photo.thumbnailUrl));

    render(
      <GalleryThumbnail
        currentIndex={0}
        photos={[photo]}
        onIndexChange={vi.fn()}
      />,
    );

    // thumbhash 常驻垫底（见 ThumbnailImage），已缓存图首帧即 opacity-100 不重淡入。
    expect(screen.queryByTestId("thumbhash")).not.toBeNull();
    expect(screen.getByAltText("Cached photo").className).toContain(
      "opacity-100",
    );
  });
});
