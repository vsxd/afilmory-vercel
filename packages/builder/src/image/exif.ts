import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isNil, noop } from "es-toolkit";
import type { ExifDateTime, Tags } from "exiftool-vendored";
import { ExifTool } from "exiftool-vendored";

import { getPhotoProcessingLoggers } from "../photo/logger-adapter.js";
import type { FujiRecipe, PickedExif, SonyRecipe } from "../types/photo.js";

export interface ExifReaderService {
  read: (filePath: string) => Promise<Tags>;
  close: () => void;
}

export class ExifService implements ExifReaderService {
  private readonly exiftool: ExifTool;
  private closed = false;

  constructor(options: { exiftoolPath?: string } = {}) {
    this.exiftool = new ExifTool({
      ...(options.exiftoolPath ? { exiftoolPath: options.exiftoolPath } : {}),
      taskTimeoutMillis: 30000,
    });
  }

  async read(filePath: string): Promise<Tags> {
    if (this.closed) {
      throw new Error("ExifService has already been closed.");
    }
    return await this.exiftool.read(filePath);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.exiftool.end().catch(noop);
  }
}

// 提取 EXIF 数据
export async function extractExifData(
  exifService: ExifReaderService,
  imageBuffer: Buffer,
  originalBuffer?: Buffer,
): Promise<PickedExif | null> {
  const log = getPhotoProcessingLoggers().exif;

  // os.tmpdir() 而非硬编码 /tmp：Windows 没有 /tmp，macOS 沙箱下 /tmp 也可能不可写。
  // A private per-call directory prevents other local users from observing or
  // replacing source photos while ExifTool reads them. Explicit modes keep the
  // guarantee even under an unusually permissive process umask.
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "afilmory-exif-"));
  const tempImagePath = path.join(tempDir, `${crypto.randomUUID()}.jpg`);

  try {
    // Keep chmod inside the cleanup region: if a platform/filesystem rejects
    // the permission change, the freshly-created private directory must not
    // be leaked in the system temp area.
    await chmod(tempDir, 0o700);
    await writeFile(tempImagePath, originalBuffer || imageBuffer, {
      mode: 0o600,
    });

    log.info(`Extracting EXIF data, file path: ${tempImagePath}`);
    const exifData = await exifService.read(tempImagePath);

    if (!exifData) {
      throw new Error("ExifTool returned no result");
    }

    const result = handleExifData(exifData);

    // 清理 EXIF 数据中的空字符和无用数据

    delete exifData.warnings;
    delete exifData.errors;

    log.success("EXIF data extraction complete");
    return result;
  } catch (error) {
    log.error("Failed to extract EXIF data:", error);
    // An empty Tags object is a successful photo without EXIF. A failed read
    // is different: let the photo failure path retain the previous item and
    // retry, rather than publishing null with a successful stage fingerprint.
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(noop);
  }
}

