/**
 * Generates the committed e2e fixture manifest
 * (`apps/web/e2e/fixtures/photos-manifest.json`) plus matching thumbnail
 * images (`apps/web/e2e/fixtures/thumbnails/`) from fully synthetic data.
 *
 * The Playwright specs assert on concrete entities — the `SYNTH00…` photos,
 * the `Lumina LX-7` camera, and GPS-tagged photos for the map — so CI needs a
 * deterministic, schema-valid manifest rather than an empty one. This fixture
 * used to be trimmed from the maintainer's real photo library, which leaked
 * personal GPS coordinates and filenames into the repo; everything here is
 * invented instead (fictional camera/lens brands, mid-ocean coordinates in
 * made-up countries with ISO user-assigned `X*` country codes) while keeping
 * the data shape authentic:
 *
 * - thumbHash values are REAL canonical vectors generated from the same
 *   deterministic gradients. They are committed here because thumbhash's
 *   floating-point DCT can round one coefficient differently across CPU
 *   architectures; manifest 格式仍与 builder 完全一致。
 * - the same rendered gradients are written out as fixture thumbnails so the
 *   prod-smoke build can serve them from dist/ without any route stubbing.
 * - coverage includes varied aspect ratios, a dateTaken spread, tags, HDR,
 *   a Live Photo video entry, and GPS across 4 fictional countries so the
 *   map/geo features have data to render.
 * - the Live Photo carries a real playable VP8/WebM clip (base64-embedded
 *   below), written alongside the thumbnails. Its videoUrl 用相对路径而非 CDN
 *   域：MasonryPhotoItem 在缩略图加载后会立即拉取 Live Photo 视频，dev 用
 *   route stub、prod-smoke 直接从 dist/ 伺服，都不产生 console error（.webm
 *   后缀同时绕开只认 .mov 的 MOV→MP4 转换路径）。
 *
 * Usage: pnpm fixture:e2e
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { PhotoManifestItem } from "@afilmory/schema";
import { assertManifest } from "@afilmory/schema";
import sharp from "sharp";

// ── synthetic entities ────────────────────────────────────────────────────────

const CDN = "https://photos.fixture.test";
const PREFIX = "fixtures/";
const PHOTO_COUNT = 18;
const THUMB_MAX = 256;

// Real ThumbHash reference vectors generated from the synthetic gradients.
// thumbhash's floating-point DCT can round one coefficient differently across
// CPU architectures, so fixture regeneration uses these committed canonical
// values instead of recomputing them during CI.
const THUMB_HASHES = [
  "605a0a159080878777888887878887878078f78878",
  "e0560535087878807888887888877788888f780878",
  "60b70224828087877377787888778073083887",
  "629a01270e80878788878888788888788878f888877f7808",
  "a3d5050d908787888088878787787888787f870888",
  "a399061d8680878782878878877887878082f7d878",
  "2238093c828087878878888788887f88f87787",
  "e0750a2e0c787808888878888887888878888780880778",
  "600a06058a80878772887788787777788f7df7d778",
  "2076012a8c808787778888887f87087888",
  "23c8023d828787887078878777778878888077f888",
  "a379011d0672778078887877777778887d7fd7f878",
  "6325060d9080878777888878878887777087088788",
  "626a0a250e7878808888887878877878788088f888",
  "a04705258480878772888777787777887f7d082788",
  "e0a606358670878788888888888887887078088877",
  "a0ba0115908787888087878788787887878f88f788",
  "a3a5010c0a7307777787877878878c8f380888",
] as const;

const CAMERAS = [
  { make: "Lumina", model: "LX-7" },
  { make: "Polaris", model: "P1" },
] as const;

const LENSES = [
  { make: "Lumina", model: "Vista 35mm F1.8" },
  { make: "Polaris", model: "Orbit 24-70mm F4" },
] as const;

// Mid-ocean coordinates (valid lat/lng, no real place) in fictional countries.
// `X*` 是 ISO 3166 用户自定义码段，永远不会指向真实国家。
const COUNTRIES = [
  {
    country: "Auroria",
    countryCode: "XA",
    region: "Northreach",
    city: "Port Meridian",
    latitude: 12.482,
    longitude: -33.217,
  },
  {
    country: "Borealund",
    countryCode: "XB",
    region: "Eastvale",
    city: "Solhavn",
    latitude: -21.351,
    longitude: 71.842,
  },
  {
    country: "Cindralia",
    countryCode: "XC",
    region: "Westmark",
    city: "Emberfall",
    latitude: 28.914,
    longitude: -161.338,
  },
  {
    country: "Drovania",
    countryCode: "XD",
    region: "Southgate",
    city: "Vantle",
    latitude: -47.629,
    longitude: 155.081,
  },
] as const;

const TAG_POOL = [
  "landscape",
  "portrait",
  "street",
  "night",
  "travel",
  "macro",
] as const;

const TONE_TYPES = ["normal", "high-contrast", "low-key", "high-key"] as const;

interface PhotoSpec {
  width: number;
  height: number;
  camera: 0 | 1;
  lens: 0 | 1;
  /** index into COUNTRIES, omitted → no GPS */
  country?: 0 | 1 | 2 | 3;
  isHDR?: boolean;
  livePhoto?: boolean;
}

