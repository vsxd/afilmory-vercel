export type {
  CompressedHistogramData,
  FujiRecipe,
  HistogramData,
  ImageMetadata,
  LocationInfo,
  PhotoInfo,
  PhotoManifestItem,
  PickedExif,
  SonyRecipe,
  ToneAnalysis,
  ToneType,
  VideoSource,
} from '@afilmory/data/types'

export interface ProcessPhotoResult {
  item: import('@afilmory/data/types').PhotoManifestItem | null
  type: 'processed' | 'skipped' | 'new' | 'failed'
  pluginData?: Record<string, unknown>
}

export interface ThumbnailResult {
  thumbnailUrl: string | null
  thumbnailBuffer: Buffer | null
  thumbHash: Uint8Array | null
}
