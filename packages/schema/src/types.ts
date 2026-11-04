import type {
  AFILMORY_MANIFEST_SCHEMA,
  CURRENT_MANIFEST_VERSION,
} from "./version.ts";

export interface CameraInfo {
  make: string;
  model: string;
  displayName: string;
}

export interface LensInfo {
  make?: string;
  model: string;
  displayName: string;
}

export type ManifestSource =
  | {
      provider: "s3";
      bucket?: string;
      region?: string;
      endpoint?: string;
      prefix?: string;
      customDomain?: string;
    }
  | {
      /** 本地文件系统构建源（builder 的 LocalFileSystemProvider） */
      provider: "local";
      /** 照片源目录（本地文件系统路径） */
      basePath?: string;
      /** 生成 originalUrl 时的公共 URL 前缀（builder 默认 "/originals"） */
      baseUrl?: string;
    }
  | {
      provider: "unknown";
    };

export interface ManifestIndexes {
  cameras: CameraInfo[];
  lenses: LensInfo[];
}

export type AfilmoryManifest = {
  schema: typeof AFILMORY_MANIFEST_SCHEMA;
  version: typeof CURRENT_MANIFEST_VERSION;
  generatedAt: string;
  source: ManifestSource;
  photos: PhotoManifestItem[];
  indexes: ManifestIndexes;
};

export interface LocationAdminInfo {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  district?: string;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  admin?: LocationAdminInfo;
  adminI18n?: Record<string, LocationAdminInfo>;
  adminKey?: LocationAdminInfo;
  country?: string;
  city?: string;
  locationName?: string;
  locationNameI18n?: Record<string, string>;
}

export type ToneType = "low-key" | "high-key" | "normal" | "high-contrast";

export interface ToneAnalysis {
  toneType: ToneType;
  brightness: number;
  contrast: number;
  shadowRatio: number;
  highlightRatio: number;
}

export type VideoSource =
  | { type: "live-photo"; videoUrl: string; s3Key: string; version?: string }
  | {
      type: "motion-photo";
      offset: number;
      size?: number;
      presentationTimestamp?: number;
    };

export interface PhotoInfo {
  title: string;
  dateTaken: string;
  tags: string[];
  description: string;
}

/**
 * Version signatures for build-time derived data.
 *
 * The field is optional so manifest v2 files produced by older builders stay
 * valid.  A missing or different signature tells a newer builder to refresh
 * only the affected processing stage on the next healthy incremental build.
 */
export interface PhotoProcessingFingerprints {
  thumbnail?: string;
  displayImages?: string;
  exif?: string;
  tone?: string;
  media?: string;
  location?: string;
  privacy?: string;
}

/** Build-time, display-oriented derivatives; original dimensions remain on the photo. */
export interface PhotoDisplayImage {
  url: string;
  width: number;
  height: number;
}

export interface PhotoManifestItem extends PhotoInfo {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  displayImages?: PhotoDisplayImage[];
  thumbHash: string | null;
  width: number;
  height: number;
  aspectRatio: number;
  s3Key: string;
  lastModified: string;
  size: number;
  etag?: string;
  exif: PickedExif | null;
  toneAnalysis: ToneAnalysis | null;
  location: LocationInfo | null;
  isHDR?: boolean;
  video?: VideoSource;
  processing?: PhotoProcessingFingerprints;
}

export type ManifestExifValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ManifestExifValue[]
  | { [key: string]: ManifestExifValue };

export interface ContainerDirectoryItem {
  Item?: {
    Semantic?: string;
    Length?: number;
    Mime?: string;
    Padding?: number;
    [key: string]: ManifestExifValue;
  };
  [key: string]: ManifestExifValue;
}

export interface PickedExif {
  zone?: string;
  tz?: string;
  tzSource?: string;
  Orientation?: number;
  Make?: string;
  Model?: string;
  Software?: string;
  Artist?: string;
  Copyright?: string;
  ExposureTime?: string | number;
  FNumber?: number;
  ExposureProgram?: string;
  ISO?: number;
  ShutterSpeedValue?: string | number;
  ApertureValue?: number;
  BrightnessValue?: number;
  ExposureCompensation?: number;
  MaxApertureValue?: number;
  OffsetTime?: string;
  OffsetTimeOriginal?: string;
  OffsetTimeDigitized?: string;
  LightSource?: string;
  Flash?: string;
  FocalLength?: string;
  FocalLengthIn35mmFormat?: string;
  LensMake?: string;
  LensModel?: string;
  ColorSpace?: string;
  ExposureMode?: string;
  SceneCaptureType?: string;
  Aperture?: number;
  ScaleFactor35efl?: number;
  ShutterSpeed?: string | number;
  LightValue?: number;
  DateTimeOriginal?: string;
  DateTimeDigitized?: string;
  ImageWidth?: number;
  ImageHeight?: number;
  MeteringMode?: string | number;
  WhiteBalance?: string | number;
  WBShiftAB?: string | number;
  WBShiftGM?: string | number;
  WhiteBalanceBias?: string | number;
  FlashMeteringMode?: string | number;
  SensingMethod?: string | number;
  FocalPlaneXResolution?: number;
  FocalPlaneYResolution?: number;
  GPSAltitude?: string | number;
  GPSCoordinates?: string;
  GPSLatitude?: string | number;
  GPSLongitude?: string | number;
  GPSAltitudeRef?: string | number;
  GPSLatitudeRef?: string;
  GPSLongitudeRef?: string;
  FujiRecipe?: FujiRecipe;
  SonyRecipe?: SonyRecipe;
  MPImageType?: string;
  UniformResourceName?: string;
  MotionPhoto?: string | number | boolean;
  MotionPhotoVersion?: string | number;
  MotionPhotoPresentationTimestampUs?: string | number;
  ContainerDirectory?: ContainerDirectoryItem[];
  MicroVideo?: string | number | boolean;
  MicroVideoVersion?: string | number;
  MicroVideoOffset?: string | number;
  MicroVideoPresentationTimestampUs?: string | number;
}

export type FujiRecipe = {
  FilmMode?:
    | "F0/Standard (Provia)"
    | "F1/Studio Portrait"
    | "F1a/Studio Portrait Enhanced Saturation"
    | "F1b/Studio Portrait Smooth Skin Tone (Astia)"
    | "F1c/Studio Portrait Increased Sharpness"
    | "F2/Fujichrome (Velvia)"
    | "F3/Studio Portrait Ex"
    | "F4/Velvia"
    | "Pro Neg. Std"
    | "Pro Neg. Hi"
    | "Classic Chrome"
    | "Eterna"
    | "Classic Negative"
    | "Bleach Bypass"
    | "Nostalgic Neg"
    | "Reala ACE"
    | string;
  GrainEffectRoughness?: "Off" | "Weak" | "Strong" | string;
  GrainEffectSize?: "Off" | "Small" | "Large" | string;
  ColorChromeEffect?: "Off" | "Weak" | "Strong" | string;
  ColorChromeFxBlue?: "Off" | "Weak" | "Strong" | string;
  WhiteBalance?: string;
  WhiteBalanceFineTune?: string;
  DynamicRange?: "Standard" | "Wide" | string;
  HighlightTone?: string;
  ShadowTone?: string;
  Saturation?: string;
  Sharpness?: string;
  NoiseReduction?: string;
  Clarity?: number;
  ColorTemperature?: string | number;
  DevelopmentDynamicRange?: number;
  DynamicRangeSetting?: string | number;
};

export type SonyRecipe = {
  CreativeStyle?: string;
  PictureEffect?: string;
  Hdr?: string;
  SoftSkinEffect?: string;
};