// 18 photos: varied aspect ratios (3:2 / 2:3 / 16:9 / 1:1 / 4:3 / 4:5 / 3:1 pano),
// 6 GPS photos across 4 countries, one HDR, one Live Photo.
const PHOTO_SPECS: PhotoSpec[] = [
  { width: 6000, height: 4000, camera: 0, lens: 0, country: 0 },
  { width: 4000, height: 6000, camera: 0, lens: 0, country: 0 },
  { width: 5760, height: 3240, camera: 0, lens: 0 },
  { width: 4000, height: 4000, camera: 0, lens: 0 },
  { width: 4096, height: 3072, camera: 0, lens: 1, country: 1 },
  { width: 6000, height: 4000, camera: 0, lens: 1, country: 1 },
  { width: 3840, height: 2160, camera: 0, lens: 1, isHDR: true },
  { width: 4000, height: 5000, camera: 0, lens: 0 },
  { width: 6000, height: 4000, camera: 0, lens: 0, country: 2 },
  { width: 6144, height: 2048, camera: 0, lens: 1 },
  { width: 4032, height: 3024, camera: 1, lens: 1 },
  { width: 3024, height: 4032, camera: 1, lens: 1, livePhoto: true },
  { width: 6000, height: 4000, camera: 1, lens: 1, country: 3 },
  { width: 4000, height: 6000, camera: 1, lens: 0 },
  { width: 5472, height: 3648, camera: 1, lens: 1 },
  { width: 4000, height: 3000, camera: 1, lens: 0 },
  { width: 6000, height: 4000, camera: 1, lens: 1 },
  { width: 2160, height: 3840, camera: 1, lens: 1 },
];

if (PHOTO_SPECS.length !== PHOTO_COUNT || THUMB_HASHES.length !== PHOTO_COUNT) {
  throw new Error(
    `Expected ${PHOTO_COUNT} photo specs and ThumbHash vectors, received ${PHOTO_SPECS.length} and ${THUMB_HASHES.length}`,
  );
}

// 4 帧 64×64 的 VP8/WebM 微型视频（Playwright 自带 ffmpeg 生成，1877 字节），
// 作为 Live Photo 的可播放视频写进 fixtures/thumbnails/。
const LIVE_PHOTO_WEBM_BASE64 = [
  "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",
].join("");

// ── deterministic helpers ─────────────────────────────────────────────────────

const photoId = (index: number) => `SYNTH${String(index + 1).padStart(4, "0")}`;

const isoDate = (baseMs: number, index: number, stepMs: number) =>
  new Date(baseMs + index * stepMs).toISOString();

const DATE_TAKEN_BASE = Date.UTC(2024, 1, 14, 9, 30, 0);
const DATE_TAKEN_STEP = 47 * 24 * 60 * 60 * 1000 + 13 * 60 * 1000; // ~47 天错开
const LAST_MODIFIED_BASE = Date.UTC(2026, 0, 2, 0, 0, 0);
const LAST_MODIFIED_STEP = 60 * 60 * 1000;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}

