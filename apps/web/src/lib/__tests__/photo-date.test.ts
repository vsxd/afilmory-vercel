import type { PhotoManifestItem } from '@afilmory/data'
import { describe, expect, it } from 'vitest'

import { getPhotoDate, getPhotoDateString } from '../photo-date'

function createPhoto(overrides: Partial<PhotoManifestItem> = {}): PhotoManifestItem {
  return {
    id: 'test-1',
    title: 'Test Photo',
    dateTaken: '2024-01-15',
    tags: [],
    description: '',
    originalUrl: '/photos/test.jpg',
    thumbnailUrl: '/thumbs/test.jpg',
    thumbHash: null,
    width: 4000,
    height: 3000,
    aspectRatio: 4 / 3,
    s3Key: 'test.jpg',
    lastModified: '2024-06-01T12:00:00Z',
    size: 1024,
    exif: null,
    toneAnalysis: null,
    location: null,
    ...overrides,
  }
}

describe('getPhotoDate', () => {
  it('should return correct Date from EXIF DateTimeOriginal', () => {
    const photo = createPhoto({
      exif: {
        DateTimeOriginal: '2024:03:15 14:30:00',
        MeteringMode: undefined,
        WhiteBalance: undefined,
        WBShiftAB: undefined,
        WBShiftGM: undefined,
        WhiteBalanceBias: undefined,
        FlashMeteringMode: undefined,
        SensingMethod: undefined,
        FocalPlaneXResolution: undefined,
        FocalPlaneYResolution: undefined,
        GPSAltitude: undefined,
        GPSLatitude: undefined,
        GPSLongitude: undefined,
        GPSAltitudeRef: undefined,
        GPSLatitudeRef: undefined,
        GPSLongitudeRef: undefined,
      },
    })

    const date = getPhotoDate(photo)
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(2) // March is 0-indexed
    expect(date.getDate()).toBe(15)
  })

  it('should handle ISO format DateTimeOriginal', () => {
    const photo = createPhoto({
      exif: {
        DateTimeOriginal: '2024-03-15T14:30:00Z',
        MeteringMode: undefined,
        WhiteBalance: undefined,
        WBShiftAB: undefined,
        WBShiftGM: undefined,
        WhiteBalanceBias: undefined,
        FlashMeteringMode: undefined,
        SensingMethod: undefined,
        FocalPlaneXResolution: undefined,
        FocalPlaneYResolution: undefined,
        GPSAltitude: undefined,
        GPSLatitude: undefined,
        GPSLongitude: undefined,
        GPSAltitudeRef: undefined,
        GPSLatitudeRef: undefined,
        GPSLongitudeRef: undefined,
      },
    })

    const date = getPhotoDate(photo)
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(15)
  })

  it('should fall back to lastModified when exif is null', () => {
    const photo = createPhoto({
      exif: null,
      lastModified: '2024-06-01T12:00:00Z',
    })

    const date = getPhotoDate(photo)
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(5) // June
    expect(date.getDate()).toBe(1)
  })

  it('should fall back to lastModified when DateTimeOriginal is missing', () => {
    const photo = createPhoto({
      exif: {
        MeteringMode: undefined,
        WhiteBalance: undefined,
        WBShiftAB: undefined,
        WBShiftGM: undefined,
        WhiteBalanceBias: undefined,
        FlashMeteringMode: undefined,
        SensingMethod: undefined,
        FocalPlaneXResolution: undefined,
        FocalPlaneYResolution: undefined,
        GPSAltitude: undefined,
        GPSLatitude: undefined,
        GPSLongitude: undefined,
        GPSAltitudeRef: undefined,
        GPSLatitudeRef: undefined,
        GPSLongitudeRef: undefined,
      },
      lastModified: '2024-06-01T12:00:00Z',
    })

    const date = getPhotoDate(photo)
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(5)
  })

  it('should fall back to lastModified for invalid EXIF dates', () => {
    const photo = createPhoto({
      exif: {
        DateTimeOriginal: 'not-a-valid-date',
        MeteringMode: undefined,
        WhiteBalance: undefined,
        WBShiftAB: undefined,
        WBShiftGM: undefined,
        WhiteBalanceBias: undefined,
        FlashMeteringMode: undefined,
        SensingMethod: undefined,
        FocalPlaneXResolution: undefined,
        FocalPlaneYResolution: undefined,
        GPSAltitude: undefined,
        GPSLatitude: undefined,
        GPSLongitude: undefined,
        GPSAltitudeRef: undefined,
        GPSLatitudeRef: undefined,
        GPSLongitudeRef: undefined,
      },
      lastModified: '2024-06-01T12:00:00Z',
    })

    const date = getPhotoDate(photo)
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(5) // Falls back to lastModified
  })
})

describe('getPhotoDateString', () => {
  it('should return DateTimeOriginal when available', () => {
    const photo = createPhoto({
      exif: {
        DateTimeOriginal: '2024:03:15 14:30:00',
        MeteringMode: undefined,
        WhiteBalance: undefined,
        WBShiftAB: undefined,
        WBShiftGM: undefined,
        WhiteBalanceBias: undefined,
        FlashMeteringMode: undefined,
        SensingMethod: undefined,
        FocalPlaneXResolution: undefined,
        FocalPlaneYResolution: undefined,
        GPSAltitude: undefined,
        GPSLatitude: undefined,
        GPSLongitude: undefined,
        GPSAltitudeRef: undefined,
        GPSLatitudeRef: undefined,
        GPSLongitudeRef: undefined,
      },
    })

    expect(getPhotoDateString(photo)).toBe('2024:03:15 14:30:00')
  })

  it('should fall back to lastModified when exif is null', () => {
    const photo = createPhoto({
      exif: null,
      lastModified: '2024-06-01T12:00:00Z',
    })

    expect(getPhotoDateString(photo)).toBe('2024-06-01T12:00:00Z')
  })

  it('should fall back to lastModified when DateTimeOriginal is undefined', () => {
    const photo = createPhoto({
      exif: {
        MeteringMode: undefined,
        WhiteBalance: undefined,
        WBShiftAB: undefined,
        WBShiftGM: undefined,
        WhiteBalanceBias: undefined,
        FlashMeteringMode: undefined,
        SensingMethod: undefined,
        FocalPlaneXResolution: undefined,
        FocalPlaneYResolution: undefined,
        GPSAltitude: undefined,
        GPSLatitude: undefined,
        GPSLongitude: undefined,
        GPSAltitudeRef: undefined,
        GPSLatitudeRef: undefined,
        GPSLongitudeRef: undefined,
      },
      lastModified: '2024-06-01T12:00:00Z',
    })

    expect(getPhotoDateString(photo)).toBe('2024-06-01T12:00:00Z')
  })
})
