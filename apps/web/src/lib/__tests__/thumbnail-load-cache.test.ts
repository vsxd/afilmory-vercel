import { afterEach, describe, expect, it } from "vitest";

import {
  getThumbnailLoadCacheKey,
  hasLoadedThumbnail,
  markThumbnailLoaded,
  resetThumbnailLoadCache,
} from "../thumbnail-load-cache";

describe("thumbnail-load-cache", () => {
  afterEach(() => {
    resetThumbnailLoadCache();
  });

  it("uses the thumbnail src when available", () => {
    expect(
      getThumbnailLoadCacheKey("photo-1", "https://example.com/thumb.jpg"),
    ).toBe("https://example.com/thumb.jpg");
  });

  it("falls back to the photo id when src is missing", () => {
    expect(getThumbnailLoadCacheKey("photo-1", null)).toBe("photo-1");
  });

  it("remembers loaded thumbnails", () => {
    const cacheKey = getThumbnailLoadCacheKey("photo-1", "/thumb.jpg");

    expect(hasLoadedThumbnail(cacheKey)).toBe(false);

    markThumbnailLoaded(cacheKey);

    expect(hasLoadedThumbnail(cacheKey)).toBe(true);
  });
});
