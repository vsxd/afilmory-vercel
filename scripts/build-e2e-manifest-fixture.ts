/**
 * Derives the committed e2e fixture manifest
 * (`apps/web/e2e/fixtures/photos-manifest.json`) from a real local
 * `generated/photos-manifest.json`.
 *
 * The Playwright specs assert on concrete entities — the `A7C010…` photo, the
 * `SONY ILCE-7C` camera, and GPS-tagged photos for the map — so CI needs a real,
 * schema-valid manifest rather than an empty one. Trimming a real manifest keeps
 * the data shape authentic while staying small enough to commit.
 *
 * Usage (with a real manifest present): pnpm exec tsx scripts/build-e2e-manifest-fixture.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { assertManifest } from "@afilmory/schema";

const MAX_PHOTOS = 18;
const REQUIRED_IDS = ["A7C01099"]; // searched for as "A7C010" in the command palette

const sourcePath = path.resolve(
  process.cwd(),
  "generated/photos-manifest.json",
);
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const allPhotos: any[] = source.photos ?? [];

const countryOf = (photo: any): string | undefined =>
  photo.location?.admin?.country ?? photo.location?.country;

const selected = new Map<string, any>();
const add = (photo: any | undefined) => {
  if (photo && !selected.has(photo.id) && selected.size < MAX_PHOTOS) {
    selected.set(photo.id, photo);
  }
};

// 1) Always include the explicitly searched-for photo(s).
for (const id of REQUIRED_IDS) add(allPhotos.find((p) => p.id === id));

// 2) Spread across distinct countries so the map renders "Found N countries".
const countriesSeen = new Set<string>();
for (const photo of allPhotos) {
  const country = countryOf(photo);
  if (photo.location && country && !countriesSeen.has(country)) {
    countriesSeen.add(country);
    add(photo);
  }
}

// 3) Make sure the SONY ILCE-7C camera filter has several matches.
for (const photo of allPhotos) {
  if (/ILCE-7C/i.test(photo.exif?.Model ?? "")) add(photo);
}

// 4) Top up with whatever remains.
for (const photo of allPhotos) add(photo);

const photos = [...selected.values()];

// Rebuild indexes from the selected photos, preserving the original display
// names so the camera/lens labels still match what the app expects.
const keptCameraModels = new Set(
  photos.map((p) => p.exif?.Model).filter(Boolean),
);
const keptLensModels = new Set(
  photos.map((p) => p.exif?.LensModel).filter(Boolean),
);
const cameras = (source.indexes?.cameras ?? []).filter((c: any) =>
  keptCameraModels.has(c.model),
);
const lenses = (source.indexes?.lenses ?? []).filter((l: any) =>
  keptLensModels.has(l.model),
);

const fixture = {
  schema: source.schema,
  version: source.version,
  generatedAt: "2026-01-01T00:00:00.000Z",
  source: source.source ?? { provider: "unknown" },
  photos,
  indexes: { cameras, lenses },
};

// Fail loudly if the trimmed result is not a valid manifest.
assertManifest(fixture);

const outDir = path.resolve(process.cwd(), "apps/web/e2e/fixtures");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "photos-manifest.json"),
  `${JSON.stringify(fixture, null, 2)}\n`,
);

// eslint-disable-next-line no-console
console.log(
  `e2e fixture: ${photos.length} photos, ${cameras.length} cameras, ${countriesSeen.size} countries, A7C010=${selected.has("A7C01099")}`,
);
