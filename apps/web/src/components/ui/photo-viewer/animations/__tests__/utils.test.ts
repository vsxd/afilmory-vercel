import { afterEach, describe, expect, it } from "vitest";

import type { PhotoManifest } from "~/types/photo";

import {
  computeViewerImageFrame,
  DESKTOP_EXIF_PANEL_WIDTH_REM,
  PHOTO_VIEWER_FIT_SCALE,
} from "../utils";

describe("photo viewer transition utilities", () => {
  afterEach(() => {
    document.documentElement.style.fontSize = "";
  });

  it("keeps entry thumbnails aligned with the viewer fit baseline after the transition", () => {
    document.documentElement.style.fontSize = "16px";

    const viewportRect = new DOMRect(0, 0, 1600, 1000);
    const frame = computeViewerImageFrame(
      {
        width: 6000,
        height: 4000,
      } as PhotoManifest,
      viewportRect,
      false,
    );

    const desktopExifWidth = DESKTOP_EXIF_PANEL_WIDTH_REM * 16;
    const desktopThumbnailStripHeight = 64 + 16 * 2;
    const contentWidth = viewportRect.width - desktopExifWidth;
    const contentHeight = viewportRect.height - desktopThumbnailStripHeight;
    const unscaledWidth = contentWidth;
    const unscaledHeight = contentWidth / 1.5;

    expect(frame.width).toBeCloseTo(unscaledWidth * PHOTO_VIEWER_FIT_SCALE);
    expect(frame.height).toBeCloseTo(unscaledHeight * PHOTO_VIEWER_FIT_SCALE);
    expect(frame.left).toBeCloseTo((contentWidth - frame.width) / 2);
    expect(frame.top).toBeCloseTo((contentHeight - frame.height) / 2);
  });

  it.each([
    {
      name: "landscape photo above mobile information",
      photo: { width: 6000, height: 4000 },
      media: new DOMRect(12, 72, 390, 240),
      isMobile: true,
      expected: { left: 27, top: 72, width: 360, height: 240 },
    },
    {
      name: "portrait photo above mobile information",
      photo: { width: 4000, height: 6000 },
      media: new DOMRect(12, 72, 390, 240),
      isMobile: true,
      expected: { left: 127, top: 72, width: 160, height: 240 },
    },
    {
      name: "desktop media viewport that already excludes its side panel",
      photo: { width: 6000, height: 4000 },
      media: new DOMRect(100, 30, 1200, 700),
      isMobile: false,
      expected: { left: 175, top: 30, width: 1050, height: 700 },
    },
  ])("fits the $name within measured media bounds", (testCase) => {
    const frame = computeViewerImageFrame(
      testCase.photo as PhotoManifest,
      new DOMRect(0, 0, 1600, 1000),
      testCase.isMobile,
      testCase.media,
    );

    expect(frame).toEqual({ ...testCase.expected, borderRadius: 0 });
  });
});