const pickKeys: Array<keyof Tags | (string & {})> = [
  "tz",
  "tzSource",
  "Orientation",
  "Make",
  "Model",
  "Software",
  "Artist",
  "Copyright",
  "ExposureTime",

  "FNumber",
  "ExposureProgram",
  "ISO",
  "OffsetTime",
  "OffsetTimeOriginal",
  "OffsetTimeDigitized",
  "ShutterSpeedValue",
  "ApertureValue",
  "BrightnessValue",
  "ExposureCompensationSet",
  "ExposureCompensationMode",
  "ExposureCompensationSetting",

  "ExposureCompensation",
  "MaxApertureValue",
  "LightSource",
  "Flash",
  "FocalLength",

  "ColorSpace",
  "ExposureMode",
  "FocalLengthIn35mmFormat",
  "SceneCaptureType",
  "LensMake",
  "LensModel",
  "MeteringMode",
  "WhiteBalance",
  "WBShiftAB",
  "WBShiftGM",
  "WhiteBalanceBias",

  "FlashMeteringMode",
  "SensingMethod",
  "FocalPlaneXResolution",
  "FocalPlaneYResolution",

  "Aperture",
  "ScaleFactor35efl",
  "ShutterSpeed",
  "LightValue",
  // GPS
  "GPSAltitude",
  "GPSCoordinates",
  "GPSAltitudeRef",
  "GPSLatitude",
  "GPSLatitudeRef",
  "GPSLongitude",
  "GPSLongitudeRef",
  // HDR相关字段
  "MPImageType",
  "UniformResourceName",
  // Motion Photo 相关字段
  "MotionPhoto",
  "MotionPhotoVersion",
  "MotionPhotoPresentationTimestampUs",
  "ContainerDirectory",
  "MicroVideo",
  "MicroVideoVersion",
  "MicroVideoOffset",
  "MicroVideoPresentationTimestampUs",
];
export function extractFujiRecipe(exifData: Tags): FujiRecipe | undefined {
  if (!exifData.FilmMode) {
    return undefined;
  }

  return {
    FilmMode: exifData.FilmMode,
    GrainEffectRoughness: exifData.GrainEffectRoughness,
    GrainEffectSize: exifData.GrainEffectSize,
    ColorChromeEffect: exifData.ColorChromeEffect,
    ColorChromeFxBlue: exifData.ColorChromeFXBlue,
    WhiteBalance:
      exifData.WhiteBalance === undefined
        ? undefined
        : String(exifData.WhiteBalance),

    DynamicRange: exifData.DynamicRange,
    HighlightTone: exifData.HighlightTone,
    ShadowTone: exifData.ShadowTone,
    Saturation: exifData.Saturation,
    NoiseReduction: exifData.NoiseReduction,
    Clarity: exifData.Clarity,
    ColorTemperature: exifData.ColorTemperature,
    DevelopmentDynamicRange: exifData.DevelopmentDynamicRange,
    DynamicRangeSetting: exifData.DynamicRangeSetting,
  };
}

export function extractSonyRecipe(exifData: Tags): SonyRecipe | undefined {
  if (isNil(exifData.CreativeStyle)) {
    return undefined;
  }

  return {
    CreativeStyle: exifData.CreativeStyle,
    PictureEffect: exifData.PictureEffect,
    Hdr: exifData.Hdr,
    SoftSkinEffect: exifData.SoftSkinEffect,
  };
}

export function handleExifData(exifData: Tags): PickedExif {
  const date = {
    DateTimeOriginal: formatExifDate(exifData.DateTimeOriginal),
    DateTimeDigitized: formatExifDate(exifData.DateTimeDigitized),
    OffsetTime: exifData.OffsetTime,
    OffsetTimeOriginal: exifData.OffsetTimeOriginal,
    OffsetTimeDigitized: exifData.OffsetTimeDigitized,
  };

  const FujiRecipe = extractFujiRecipe(exifData);
  const SonyRecipe = extractSonyRecipe(exifData);
  const size = {
    ImageWidth: exifData.ExifImageWidth,
    ImageHeight: exifData.ExifImageHeight,
  };
  const result: Record<string, unknown> = {};
  for (const key of pickKeys) {
    result[key] = exifData[key as keyof Tags];
  }

  return {
    ...date,
    ...size,
    ...result,

    ...(FujiRecipe ? { FujiRecipe } : {}),
    ...(SonyRecipe ? { SonyRecipe } : {}),
  };
}

const formatExifDate = (date: string | ExifDateTime | undefined) => {
  if (!date) {
    return;
  }

  if (typeof date === "string") {
    const parsed = new Date(date);
    // 无效日期字符串不要抛错——否则 extractExifData 的 try 会吞掉整张照片的 EXIF。
    if (Number.isNaN(parsed.getTime())) {
      return;
    }
    return parsed.toISOString();
  }

  return date.toISOString();
};