/** 黄金角轮转取双色，保证 18 张渐变互不相同且完全确定。 */
function gradientColors(
  index: number,
): [[number, number, number], [number, number, number]] {
  const hue1 = (index * 137.508) % 360;
  const hue2 = (hue1 + 80) % 360;
  return [hslToRgb(hue1, 0.55, 0.45), hslToRgb(hue2, 0.6, 0.62)];
}

function renderGradientRgb(
  width: number,
  height: number,
  index: number,
): Buffer {
  const [from, to] = gradientColors(index);
  const data = Buffer.alloc(width * height * 3);
  const direction = index % 3; // 0 横向 / 1 纵向 / 2 对角
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t =
        direction === 0
          ? x / Math.max(1, width - 1)
          : direction === 1
            ? y / Math.max(1, height - 1)
            : (x + y) / Math.max(1, width + height - 2);
      const offset = (y * width + x) * 3;
      data[offset] = Math.round(from[0] + (to[0] - from[0]) * t);
      data[offset + 1] = Math.round(from[1] + (to[1] - from[1]) * t);
      data[offset + 2] = Math.round(from[2] + (to[2] - from[2]) * t);
    }
  }
  return data;
}

// ── build the manifest ────────────────────────────────────────────────────────

const outDir = path.resolve(process.cwd(), "apps/web/e2e/fixtures");
const thumbnailsDir = path.join(outDir, "thumbnails");
rmSync(thumbnailsDir, { recursive: true, force: true });
mkdirSync(thumbnailsDir, { recursive: true });

const photos: PhotoManifestItem[] = [];
for (const [index, spec] of PHOTO_SPECS.entries()) {
  const id = photoId(index);
  const camera = CAMERAS[spec.camera];
  const lens = LENSES[spec.lens];
  const scale = THUMB_MAX / Math.max(spec.width, spec.height);
  const thumbWidth = Math.max(1, Math.round(spec.width * scale));
  const thumbHeight = Math.max(1, Math.round(spec.height * scale));

  const thumbnailBuffer = await sharp(
    renderGradientRgb(thumbWidth, thumbHeight, index),
    { raw: { width: thumbWidth, height: thumbHeight, channels: 3 } },
  )
    .jpeg({ quality: 82 })
    .toBuffer();
  writeFileSync(path.join(thumbnailsDir, `${id}.jpg`), thumbnailBuffer);
  const thumbHash = THUMB_HASHES[index];

  const dateTaken = isoDate(DATE_TAKEN_BASE, index, DATE_TAKEN_STEP);
  const countrySpec =
    spec.country === undefined ? undefined : COUNTRIES[spec.country];
  // 同国多张时按序号微移坐标，避免完全重合的 marker。
  const latitude = countrySpec
    ? Number((countrySpec.latitude + index * 0.013).toFixed(6))
    : undefined;
  const longitude = countrySpec
    ? Number((countrySpec.longitude + index * 0.017).toFixed(6))
    : undefined;
  const admin = countrySpec
    ? {
        country: countrySpec.country,
        countryCode: countrySpec.countryCode,
        region: countrySpec.region,
        city: countrySpec.city,
      }
    : undefined;

  photos.push({
    id,
    originalUrl: `${CDN}/${PREFIX}${id}.jpg`,
    thumbnailUrl: `/thumbnails/${id}.jpg`,
    thumbHash,
    width: spec.width,
    height: spec.height,
    aspectRatio: spec.width / spec.height,
    s3Key: `${PREFIX}${id}.jpg`,
    lastModified: isoDate(LAST_MODIFIED_BASE, index, LAST_MODIFIED_STEP),
    size: 2_000_000 + index * 137_531,
    etag: `"synthetic-${id.toLowerCase()}"`,
    exif: {
      DateTimeOriginal: dateTaken,
      ImageWidth: spec.width,
      ImageHeight: spec.height,
      Make: camera.make,
      Model: camera.model,
      LensMake: lens.make,
      LensModel: lens.model,
      ISO: [100, 200, 400, 800, 1600, 3200][index % 6],
      FNumber: [1.8, 2.8, 4][index % 3],
      ExposureTime: ["1/250", "1/60", "1/1000", "1/125"][index % 4],
      FocalLength: spec.lens === 0 ? "35.0 mm" : "24.0 mm",
      ...(countrySpec
        ? {
            GPSLatitude: latitude,
            GPSLatitudeRef: latitude! >= 0 ? "N" : "S",
            GPSLongitude: longitude,
            GPSLongitudeRef: longitude! >= 0 ? "E" : "W",
          }
        : {}),
    },
    toneAnalysis: {
      toneType: TONE_TYPES[index % TONE_TYPES.length],
      brightness: 30 + ((index * 7) % 50),
      contrast: 40 + ((index * 11) % 45),
      shadowRatio: Number((0.1 + (index % 7) * 0.08).toFixed(2)),
      highlightRatio: Number((0.1 + (index % 5) * 0.09).toFixed(2)),
    },
    location:
      countrySpec && latitude !== undefined && longitude !== undefined
        ? {
            latitude,
            longitude,
            admin,
            adminI18n: { en: { ...admin } },
            country: countrySpec.country,
            city: countrySpec.city,
          }
        : null,
    title: id,
    dateTaken,
    tags: [
      TAG_POOL[index % TAG_POOL.length],
      ...(index % 2 === 0 ? [TAG_POOL[(index + 3) % TAG_POOL.length]] : []),
    ],
    description: "",
    ...(spec.isHDR ? { isHDR: true } : {}),
    ...(spec.livePhoto
      ? {
          video: {
            type: "live-photo" as const,
            // 相对路径（而非 CDN 域）：画廊会在缩略图加载后立即拉取该视频，
            // dev（route stub）与 prod-smoke（dist/ 直接伺服）都能就地供给。
            videoUrl: `/thumbnails/${id}.webm`,
            s3Key: `${PREFIX}${id}.webm`,
          },
        }
      : {}),
  });

  if (spec.livePhoto) {
    writeFileSync(
      path.join(thumbnailsDir, `${id}.webm`),
      Buffer.from(LIVE_PHOTO_WEBM_BASE64, "base64"),
    );
  }
}

