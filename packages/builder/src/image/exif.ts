import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { isNil, noop } from "es-toolkit";
import type { ExifDateTime, Tags } from "exiftool-vendored";
import { ExifTool } from "exiftool-vendored";

import { getPhotoProcessingLoggers } from "../photo/logger-adapter.js";
import type { PickedExif } from "../types/photo.js";

export class ExifService {
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

let defaultExifService: ExifService | null = null;

function getDefaultExifService(): ExifService {
  defaultExifService ??= new ExifService({
    exiftoolPath: process.env.EXIFTOOL_PATH,
  });
  return defaultExifService;
}

export const closeExiftool = () => {
  defaultExifService?.close();
  defaultExifService = null;
};

// 提取 EXIF 数据
export async function extractExifData(
  imageBuffer: Buffer,
  originalBuffer?: Buffer,
): Promise<PickedExif | null> {
  const log = getPhotoProcessingLoggers().exif;

  await mkdir("/tmp/image_process", { recursive: true });
  const tempImagePath = path.resolve(
    "/tmp/image_process",
    `${crypto.randomUUID()}.jpg`,
  );

  try {
    await writeFile(tempImagePath, originalBuffer || imageBuffer);

    log.info(`开始提取 EXIF 数据, 文件路径: ${tempImagePath}`);
    const exifData = await getDefaultExifService().read(tempImagePath);

    const result = handleExifData(exifData);

    if (!exifData) {
      log.warn("EXIF 数据解析失败");
      return null;
    }

    // 清理 EXIF 数据中的空字符和无用数据

    delete exifData.warnings;
    delete exifData.errors;

    log.success("EXIF 数据提取完成");
    return result;
  } catch (error) {
    log.error("提取 EXIF 数据失败:", error);
    return null;
  } finally {
    await unlink(tempImagePath).catch(noop);
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
function handleExifData(exifData: Tags): PickedExif {
  const date = {
    DateTimeOriginal: formatExifDate(exifData.DateTimeOriginal),
    DateTimeDigitized: formatExifDate(exifData.DateTimeDigitized),
    OffsetTime: exifData.OffsetTime,
    OffsetTimeOriginal: exifData.OffsetTimeOriginal,
    OffsetTimeDigitized: exifData.OffsetTimeDigitized,
  };

  let FujiRecipe: any = null;
  if (exifData.FilmMode) {
    FujiRecipe = {
      FilmMode: exifData.FilmMode,
      GrainEffectRoughness: exifData.GrainEffectRoughness,
      GrainEffectSize: exifData.GrainEffectSize,
      ColorChromeEffect: exifData.ColorChromeEffect,
      ColorChromeFxBlue: exifData.ColorChromeFXBlue,
      WhiteBalance: exifData.WhiteBalance,

      DynamicRange: exifData.DynamicRange,
      HighlightTone: exifData.HighlightTone,
      ShadowTone: exifData.ShadowTone,
      Saturation: exifData.Saturation,
      // Sharpness: exifData.Sharpness,
      NoiseReduction: exifData.NoiseReduction,
      Clarity: exifData.Clarity,
      ColorTemperature: exifData.ColorTemperature,
      DevelopmentDynamicRange: (exifData as any).DevelopmentDynamicRange,
      DynamicRangeSetting: exifData.DynamicRangeSetting,
    };
  }

  let SonyRecipe: any = null;
  if (!isNil(exifData.CreativeStyle)) {
    SonyRecipe = {
      CreativeStyle: exifData.CreativeStyle,
      PictureEffect: exifData.PictureEffect,
      Hdr: exifData.Hdr,
      SoftSkinEffect: exifData.SoftSkinEffect,
    };
  }
  const size = {
    ImageWidth: exifData.ExifImageWidth,
    ImageHeight: exifData.ExifImageHeight,
  };
  const result: any = structuredClone(exifData);
  for (const key in result) {
    Reflect.deleteProperty(result, key);
  }
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
    return new Date(date).toISOString();
  }

  return date.toISOString();
};
