/**
 * @fileoverview 核心类型定义
 *
 * 这个文件包含了 Afilmory 项目中所有包共享的类型定义。
 * 通过将类型集中到 @afilmory/data，避免了包之间的循环依赖问题。
 *
 * 依赖关系：
 * - @afilmory/builder → 从此处导入类型
 * - @afilmory/utils → 从此处导入类型
 * - @afilmory/web → 间接通过 builder 使用这些类型
 *
 * 注意：此文件依赖 exiftool-vendored 的类型定义
 */

import type { Tags } from 'exiftool-vendored'

// --- Manifest Types ---

export interface CameraInfo {
  make: string // e.g., "Canon", "Sony", "Fujifilm"
  model: string // e.g., "EOS R5", "α7R V", "X-T5"
  displayName: string // e.g., "Canon EOS R5"
}

export interface LensInfo {
  make?: string // e.g., "Canon", "Sony", "Sigma" (can be empty)
  model: string // e.g., "RF 24-70mm F2.8 L IS USM"
  displayName: string // e.g., "Canon RF 24-70mm F2.8 L IS USM"
}

export type ManifestVersion = string

export type AfilmoryManifest = {
  version: ManifestVersion
  data: PhotoManifestItem[]
  cameras: CameraInfo[] // Unique cameras found in all photos
  lenses: LensInfo[] // Unique lenses found in all photos
}

// --- Photo Types ---

// 地理位置信息
export interface LocationInfo {
  latitude: number
  longitude: number
  country?: string
  city?: string
  locationName?: string
}

// 影调类型定义
export type ToneType = 'low-key' | 'high-key' | 'normal' | 'high-contrast'

// 压缩的直方图数据结构
export interface CompressedHistogramData {
  red: number[] // 64 个点位，降采样后的数据
  green: number[] // 64 个点位，降采样后的数据
  blue: number[] // 64 个点位，降采样后的数据
  luminance: number[] // 64 个点位，降采样后的数据
}

// 原始直方图数据结构（仅用于内部计算）
export interface HistogramData {
  red: number[]
  green: number[]
  blue: number[]
  luminance: number[]
}

// 影调分析结果
export interface ToneAnalysis {
  toneType: ToneType
  brightness: number // 0-100，平均亮度
  contrast: number // 0-100，对比度
  shadowRatio: number // 0-1，阴影区域占比
  highlightRatio: number // 0-1，高光区域占比
}

// Video source sum type: Live Photo or Motion Photo
export type VideoSource =
  | { type: 'live-photo'; videoUrl: string; s3Key: string }
  | { type: 'motion-photo'; offset: number; size?: number; presentationTimestamp?: number }

export interface PhotoInfo {
  title: string
  dateTaken: string
  tags: string[]
  description: string
}

export interface ImageMetadata {
  width: number
  height: number
  format: string
}

export interface PhotoManifestItem extends PhotoInfo {
  id: string
  originalUrl: string
  thumbnailUrl: string
  thumbHash: string | null
  width: number
  height: number
  aspectRatio: number
  s3Key: string
  lastModified: string
  size: number
  exif: PickedExif | null
  toneAnalysis: ToneAnalysis | null // 影调分析结果
  location: LocationInfo | null // 地理位置信息（反向地理编码）
  isHDR?: boolean
  // Video source (Live Photo or Motion Photo)
  video?: VideoSource
}

export interface PickedExif {
  // 时区和时间相关
  zone?: string
  tz?: string
  tzSource?: string

  // 基本相机信息
  Orientation?: number
  Make?: string
  Model?: string
  Software?: string
  Artist?: string
  Copyright?: string

  // 曝光相关
  ExposureTime?: string | number
  FNumber?: number
  ExposureProgram?: string
  ISO?: number
  ShutterSpeedValue?: string | number
  ApertureValue?: number
  BrightnessValue?: number
  ExposureCompensation?: number
  MaxApertureValue?: number

  // 时间偏移
  OffsetTime?: string
  OffsetTimeOriginal?: string
  OffsetTimeDigitized?: string

  // 光源和闪光灯
  LightSource?: string
  Flash?: string

  // 焦距相关
  FocalLength?: string
  FocalLengthIn35mmFormat?: string

  // 镜头相关

  LensMake?: string
  LensModel?: string

  // 颜色和拍摄模式
  ColorSpace?: string

  ExposureMode?: string
  SceneCaptureType?: string

  // 计算字段
  Aperture?: number
  ScaleFactor35efl?: number
  ShutterSpeed?: string | number
  LightValue?: number

  // 日期时间（处理后的 ISO 格式）
  DateTimeOriginal?: string
  DateTimeDigitized?: string

  // 图像尺寸
  ImageWidth?: number
  ImageHeight?: number

  MeteringMode: Tags['MeteringMode']
  WhiteBalance: Tags['WhiteBalance']
  WBShiftAB: Tags['WBShiftAB']
  WBShiftGM: Tags['WBShiftGM']
  WhiteBalanceBias: Tags['WhiteBalanceBias']

  FlashMeteringMode: Tags['FlashMeteringMode']
  SensingMethod: Tags['SensingMethod']
  FocalPlaneXResolution: Tags['FocalPlaneXResolution']
  FocalPlaneYResolution: Tags['FocalPlaneYResolution']
  GPSAltitude: Tags['GPSAltitude']
  GPSLatitude: Tags['GPSLatitude']
  GPSLongitude: Tags['GPSLongitude']
  GPSAltitudeRef: Tags['GPSAltitudeRef']
  GPSLatitudeRef: Tags['GPSLatitudeRef']
  GPSLongitudeRef: Tags['GPSLongitudeRef']

