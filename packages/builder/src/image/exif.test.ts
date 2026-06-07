import type { Tags } from "exiftool-vendored";
import { describe, expect, it } from "vitest";

import {
  extractFujiRecipe,
  extractSonyRecipe,
  handleExifData,
} from "./exif.js";

describe("EXIF normalization helpers", () => {
  it("extracts typed Fuji and Sony recipe fields", () => {
    const tags = {
      ColorChromeFXBlue: "Weak",
      CreativeStyle: "VV",
      DevelopmentDynamicRange: 400,
      DynamicRangeSetting: "Manual",
      FilmMode: "Classic Chrome",
      GrainEffectRoughness: "Strong",
      Hdr: "Auto",
      PictureEffect: "Off",
      SoftSkinEffect: "Off",
      WhiteBalance: 5200,
    } as Tags;

    expect(extractFujiRecipe(tags)).toMatchObject({
      ColorChromeFxBlue: "Weak",
      DevelopmentDynamicRange: 400,
      DynamicRangeSetting: "Manual",
      FilmMode: "Classic Chrome",
      GrainEffectRoughness: "Strong",
      WhiteBalance: "5200",
    });
    expect(extractSonyRecipe(tags)).toEqual({
      CreativeStyle: "VV",
      Hdr: "Auto",
      PictureEffect: "Off",
      SoftSkinEffect: "Off",
    });
  });

  it("keeps only picked manifest fields and normalized recipe data", () => {
    const tags = {
      DateTimeOriginal: "2026-06-06T00:00:00.000Z",
      ExifImageHeight: 200,
      ExifImageWidth: 300,
      FilmMode: "Classic Negative",
      Make: "FUJIFILM",
      Model: "X-T5",
      NonManifestField: "drop-me",
      WhiteBalance: "Auto",
    } as Tags & { NonManifestField: string };

    const normalized = handleExifData(tags);

    expect(normalized).toMatchObject({
      DateTimeOriginal: "2026-06-06T00:00:00.000Z",
      FujiRecipe: {
        FilmMode: "Classic Negative",
        WhiteBalance: "Auto",
      },
      ImageHeight: 200,
      ImageWidth: 300,
      Make: "FUJIFILM",
      Model: "X-T5",
    });
    expect("NonManifestField" in normalized).toBe(false);
  });
});
