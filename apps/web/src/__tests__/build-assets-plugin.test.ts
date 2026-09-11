import type { PhotoManifestItem } from "@afilmory/schema";
import { describe, expect, it } from "vitest";

import type { SiteConfig } from "../../../../site.config";
import {
  createPhotoPageHtml,
  generateSitemap,
  injectHomeMetadata,
} from "../../plugins/vite/build-assets";

const siteConfig: SiteConfig = {
  name: "Lens & Light",
  title: "Lens & Light",
  description: "A test gallery",
  url: "https://example.com/gallery",
  accentColor: "#123456",
  author: {
    name: "A <Photographer>",
    url: "https://example.com/about",
  },
};

function createPhoto(
  overrides: Partial<PhotoManifestItem> = {},
): PhotoManifestItem {
  return {
    id: "photo-1",
    title: "Sunset",
    description: "A quiet evening",
    tags: ["sunset", "sea"],
    dateTaken: "2025-01-02T03:04:05.000Z",
    lastModified: "2025-01-03T03:04:05.000Z",
    originalUrl: "/photos/original-photo-1.jpg",
    thumbnailUrl: "/thumbnails/photo-1.jpg",
    thumbHash: null,
    width: 1200,
    height: 800,
    aspectRatio: 1.5,
    s3Key: "photo-1.jpg",
    size: 100,
    exif: null,
    toneAnalysis: null,
    location: null,
    ...overrides,
  };
}