  // 富士胶片配方
  FujiRecipe?: FujiRecipe

  // HDR 相关
  MPImageType?: Tags['MPImageType']
  UniformResourceName?: string

  // 评分
  Rating?: number

  // Motion Photo (XMP) related fields
  MotionPhoto?: Tags['MotionPhoto']
  MotionPhotoVersion?: Tags['MotionPhotoVersion']
  MotionPhotoPresentationTimestampUs?: Tags['MotionPhotoPresentationTimestampUs']
  ContainerDirectory?: Tags['ContainerDirectory']
  MicroVideo?: Tags['MicroVideo']
  MicroVideoVersion?: Tags['MicroVideoVersion']
  MicroVideoOffset?: Tags['MicroVideoOffset']
  MicroVideoPresentationTimestampUs?: Tags['MicroVideoPresentationTimestampUs']
}

export type FujiRecipe = {
  FilmMode:
    | 'F0/Standard (Provia)'
    | 'F1/Studio Portrait'
    | 'F1a/Studio Portrait Enhanced Saturation'
    | 'F1b/Studio Portrait Smooth Skin Tone (Astia)'
    | 'F1c/Studio Portrait Increased Sharpness'
    | 'F2/Fujichrome (Velvia)'
    | 'F3/Studio Portrait Ex'
    | 'F4/Velvia'
    | 'Pro Neg. Std'
    | 'Pro Neg. Hi'
    | 'Classic Chrome'
    | 'Eterna'
    | 'Classic Negative'
    | 'Bleach Bypass'
    | 'Nostalgic Neg'
    | 'Reala ACE'
  GrainEffectRoughness: 'Off' | 'Weak' | 'Strong'
  GrainEffectSize: 'Off' | 'Small' | 'Large'
  ColorChromeEffect: 'Off' | 'Weak' | 'Strong'
  ColorChromeFxBlue: 'Off' | 'Weak' | 'Strong'
  WhiteBalance:
    | 'Auto'
    | 'Auto (white priority)'
    | 'Auto (ambiance priority)'
    | 'Daylight'
    | 'Cloudy'
    | 'Daylight Fluorescent'
    | 'Day White Fluorescent'
    | 'White Fluorescent'
    | 'Warm White Fluorescent'
    | 'Living Room Warm White Fluorescent'
    | 'Incandescent'
    | 'Flash'
    | 'Underwater'
    | 'Custom'
    | 'Custom2'
    | 'Custom3'
    | 'Custom4'
    | 'Custom5'
    | 'Kelvin'
  /**
   * White balance fine tune adjustment (e.g., "Red +0, Blue +0")
   */
  WhiteBalanceFineTune: string
  DynamicRange: 'Standard' | 'Wide'
  /**
   * Highlight tone adjustment (e.g., "+2 (hard)", "0 (normal)", "-1 (medium soft)")
   */
  HighlightTone: string
  /**
   * Shadow tone adjustment (e.g., "-2 (soft)", "0 (normal)")
   */
  ShadowTone: string
  /**
   * Saturation adjustment (e.g., "+4 (highest)", "0 (normal)", "-2 (low)")
   */
  Saturation: string
  /**
   * Sharpness setting (e.g., "Normal", "Hard", "Soft")
   */
  Sharpness: string
  /**
   * Noise reduction setting (e.g., "0 (normal)", "-1 (medium weak)")
   */
  NoiseReduction: string
  /**
   * Clarity adjustment (typically 0)
   */
  Clarity: number
  /**
   * Color temperature setting (e.g., "5000", "6500")
   */
  ColorTemperature: Tags['ColorTemperature']
  /**
   * Development dynamic range setting (e.g., "100", "200")
   */
  DevelopmentDynamicRange: number
  /**
   * Dynamic range setting (e.g., Auto, Manual, Standard, Wide1, Wide2, Film Simulation)
   */
  DynamicRangeSetting: Tags['DynamicRangeSetting']
}

export type SonyRecipe = {
  /**
   * Adobe RGB
   * Real
   * Standard
   * Vivid
   * Portrait
   * Landscape
   * Sunset
   * Nightview
   * BW
   * Neutral
   * Clear
   * Deep
   * Light
   * Autumn Leaves
   * Sepia
   * VV2
   * FL
   * IN
   * SH
   */
  CreativeStyle: string

  /**
   *  Off
   *  Toy Camera
   *  Pop Color
   *  Posterization
   *  Posterization B/W
   *  Retro Photo
   *  Soft High Key
   *  Partial Color (red)
   *  Partial Color (green)
   *  Partial Color (blue)
   *  Partial Color (yellow)
   *  High Contrast Monochrome
   *  Toy Camera (normal)
   *  Toy Camera (cool)
   *  Toy Camera (warm)
   *  Toy Camera (green)
   *  Toy Camera (magenta)
   *  Soft Focus (low)
   *  Soft Focus
   *  Soft Focus (high)
   *  Miniature (auto)
   *  Miniature (top)
   *  Miniature (middle horizontal)
   *  Miniature (bottom)
   *  Miniature (left)
   *  Miniature (middle vertical)
   *  Miniature (right)
   *  HDR Painting (low)
   *  HDR Painting
   *  HDR Painting (high)
   *  Rich-tone Monochrome
   *  Water Color
   *  Water Color 2
   *  Illustration (low)
   *  Illustration
   *  Illustration (high)
   */
  PictureEffect: string

  /**
   * 0 => 'Off',
   * 1 => 'On',
   */
  Hdr: string

  /**
   * Off, Low, Mid, High
   */
  SoftSkinEffect: string
}
