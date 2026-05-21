import { afterEach, describe, expect, it } from "vitest";

import {
  getGalleryThumbnailCacheKey,
  hasLoadedGalleryThumbnail,
  markGalleryThumbnailLoaded,
  resetGalleryThumbnailCache,
} from "../gallery-thumbnail-cache";

describe("gallery-thumbnail-cache", () => {
  afterEach(() => {
    resetGalleryThumbnailCache();
  });

  it("uses the thumbnail url when available", () => {
    expect(
      getGalleryThumbnailCacheKey("photo-1", "https://example.com/thumb.jpg"),
    ).toBe("https://example.com/thumb.jpg");
  });

  it("falls back to the photo id when thumbnail url is missing", () => {
    expect(getGalleryThumbnailCacheKey("photo-1", null)).toBe("photo-1");
  });

  it("remembers thumbnails that have already loaded", () => {
    const cacheKey = "photo-1";

    expect(hasLoadedGalleryThumbnail(cacheKey)).toBe(false);

    markGalleryThumbnailLoaded(cacheKey);

    expect(hasLoadedGalleryThumbnail(cacheKey)).toBe(true);
  });
});
