import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getThumbnailLoadCacheKey,
  hasLoadedThumbnail,
  markThumbnailLoaded,
  resetThumbnailLoadCache,
} from "~/lib/thumbnail-load-cache";

import { ThumbnailImage } from "../ThumbnailImage";

let mockInView = false;

vi.mock("@afilmory/ui", () => ({
  Thumbhash: ({ thumbHash }: { thumbHash: string }) => (
    <div data-testid="thumbhash" data-thumbhash={thumbHash} />
  ),
}));

vi.mock("react-intersection-observer", () => ({
  useInView: () => ({
    ref: vi.fn(),
    inView: mockInView,
  }),
}));

describe("ThumbnailImage", () => {
  afterEach(() => {
    cleanup();
    resetThumbnailLoadCache();
    mockInView = false;
  });

  it("starts loaded when the thumbnail cache already has the image", () => {
    const cacheKey = getThumbnailLoadCacheKey("photo-1", "/thumb.jpg");
    markThumbnailLoaded(cacheKey);

    render(
      <ThumbnailImage
        photoId="photo-1"
        src="/thumb.jpg"
        alt="Cached thumbnail"
        thumbHash="mock-thumbhash"
      />,
    );

    // thumbhash 常驻垫底（桥接重挂载后 img 取缓存 + 解码的空窗，避免露灰底），
    // 首帧 img 即 opacity-100，解码完成后覆盖占位。
    expect(screen.queryByTestId("thumbhash")).not.toBeNull();
    const img = screen.getByAltText("Cached thumbnail");
    expect(img.className).toContain("opacity-100");
    // img 必须是定位元素：absolute 的占位按 CSS 绘制顺序画在非定位元素之上，
    // 少了 relative 整张图会被常驻占位盖住（回归：生产曾全站照片被糊层覆盖）。
    expect(img.className).toContain("relative");
  });

  it("marks a thumbnail as loaded after the image load event", () => {
    const onLoadStateChange = vi.fn();
    const cacheKey = getThumbnailLoadCacheKey("photo-1", "/thumb.jpg");

    render(
      <ThumbnailImage
        photoId="photo-1"
        src="/thumb.jpg"
        alt="Fresh thumbnail"
        thumbHash="mock-thumbhash"
        onLoadStateChange={onLoadStateChange}
      />,
    );

    fireEvent.load(screen.getByAltText("Fresh thumbnail"));

    expect(hasLoadedThumbnail(cacheKey)).toBe(true);
    expect(onLoadStateChange).toHaveBeenLastCalledWith(true);
  });

  it("resets loaded state when the thumbnail src changes", () => {
    const { rerender } = render(
      <ThumbnailImage
        photoId="photo-1"
        src="/first-thumb.jpg"
        alt="Changing thumbnail"
        thumbHash="first-thumbhash"
      />,
    );

    fireEvent.load(screen.getByAltText("Changing thumbnail"));

    rerender(
      <ThumbnailImage
        photoId="photo-1"
        src="/second-thumb.jpg"
        alt="Changing thumbnail"
        thumbHash="second-thumbhash"
      />,
    );

    expect(screen.getByTestId("thumbhash").dataset.thumbhash).toBe(
      "second-thumbhash",
    );
    expect(screen.getByAltText("Changing thumbnail").className).toContain(
      "opacity-0",
    );
  });

  it("waits for in-view loading unless the thumbnail was already cached", () => {
    const { unmount } = render(
      <ThumbnailImage
        photoId="photo-1"
        src="/thumb.jpg"
        alt="Lazy thumbnail"
        thumbHash="mock-thumbhash"
        loadPolicy="in-view"
      />,
    );

    expect(screen.queryByAltText("Lazy thumbnail")).toBeNull();
    expect(screen.getByTestId("thumbhash")).toBeTruthy();

    unmount();
    markThumbnailLoaded(getThumbnailLoadCacheKey("photo-1", "/thumb.jpg"));

    render(
      <ThumbnailImage
        photoId="photo-1"
        src="/thumb.jpg"
        alt="Lazy thumbnail"
        thumbHash="mock-thumbhash"
        loadPolicy="in-view"
      />,
    );

    expect(screen.getByAltText("Lazy thumbnail").className).toContain(
      "opacity-100",
    );
  });
});
