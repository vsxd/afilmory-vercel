import type { PhotoManifestItem } from "@afilmory/schema";
import { assertManifest, createManifest } from "@afilmory/schema";
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
  it("handles numeric camera and lens metadata accepted by manifest validation", () => {
    const manifest = assertManifest(
      createManifest({
        photos: [makePhoto({ exif: { Model: 123, LensModel: 456 } as never })],
      }),
    );
    const xml = generateRSSFeed(manifest.photos, {
      title: "Test",
      url: "https://example.com",
    });
    const doc = new DOMParser().parseFromString(xml, "application/xml");

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("item description")?.textContent).toContain(
      "123 · 456",
    );
  });

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
        FNumber: "]]><script>alert('aperture')</script>",
        ExposureTime: "]]><img src=x onerror=alert('shutter')>",
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
    expect(doc.querySelector("description")?.textContent).not.toContain(
      "<script>",
    );
    expect(doc.querySelector("description")?.textContent).not.toContain(
      "<img ",
    );
  });

  it("escapes a hostile photo title and tags", () => {
    const photo = makePhoto({
      title: 'Sunset\u0001 <b>&</b> "quotes"',
      tags: ["<tag>", "a & b"],
    });

    const xml = generateRSSFeed([photo], {
      title: "Test",
      url: "https://example.com",
    });

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(xml).not.toContain("<b>&</b>");
    expect(xml).not.toContain("\u0001");
  });

  it("uses the configured language and deterministic build timestamp", () => {
    const xml = generateRSSFeed(
      [makePhoto({})],
      {
        title: "Test",
        url: "https://example.com",
        language: "zh-CN",
      },
      "2025-02-03T04:05:06.000Z",
    );

    expect(xml).toContain("<language>zh-CN</language>");
    expect(xml).toContain(
      `<lastBuildDate>${new Date("2025-02-03T04:05:06.000Z").toUTCString()}</lastBuildDate>`,
    );
    expect(xml).toContain("<link>https://example.com/photos/photo-1/</link>");
  });

  it("escapes author metadata that contains XML-reserved URL characters", () => {
    const xml = generateRSSFeed([makePhoto({})], {
      title: "Test",
      url: "https://example.com",
      author: {
        name: "A & B",
        url: "https://example.com/about?x=1&y=2",
      },
    });

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("managingEditor")?.textContent).toBe(
      "A & B (https://example.com/about?x=1&y=2)",
    );
  });

  it("validates the site URL and only emits safe HTTP thumbnail enclosures", () => {
    expect(() =>
      generateRSSFeed([makePhoto({})], {
        title: "Test",
        url: "javascript:alert(1)",
      }),
    ).toThrow("Site URL must");

    const xml = generateRSSFeed(
      [
        makePhoto({
          id: "webp",
          thumbnailUrl: "/thumbnails/photo.webp?version=1",
        }),
        makePhoto({
          id: "unsafe",
          thumbnailUrl: "data:image/png;base64,AAAA",
        }),
      ],
      { title: "Test", url: "https://example.com" },
    );
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const enclosures = [...doc.querySelectorAll("enclosure")];

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(enclosures).toHaveLength(1);
    expect(enclosures[0]?.getAttribute("type")).toBe("image/webp");
    expect(enclosures[0]?.getAttribute("url")).toBe(
      "https://example.com/thumbnails/photo.webp?version=1",
    );
  });
});
