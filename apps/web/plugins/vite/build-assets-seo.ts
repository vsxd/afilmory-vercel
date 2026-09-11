import type { PhotoManifestItem } from "@afilmory/schema";

import type { SiteConfig } from "../../../../site.config";
import { serializeJsonForHtml } from "./__internal__/html-inline-json";

export interface HomeMetadata {
  description: string;
  imageUrl: string;
  siteName: string;
  siteUrl: string;
  title: string;
}

const SEO_ATTRIBUTE = 'data-afilmory-seo="generated"';
const THUMBNAIL_MAX_WIDTH = 600;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

export function normalizeBaseUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch (error) {
    throw new Error(`Site URL must be an absolute http(s) URL: ${url}`, {
      cause: error,
    });
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.href.includes("?") ||
    parsed.href.includes("#")
  ) {
    throw new Error(
      "Site URL must use http(s) without credentials, query parameters, or a fragment",
    );
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.href.replace(/\/$/, "");
}

function siteRootUrl(url: string): string {
  return `${normalizeBaseUrl(url)}/`;
}

export function absoluteHttpUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, siteRootUrl(baseUrl));
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function validIsoDate(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

function dateTimestamp(...values: Array<string | null | undefined>): number {
  const date = validIsoDate(...values);
  return date ? Date.parse(date) : Number.NEGATIVE_INFINITY;
}

export function sortPhotosNewestFirst(
  photos: readonly PhotoManifestItem[],
): PhotoManifestItem[] {
  return [...photos].sort((a, b) => {
    const aDate = dateTimestamp(a.dateTaken, a.lastModified);
    const bDate = dateTimestamp(b.dateTaken, b.lastModified);
    if (aDate !== bDate) return bDate > aDate ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function stripManagedMetadata(html: string): string {
  return html
    .replaceAll(/<title(?:\s[^>]*)?>[\s\S]*?<\/title\s*>/gi, "")
    .replaceAll(
      /<meta\s(?=[^>]*(?:name|property)\s*=\s*["'](?:description|author|robots|theme-color|msapplication-TileColor|og:[^"']+|twitter:[^"']+)["'])[^>]+>\s*/gi,
      "",
    )
    .replaceAll(/<link\s(?=[^>]*rel\s*=\s*["']canonical["'])[^>]+>\s*/gi, "")
    .replaceAll(
      /<link\s(?=[^>]*rel\s*=\s*["']preload["'])(?=[^>]*data-afilmory-photo-image)[^>]+>\s*/gi,
      "",
    )
    .replaceAll(
      /<script\s(?=[^>]*type\s*=\s*["']application\/ld\+json["'])(?=[^>]*data-afilmory-seo)[^>]+>[\s\S]*?<\/script\s*>\s*/gi,
      "",
    );
}

function insertBeforeClosingHead(html: string, metadata: string): string {
  if (!/<\/head\s*>/i.test(html)) {
    throw new Error("Cannot inject SEO metadata: HTML has no closing head tag");
  }
  // Metadata is literal content, including JavaScript replacement tokens such
  // as $& and $`. A replacement callback prevents a title from expanding them
  // into fragments of the surrounding document after HTML escaping.
  return html.replaceAll(/<\/head\s*>/gi, () => `${metadata}\n</head>`);
}

export function injectHomeMetadata(
  html: string,
  metadata: HomeMetadata,
): string {
  const baseUrl = normalizeBaseUrl(metadata.siteUrl);
  const imageUrl = absoluteHttpUrl(metadata.imageUrl, baseUrl);
  if (!imageUrl) {
    throw new Error("Home metadata image URL must use http(s)");
  }

  const safeUrl = escapeHtml(siteRootUrl(baseUrl));
  const safeTitle = escapeHtml(metadata.title);
  const safeDescription = escapeHtml(metadata.description);
  const safeSiteName = escapeHtml(metadata.siteName);
  const safeImageUrl = escapeHtml(imageUrl);

  const tags = `
    <title ${SEO_ATTRIBUTE}>${safeTitle}</title>
    <meta ${SEO_ATTRIBUTE} name="description" content="${safeDescription}" />
    <link ${SEO_ATTRIBUTE} rel="canonical" href="${safeUrl}" />
    <meta ${SEO_ATTRIBUTE} property="og:type" content="website" />
    <meta ${SEO_ATTRIBUTE} property="og:url" content="${safeUrl}" />
    <meta ${SEO_ATTRIBUTE} property="og:title" content="${safeTitle}" />
    <meta ${SEO_ATTRIBUTE} property="og:description" content="${safeDescription}" />
    <meta ${SEO_ATTRIBUTE} property="og:image" content="${safeImageUrl}" />
    <meta ${SEO_ATTRIBUTE} property="og:image:type" content="image/png" />
    <meta ${SEO_ATTRIBUTE} property="og:site_name" content="${safeSiteName}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:card" content="summary_large_image" />
    <meta ${SEO_ATTRIBUTE} name="twitter:url" content="${safeUrl}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:title" content="${safeTitle}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:description" content="${safeDescription}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:image" content="${safeImageUrl}" />
    <meta ${SEO_ATTRIBUTE} name="author" content="${safeSiteName}" />
    <meta ${SEO_ATTRIBUTE} name="robots" content="index, follow" />
    <meta ${SEO_ATTRIBUTE} name="theme-color" content="#0a0a0a" />
    <meta ${SEO_ATTRIBUTE} name="msapplication-TileColor" content="#0a0a0a" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="shortcut icon" href="/favicon.ico" />`;

  // The web-app manifest is injected by vite-plugin-pwa. Deliberately do not
  // add another link here; older builds emitted two identical manifest links.
  return insertBeforeClosingHead(stripManagedMetadata(html), tags);
}

function photoDisplayName(photo: PhotoManifestItem): string {
  return photo.title.trim() || photo.id;
}

function photoPageTitle(photo: PhotoManifestItem, config: SiteConfig): string {
  const displayName = photoDisplayName(photo);
  const uniqueName =
    displayName === photo.id ? displayName : `${displayName} (${photo.id})`;
  return `${uniqueName} — ${config.title}`;
}

function photoPageDescription(
  photo: PhotoManifestItem,
  config: SiteConfig,
): string {
  const summary =
    photo.description.trim() ||
    (photo.tags.length > 0
      ? `Photograph tagged ${photo.tags.join(", ")}.`
      : `A photograph from ${config.title}.`);
  return `${summary} Photo ID: ${photo.id}.`;
}

export function createPhotoPageHtml(
  baseHtml: string,
  photo: PhotoManifestItem,
  config: SiteConfig,
): string {
  const baseUrl = normalizeBaseUrl(config.url);
  const canonicalUrl = `${baseUrl}/photos/${encodeURIComponent(photo.id)}/`;
  const thumbnailUrl =
    absoluteHttpUrl(photo.thumbnailUrl, baseUrl) ?? canonicalUrl;
  const originalUrl =
    absoluteHttpUrl(photo.originalUrl, baseUrl) ?? canonicalUrl;
  const title = photoPageTitle(photo, config);
  const description = photoPageDescription(photo, config);
  const alt = photoDisplayName(photo);
  const dateCreated = validIsoDate(photo.dateTaken);
  const uploadDate = validIsoDate(photo.lastModified, photo.dateTaken);
  const authorUrl = absoluteHttpUrl(config.author.url, baseUrl);
  const thumbnailWidth = Math.min(THUMBNAIL_MAX_WIDTH, photo.width);
  const thumbnailHeight = Math.max(
    1,
    Math.round(thumbnailWidth / photo.aspectRatio),
  );

  const imageObject: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    representativeOfPage: true,
    name: title,
    caption: description,
    description,
    url: canonicalUrl,
    contentUrl: originalUrl,
    thumbnailUrl,
    width: photo.width,
    height: photo.height,
  };
  if (dateCreated) imageObject.dateCreated = dateCreated;
  if (uploadDate) imageObject.uploadDate = uploadDate;
  if (photo.tags.length > 0) imageObject.keywords = photo.tags.join(", ");
  if (config.author.name.trim()) {
    imageObject.creator = {
      "@type": "Person",
      name: config.author.name,
      ...(authorUrl ? { url: authorUrl } : {}),
    };
  }

  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonicalUrl = escapeHtml(canonicalUrl);
  const safeThumbnailUrl = escapeHtml(thumbnailUrl);
  const safeOriginalUrl = escapeHtml(originalUrl);
  const safeSiteName = escapeHtml(config.name);
  const safeAlt = escapeHtml(alt);
  const tags = `
    <title ${SEO_ATTRIBUTE}>${safeTitle}</title>
    <meta ${SEO_ATTRIBUTE} name="description" content="${safeDescription}" />
    <link ${SEO_ATTRIBUTE} rel="canonical" href="${safeCanonicalUrl}" />
    <link rel="preload" as="image" href="${safeThumbnailUrl}" data-afilmory-photo-image />
    <meta ${SEO_ATTRIBUTE} property="og:type" content="article" />
    <meta ${SEO_ATTRIBUTE} property="og:url" content="${safeCanonicalUrl}" />
    <meta ${SEO_ATTRIBUTE} property="og:title" content="${safeTitle}" />
    <meta ${SEO_ATTRIBUTE} property="og:description" content="${safeDescription}" />
    <meta ${SEO_ATTRIBUTE} property="og:image" content="${safeThumbnailUrl}" />
    <meta ${SEO_ATTRIBUTE} property="og:image:secure_url" content="${safeThumbnailUrl}" />
    <meta ${SEO_ATTRIBUTE} property="og:image:type" content="image/jpeg" />
    <meta ${SEO_ATTRIBUTE} property="og:image:width" content="${thumbnailWidth}" />
    <meta ${SEO_ATTRIBUTE} property="og:image:height" content="${thumbnailHeight}" />
    <meta ${SEO_ATTRIBUTE} property="og:image:alt" content="${safeAlt}" />
    <meta ${SEO_ATTRIBUTE} property="og:site_name" content="${safeSiteName}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:card" content="summary_large_image" />
    <meta ${SEO_ATTRIBUTE} name="twitter:url" content="${safeCanonicalUrl}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:title" content="${safeTitle}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:description" content="${safeDescription}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:image" content="${safeThumbnailUrl}" />
    <meta ${SEO_ATTRIBUTE} name="twitter:image:alt" content="${safeAlt}" />
    <meta ${SEO_ATTRIBUTE} name="robots" content="index, follow, max-image-preview:large" />
    <script type="application/ld+json" data-afilmory-seo="photo">${serializeJsonForHtml(imageObject)}</script>`;

  const noScript = `<noscript data-afilmory-photo-shell>
      <style>#splash-screen{display:none!important}</style>
      <main>
        <article>
          <h1>${safeTitle}</h1>
          <p>${safeDescription}</p>
          <a href="${safeOriginalUrl}">
            <img src="${safeThumbnailUrl}" alt="${safeAlt}" width="${thumbnailWidth}" height="${thumbnailHeight}" style="max-width:100%;height:auto" />
          </a>
        </article>
      </main>
    </noscript>`;

  const withMetadata = insertBeforeClosingHead(
    stripManagedMetadata(baseHtml),
    tags,
  );
  if (!/<div\s[^>]*id=["']root["'][^>]*>/i.test(withMetadata)) {
    throw new Error("Cannot inject photo shell: HTML has no root element");
  }
  return withMetadata.replaceAll(
    /(<div\s[^>]*id=["']root["'][^>]*>)/gi,
    (rootElement) => `${noScript}\n${rootElement}`,
  );
}

export function generateSitemap(
  photos: readonly PhotoManifestItem[],
  config: SiteConfig,
  generatedAt?: string,
): string {
  const baseUrl = normalizeBaseUrl(config.url);
  let mainLastModifiedTimestamp = dateTimestamp(generatedAt);
  for (const photo of photos) {
    mainLastModifiedTimestamp = Math.max(
      mainLastModifiedTimestamp,
      dateTimestamp(photo.lastModified, photo.dateTaken),
    );
  }
  const mainLastModified = Number.isFinite(mainLastModifiedTimestamp)
    ? new Date(mainLastModifiedTimestamp).toISOString()
    : null;

  const mainPageXml = `  <url>
    <loc>${escapeXml(siteRootUrl(baseUrl))}</loc>${mainLastModified ? `\n    <lastmod>${mainLastModified}</lastmod>` : ""}
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

  const photoUrls = photos
    .map((photo) => {
      const lastModified = validIsoDate(photo.lastModified, photo.dateTaken);
      const photoUrl = `${baseUrl}/photos/${encodeURIComponent(photo.id)}/`;
      return `  <url>
    <loc>${escapeXml(photoUrl)}</loc>${lastModified ? `\n    <lastmod>${lastModified}</lastmod>` : ""}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${mainPageXml}${photoUrls ? `\n${photoUrls}` : ""}
</urlset>`;
}
