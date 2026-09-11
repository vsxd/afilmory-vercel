import path from "node:path";

import type { PhotoManifestItem } from "@afilmory/schema";

import { absoluteHttpUrl, normalizeBaseUrl } from "./build-assets-seo";
import { MIME_TYPES } from "./photos-static";

const GENERATOR_NAME = "Afilmory Feed Generator";
const EXIF_NAMESPACE = "https://afilmory.com/rss/exif";
const PROTOCOL_VERSION = "1.1";
const PROTOCOL_ID = "afilmory-rss-exif";

export interface FeedSiteAuthor {
  name: string;
  url?: string | null;
  avatar?: string | null;
}

export interface FeedSiteConfig {
  title: string;
  description?: string | null;
  url: string;
  author?: FeedSiteAuthor;
  language?: string | null;
}

export function generateRSSFeed(
  photos: readonly PhotoManifestItem[],
  config: FeedSiteConfig,
  generatedAt?: string,
): string {
  const baseUrl = normalizeBaseUrl(config.url);
  const sortedPhotos = [...photos].sort(
    (a, b) => resolveDate(b) - resolveDate(a),
  );
  const lastBuildDate = resolveBuildDate(
    sortedPhotos,
    generatedAt,
  ).toUTCString();
  const channelDescription = escapeXml(
    config.description ?? config.title ?? "Photo feed",
  );
  const channelLanguage = escapeXml(config.language ?? "en");

  const itemsXml = sortedPhotos
    .map((photo) => createItemXml(photo, baseUrl))
    .join("\n");

  const author = config.author?.name ?? null;
  const managingEditor =
    author && config.author?.url ? `${author} (${config.author.url})` : author;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:exif="${EXIF_NAMESPACE}">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${channelDescription}</description>
    <language>${channelLanguage}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>${GENERATOR_NAME}</generator>
    ${managingEditor ? `<managingEditor>${escapeXml(managingEditor)}</managingEditor>` : ""}
    <exif:version>${PROTOCOL_VERSION}</exif:version>
    <exif:protocol>${PROTOCOL_ID}</exif:protocol>
${itemsXml}
  </channel>
</rss>`;
}

function createItemXml(photo: PhotoManifestItem, baseUrl: string): string {
  const link = `${baseUrl}/photos/${encodeURIComponent(photo.id)}/`;
  const pubDate = new Date(resolveDate(photo)).toUTCString();
  const title = escapeXml(photo.title.trim() || photo.id);
  const summary = buildDescription(photo);
  const categories =
    Array.isArray(photo.tags) && photo.tags.length > 0
      ? photo.tags
          .map((tag) => `      <category>${escapeXml(tag)}</category>`)
          .join("\n")
      : "";

  let enclosure = "";
  const thumbUrl = absoluteHttpUrl(photo.thumbnailUrl, baseUrl);
  if (thumbUrl) {
    const mimeType = inferImageMimeType(thumbUrl);
    enclosure = `      <enclosure url="${escapeXml(thumbUrl)}" type="${mimeType}" length="0" />`;
  }

  const exifTags = buildExifTags(photo);

  return `    <item>
      <title>${title}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(photo.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${cdata(summary)}</description>
${categories}
${enclosure}
${exifTags}
    </item>`;
}

function buildExifTags(photo: PhotoManifestItem): string {
  if (!photo.exif) return "";

  const tags: string[] = [];
  const { exif } = photo;

  // --- Basic Camera Settings ---
  if (exif.FNumber) {
    tags.push(
      `<exif:aperture>f/${escapeXmlValue(exif.FNumber)}</exif:aperture>`,
    );
  }
  if (exif.ExposureTime) {
    // Format shutter speed: if < 1, use fraction, else use seconds
    let ss = String(exif.ExposureTime);
    if (typeof exif.ExposureTime === "number") {
      if (exif.ExposureTime < 1 && exif.ExposureTime > 0) {
        ss = `1/${Math.round(1 / exif.ExposureTime)}s`;
      } else {
        ss = `${exif.ExposureTime}s`;
      }
    } else if (
      !ss.endsWith("s") && // If it's a string and doesn't end with s, append it?
      // Actually exiftool usually gives nice strings or numbers.
      // Let's just trust the value but ensure 's' suffix if it looks like a number
      !Number.isNaN(Number(ss))
    ) {
      ss = `${ss}s`;
    }
    tags.push(`<exif:shutterSpeed>${escapeXml(ss)}</exif:shutterSpeed>`);
  }
  if (exif.ISO) {
    tags.push(`<exif:iso>${escapeXmlValue(exif.ISO)}</exif:iso>`);
  }
  if (
    exif.ExposureCompensation !== undefined &&
    exif.ExposureCompensation !== null
  ) {
    const val = Number(exif.ExposureCompensation);
    const sign = val > 0 ? "+" : "";
    tags.push(
      `<exif:exposureCompensation>${sign}${val} EV</exif:exposureCompensation>`,
    );
  }

  // --- Lens Parameters ---
  if (exif.FocalLength) {
    // Ensure 'mm' suffix
    const fl = String(exif.FocalLength).replace("mm", "").trim();
    tags.push(`<exif:focalLength>${escapeXml(fl)}mm</exif:focalLength>`);
  }
  if (exif.FocalLengthIn35mmFormat) {
    const fl35 = String(exif.FocalLengthIn35mmFormat).replace("mm", "").trim();
    tags.push(
      `<exif:focalLength35mm>${escapeXml(fl35)}mm</exif:focalLength35mm>`,
    );
  }
  if (exif.LensModel) {
    tags.push(`<exif:lens>${cdata(String(exif.LensModel))}</exif:lens>`);
  }
  if (exif.MaxApertureValue) {
    tags.push(
      `<exif:maxAperture>f/${escapeXmlValue(exif.MaxApertureValue)}</exif:maxAperture>`,
    );
  }

  // --- Device Info ---
  const camera = [exif.Make, exif.Model].filter(Boolean).join(" ");
  if (camera) {
    tags.push(`<exif:camera>${cdata(camera)}</exif:camera>`);
  }

  // --- Image Attributes ---
  if (photo.width) {
    tags.push(`<exif:imageWidth>${photo.width}</exif:imageWidth>`);
  }
  if (photo.height) {
    tags.push(`<exif:imageHeight>${photo.height}</exif:imageHeight>`);
  }
  if (photo.dateTaken) {
    tags.push(
      `<exif:dateTaken>${escapeXmlValue(photo.dateTaken)}</exif:dateTaken>`,
    );
  }
  if (exif.Orientation) {
    tags.push(
      `<exif:orientation>${escapeXmlValue(exif.Orientation)}</exif:orientation>`,
    );
  }

  // --- Location Info ---
  // Location info removed as per user request

  // Location name is not directly in standard exif usually, but if we had it in photo info...
  // Currently PhotoManifestItem doesn't seem to have a dedicated location name field other than maybe tags or description.
  // We'll skip <exif:location> for now unless we find a source.

  // --- Technical Parameters ---
  if (exif.WhiteBalance) {
    tags.push(
      `<exif:whiteBalance>${escapeXmlValue(exif.WhiteBalance)}</exif:whiteBalance>`,
    );
  }
  if (exif.MeteringMode) {
    tags.push(
      `<exif:meteringMode>${escapeXmlValue(exif.MeteringMode)}</exif:meteringMode>`,
    );
  }
  // Flash is often a complex object or string in exiftool, simplify if possible or just dump string
  if (exif.Flash) {
    // Try to map to simple enum if possible, or just use what we have if it's readable
    tags.push(`<exif:flashMode>${escapeXmlValue(exif.Flash)}</exif:flashMode>`);
  }
  if (exif.ColorSpace) {
    tags.push(
      `<exif:colorSpace>${escapeXmlValue(exif.ColorSpace)}</exif:colorSpace>`,
    );
  }

  // --- Advanced Parameters ---
  if (exif.ExposureProgram) {
    tags.push(
      `<exif:exposureProgram>${escapeXmlValue(exif.ExposureProgram)}</exif:exposureProgram>`,
    );
  }
  if (exif.SceneCaptureType) {
    tags.push(
      `<exif:sceneMode>${cdata(String(exif.SceneCaptureType))}</exif:sceneMode>`,
    );
  }

  // Try to extract from FujiRecipe if available
  if (exif.FujiRecipe) {
    if (exif.FujiRecipe.Sharpness) {
      tags.push(
        `<exif:sharpness>${escapeXmlValue(exif.FujiRecipe.Sharpness)}</exif:sharpness>`,
      );
    }
    if (exif.FujiRecipe.Saturation) {
      tags.push(
        `<exif:saturation>${escapeXmlValue(exif.FujiRecipe.Saturation)}</exif:saturation>`,
      );
    }
    // Contrast is often "HighlightTone" and "ShadowTone" combined in Fuji,
    // or maybe just map one of them? The spec asks for Contrast.
    // Let's skip Contrast for FujiRecipe to avoid confusion unless we have a direct mapping.
  }

  return tags.map((t) => `      ${t}`).join("\n");
}

function buildDescription(photo: PhotoManifestItem): string {
  const segments: string[] = [];
  if (photo.description) {
    segments.push(escapeHtmlBlock(photo.description));
  }
  if (Array.isArray(photo.tags) && photo.tags.length > 0) {
    segments.push(
      `<p><strong>Tags:</strong> ${photo.tags.map(escapeXml).join(", ")}</p>`,
    );
  }

  if (photo.exif) {
    const exifParts: string[] = [];
    if (photo.exif.Model) {
      exifParts.push(escapeXmlValue(photo.exif.Model));
    }
    if (photo.exif.LensModel) {
      exifParts.push(escapeXmlValue(photo.exif.LensModel));
    }
    if (photo.exif.FNumber) {
      exifParts.push(`f/${escapeXmlValue(photo.exif.FNumber)}`);
    }
    if (photo.exif.ExposureTime) {
      exifParts.push(`${escapeXmlValue(photo.exif.ExposureTime)}s`);
    }
    if (exifParts.length > 0) {
      segments.push(`<p><strong>EXIF:</strong> ${exifParts.join(" · ")}</p>`);
    }
  }

  return segments.join("\n") || escapeXml(photo.title.trim() || photo.id);
}

function escapeXml(value: string): string {
  return sanitizeXmlText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Wrap arbitrary text in a CDATA section, neutralizing any literal `]]>` so the
 * content cannot terminate the section early and inject markup. EXIF strings
 * (lens/camera model, scene type) are attacker-influenceable metadata, so they
 * must never be placed in CDATA verbatim.
 */
function cdata(value: string): string {
  return `<![CDATA[${sanitizeXmlText(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function sanitizeXmlText(value: string): string {
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x1_0000 && codePoint <= 0x10_ffff)
      );
    })
    .join("");
}

/** Escape a value of unknown type for use inside an XML element body. */
function escapeXmlValue(value: unknown): string {
  return escapeXml(String(value));
}

function escapeHtmlBlock(value: string): string {
  return `<p>${escapeXml(value)}</p>`;
}

function inferImageMimeType(url: string): string {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return MIME_TYPES[extension] ?? "image/jpeg";
}

function resolveDate(photo: PhotoManifestItem): number {
  for (const date of [photo.dateTaken, photo.lastModified]) {
    const timestamp = date ? Date.parse(date) : Number.NaN;
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function resolveBuildDate(
  photos: readonly PhotoManifestItem[],
  generatedAt?: string,
): Date {
  const generatedTimestamp = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (Number.isFinite(generatedTimestamp)) return new Date(generatedTimestamp);

  const latestPhotoTimestamp = photos.reduce(
    (latest, photo) => Math.max(latest, resolveDate(photo)),
    0,
  );
  return new Date(latestPhotoTimestamp);
}