describe("build asset SEO helpers", () => {
  it("preserves replacement tokens literally in home metadata", () => {
    const title = "Price $$; match $&; prefix $`; suffix $'; group $1";
    const result = injectHomeMetadata(
      '<html><head></head><body><div id="root"></div></body></html>',
      {
        title,
        description: title,
        siteName: siteConfig.name,
        siteUrl: siteConfig.url,
        imageUrl: "https://example.com/og.png",
      },
    );
    const document = new DOMParser().parseFromString(result, "text/html");

    expect(document.title).toBe(title);
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe(title);
    expect(document.querySelectorAll("#root")).toHaveLength(1);
  });

  it("preserves replacement tokens in photo metadata and the noscript shell", () => {
    const title = "Price $$; match $&; prefix $`; suffix $'; group $1";
    const result = createPhotoPageHtml(
      '<html><head></head><body><div id="root"></div></body></html>',
      createPhoto({ title, description: title }),
      siteConfig,
    );
    const document = new DOMParser().parseFromString(result, "text/html");
    const expectedTitle = `${title} (photo-1) — ${siteConfig.title}`;

    expect(document.title).toBe(expectedTitle);
    expect(document.querySelector("noscript h1")?.textContent).toBe(
      expectedTitle,
    );
    expect(document.querySelectorAll("#root")).toHaveLength(1);
    expect(
      JSON.parse(
        document.querySelector('script[type="application/ld+json"]')!
          .textContent!,
      ),
    ).toMatchObject({ name: expectedTitle });
  });

  it("replaces singleton home metadata without adding a second manifest", () => {
    const html = `<!doctype html><html><head>
      <title>Old title</title>
      <meta name="description" content="old">
      <link rel="canonical" href="https://old.example">
      <link rel="manifest" href="/manifest.webmanifest">
    </head><body><div id="root"></div></body></html>`;

    const result = injectHomeMetadata(html, {
      title: `A "Gallery" <Home>`,
      description: `Photos & "stories"`,
      siteName: "Lens & Light",
      siteUrl: "https://example.com/gallery/",
      imageUrl: "https://example.com/og.png?x=1&y=2",
    });

    expect(result.match(/<title\b/gi)).toHaveLength(1);
    expect(result.match(/name="description"/gi)).toHaveLength(1);
    expect(result.match(/rel="canonical"/gi)).toHaveLength(1);
    expect(result.match(/rel="manifest"/gi)).toHaveLength(1);
    expect(result).toContain("A &quot;Gallery&quot; &lt;Home&gt;");
    expect(result).toContain("Photos &amp; &quot;stories&quot;");
    expect(result).toContain('href="https://example.com/gallery/"');
    expect(result).not.toContain("https://old.example");
  });

  it("rejects unsafe site and metadata image URLs", () => {
    expect(() =>
      injectHomeMetadata("<html><head></head><body></body></html>", {
        title: "Gallery",
        description: "Photos",
        siteName: "Gallery",
        siteUrl: "javascript:alert(1)",
        imageUrl: "https://example.com/og.png",
      }),
    ).toThrow("Site URL must");

    expect(() =>
      injectHomeMetadata("<html><head></head><body></body></html>", {
        title: "Gallery",
        description: "Photos",
        siteName: "Gallery",
        siteUrl: "https://example.com",
        imageUrl: "data:image/png;base64,AAAA",
      }),
    ).toThrow("image URL must use http(s)");

    for (const siteUrl of [
      "https://example.com/gallery?",
      "https://example.com/gallery#",
    ]) {
      expect(() =>
        injectHomeMetadata("<html><head></head><body></body></html>", {
          title: "Gallery",
          description: "Photos",
          siteName: "Gallery",
          siteUrl,
          imageUrl: "https://example.com/og.png",
        }),
      ).toThrow("Site URL must");
    }
  });

  it("creates a crawlable photo shell with escaped HTML and JSON-LD", () => {
    const baseHtml = injectHomeMetadata(
      '<!doctype html><html><head><link rel="manifest" href="/manifest.webmanifest"></head><body><div id="splash-screen"></div><div id="root"></div></body></html>',
      {
        title: siteConfig.title,
        description: siteConfig.description,
        siteName: siteConfig.name,
        siteUrl: siteConfig.url,
        imageUrl: "https://example.com/gallery/og.png",
      },
    );
    const photo = createPhoto({
      title: 'Sunset </title><script src="https://evil.test/x.js">',
      description: "Closing tag: </script><script>alert(1)</script>",
      originalUrl: "javascript:alert(1)",
      thumbnailUrl: "/thumbnails/photo-1.jpg?x=1&y=2",
    });

    const result = createPhotoPageHtml(baseHtml, photo, siteConfig);
    const jsonMatch = result.match(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
    );

    expect(result.match(/<title\b/gi)).toHaveLength(1);
    expect(result.match(/name="description"/gi)).toHaveLength(1);
    expect(result.match(/rel="canonical"/gi)).toHaveLength(1);
    expect(result.match(/rel="manifest"/gi)).toHaveLength(1);
    expect(result).toContain(
      'href="https://example.com/gallery/photos/photo-1/"',
    );
    expect(result).toContain('property="og:image:type" content="image/jpeg"');
    expect(result).toContain('property="og:image:width" content="600"');
    expect(result).toContain('property="og:image:height" content="400"');
    expect(result).toContain("<noscript data-afilmory-photo-shell>");
    expect(result).toContain("&lt;/title&gt;&lt;script");
    expect(result).not.toContain('src="https://evil.test/x.js"');
    expect(result).not.toContain("javascript:alert(1)");
    expect(jsonMatch?.[1]).toBeTruthy();

    const imageObject = JSON.parse(jsonMatch?.[1] ?? "{}") as Record<
      string,
      unknown
    >;
    expect(imageObject["@type"]).toBe("ImageObject");
    expect(imageObject.contentUrl).toBe(
      "https://example.com/gallery/photos/photo-1/",
    );
    expect(imageObject.thumbnailUrl).toBe(
      "https://example.com/thumbnails/photo-1.jpg?x=1&y=2",
    );
    expect(imageObject.description).toContain("</script><script>");
  });

  it("generates deterministic, escaped sitemap dates and omits invalid ones", () => {
    const config = {
      ...siteConfig,
      url: "https://example.com/gallery&archive",
    };
    const photos = [
      createPhoto(),
      createPhoto({
        id: "invalid-date",
        dateTaken: "not-a-date",
        lastModified: "also-not-a-date",
      }),
    ];

    const first = generateSitemap(photos, config, "2026-02-03T04:05:06.000Z");
    const second = generateSitemap(photos, config, "2026-02-03T04:05:06.000Z");

    expect(first).toBe(second);
    expect(first).toContain("https://example.com/gallery&amp;archive/");
    expect(first).toContain("2025-01-03T03:04:05.000Z");
    expect(first).not.toContain("Invalid Date");
    const invalidEntry = first.match(
      /<url>\s*<loc>[^<]*invalid-date[^<]*<\/loc>([\s\S]*?)<\/url>/,
    );
    expect(invalidEntry?.[1]).not.toContain("<lastmod>");
  });
});