const fixture = {
  schema: "afilmory.manifest",
  version: 2,
  generatedAt: "2026-01-01T00:00:00.000Z",
  source: {
    provider: "s3",
    bucket: "afilmory-synthetic-fixture",
    region: "us-east-1",
    prefix: PREFIX,
    customDomain: CDN,
  },
  photos,
  indexes: {
    cameras: CAMERAS.map((camera) => ({
      ...camera,
      displayName: `${camera.make} ${camera.model}`,
    })),
    lenses: LENSES.map((lens) => ({
      ...lens,
      displayName: `${lens.make} ${lens.model}`,
    })),
  },
};

// Fail loudly if the synthetic result is not a valid manifest or misses the
// coverage the specs rely on.
assertManifest(fixture);
const countries = new Set(
  photos.flatMap((photo) => photo.location?.admin?.country ?? []),
);
if (photos.length !== PHOTO_COUNT) throw new Error("expected 18 photos");
if (countries.size < 3) throw new Error("expected GPS across 3+ countries");
if (!photos.some((photo) => photo.isHDR)) throw new Error("expected HDR photo");
if (!photos.some((photo) => photo.video?.type === "live-photo")) {
  throw new Error("expected a Live Photo entry");
}

writeFileSync(
  path.join(outDir, "photos-manifest.json"),
  `${JSON.stringify(fixture, null, 2)}\n`,
);

// eslint-disable-next-line no-console
console.log(
  `synthetic e2e fixture: ${photos.length} photos, ${fixture.indexes.cameras.length} cameras, ` +
    `${countries.size} countries, HDR=${photos.some((p) => p.isHDR)}, ` +
    `livePhoto=${photos.some((p) => p.video?.type === "live-photo")}, thumbnails=${PHOTO_SPECS.length}`,
);
