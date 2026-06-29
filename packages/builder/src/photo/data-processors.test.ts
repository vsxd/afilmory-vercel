import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PhotoProcessorOptions } from "../core/contracts/photo-processing.js";
import { generateThumbnailAndBlurhash } from "../image/thumbnail.js";
import { processThumbnailAndBlurhash } from "./data-processors.js";

// `vi.mock` is hoisted above the imports by Vitest, so the imported
// `generateThumbnailAndBlurhash` resolves to the mock below.
vi.mock("../image/thumbnail.js", () => ({
  generateThumbnailAndBlurhash: vi.fn(),
  getThumbnailPublicUrl: (photoId: string) => `/thumbnails/${photoId}.jpg`,
  thumbnailExists: vi.fn(async () => false),
}));

vi.mock("./logger-adapter.js", () => {
  const makeLogger = () => ({
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });
  return {
    getPhotoProcessingLoggers: () => ({
      image: makeLogger(),
      s3: makeLogger(),
      thumbnail: makeLogger(),
      blurhash: makeLogger(),
      exif: makeLogger(),
      tone: makeLogger(),
      location: makeLogger(),
    }),
  };
});

const mockedGenerate = vi.mocked(generateThumbnailAndBlurhash);

const options: PhotoProcessorOptions = {
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
};

describe("processThumbnailAndBlurhash failure handling", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("returns null (skip the photo) when thumbnail generation fails, instead of null-filled fields", async () => {
    // Regression guard: a failed thumbnail must NOT produce a manifest item with
    // thumbnailUrl: null — that poisons the manifest and bricks future builds via
    // assertManifest. The photo should be dropped (counted as failed) instead.
    mockedGenerate.mockResolvedValue({
      thumbnailUrl: null,
      thumbnailBuffer: null,
      thumbHash: null,
    });

    const result = await processThumbnailAndBlurhash(
      Buffer.from("not-a-real-image"),
      "broken-photo",
      undefined,
      options,
    );

    expect(result).toBeNull();
  });

  it("returns the thumbnail result when generation succeeds", async () => {
    const buffer = Buffer.from("jpeg-bytes");
    mockedGenerate.mockResolvedValue({
      thumbnailUrl: "/thumbnails/ok-photo.jpg",
      thumbnailBuffer: buffer,
      thumbHash: new Uint8Array([1, 2, 3]),
    });

    const result = await processThumbnailAndBlurhash(
      Buffer.from("real-image"),
      "ok-photo",
      undefined,
      options,
    );

    expect(result).not.toBeNull();
    expect(result?.thumbnailUrl).toBe("/thumbnails/ok-photo.jpg");
    expect(result?.thumbnailBuffer).toBe(buffer);
  });
});
