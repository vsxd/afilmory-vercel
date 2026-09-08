import type { PhotoExif } from "~/types/photo";

/**
 * 画廊 hover 覆盖层与查看器 EXIF 面板共用的核心拍摄参数。
 *
 * 查看器把「实际焦距」与「等效焦距 (35mm)」分成两行展示，所以这里同时
 * 暴露 focalLength35mm（仅取 FocalLengthIn35mmFormat）与 focalLength
 * （取 FocalLength）；画廊覆盖层只有一格焦距，在调用侧做
 * `focalLength35mm ?? focalLength` 回退。
 */
export interface EssentialExif {
  /** 等效焦距 (35mm)，仅来自 FocalLengthIn35mmFormat */
  focalLength35mm: number | null;
  /** 实际焦距，来自 FocalLength */
  focalLength: number | null;
  iso: number | null;
  /** 快门速度，如 "1/200s"；优先 ExposureTime，缺失时回退 ShutterSpeedValue */
  shutterSpeed: string | null;
  /** 光圈，如 "f/1.8" */
  aperture: string | null;
}

export const getEssentialExif = (
  exif: PhotoExif | null | undefined,
): EssentialExif => {
  if (!exif) {
    return {
      focalLength35mm: null,
      focalLength: null,
      iso: null,
      shutterSpeed: null,
      aperture: null,
    };
  }

  // 等效焦距 (35mm)
  const focalLength35mm = exif.FocalLengthIn35mmFormat
    ? Number.parseInt(exif.FocalLengthIn35mmFormat)
    : null;

  // 实际焦距
  const focalLength = exif.FocalLength
    ? Number.parseInt(exif.FocalLength)
    : null;

  // ISO
  const iso = exif.ISO ?? null;

  // 快门速度
  const shutterSpeed = exif.ExposureTime
    ? `${exif.ExposureTime}s`
    : exif.ShutterSpeedValue
      ? `${exif.ShutterSpeedValue}s`
      : null;

  // 光圈
  const aperture = exif.FNumber ? `f/${exif.FNumber}` : null;

  return { focalLength35mm, focalLength, iso, shutterSpeed, aperture };
};
