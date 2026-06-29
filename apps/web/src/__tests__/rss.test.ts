import type { PhotoManifestItem } from "@afilmory/schema";
import { describe, expect, it } from "vitest";

import { generateRSSFeed } from "../../plugins/vite/rss";

function makePhoto(overrides: Partial<PhotoManifestItem>): PhotoManifestItem {
  return {
    id: "photo-1",
    title: "Title",
    description: "",
    tags: [],
    originalUrl: "https://cdn.example.com/photo-1.jpg",
    thumbnailUrl: "/thumbnails/photo-1.jpg",
    thumbHash: null,
    width: 4000,
    height: 3000,
    aspectRatio: 4000 / 3000,
    s3Key: "photo-1.jpg",
    lastModified: "2024-01-01T00:00:00Z",
    dateTaken: "2024-01-01T00:00:00Z",
    size: 1000,
    exif: null,
    toneAnalysis: null,
    location: null,
    ...overrides,
  } as PhotoManifestItem;
}

describe("generateRSSFeed XML safety", () => {
  it("produces well-formed XML even with hostile EXIF values", () => {
    const photo = makePhoto({
      exif: {
        // CDATA breakout attempt
        LensModel: "Evil ]]><script>alert(1)</script> Lens",
        Make: "Acme ]]>",
        Model: "<Model & Co>",
        SceneCaptureType: "Standard ]]><img src=x onerror=alert(1)>",
        // Raw element-body injection attempts
        WhiteBalance: "Auto & <broken>",
        MeteringMode: "<spot>",
        ColorSpace: "sRGB & more",
        ExposureProgram: "Manual <p>",
        Orientation: "Rotate 90 CW & <x>",
      } as never,
    });

    const xml = generateRSSFeed([photo], {
      title: "Test",
      url: "https://example.com",
    });

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const parserError = doc.querySelector("parsererror");
    expect(parserError).toBeNull();

    // Well-formedness alone proves no breakout, but assert it concretely: the
    // injected payloads must not have become real elements (they should be
    // inert text inside CDATA or escaped in element bodies).
    expect(doc.querySelectorAll("script").length).toBe(0);
    expect(doc.querySelectorAll("img").length).toBe(0);
    expect(doc.querySelectorAll("broken").length).toBe(0);
  });

  it("escapes a hostile photo title and tags", () => {
    const photo = makePhoto({
      title: 'Sunset <b>&</b> "quotes"',
      tags: ["<tag>", "a & b"],
    });

    const xml = generateRSSFeed([photo], {
      title: "Test",
      url: "https://example.com",
    });

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(xml).not.toContain("<b>&</b>");
  });
});
