import { describe, expect, it, vi } from 'vitest'

import type { PhotoManifestItem } from '../types/photo.js'
import { shouldProcessPhoto } from './cache-manager.js'

vi.mock('../image/thumbnail.js', () => ({
  thumbnailExists: vi.fn(async () => true),
}))

function createExistingPhoto(overrides: Partial<PhotoManifestItem> = {}): PhotoManifestItem {
  return {
    id: 'photo',
    title: 'photo',
    description: '',
    dateTaken: '2024-01-01T00:00:00.000Z',
    tags: [],
    originalUrl: '/originals/photo.jpg',
    thumbnailUrl: '/thumbnails/photo.jpg',
    thumbHash: null,
    width: 100,
    height: 100,
    aspectRatio: 1,
    s3Key: 'photo.jpg',
    lastModified: '2024-01-01T00:00:00.000Z',
    size: 1,
    etag: 'old',
    exif: null,
    toneAnalysis: null,
    location: null,
    ...overrides,
  }
}

describe('shouldProcessPhoto', () => {
  it('processes same-timestamp changes when size changes', async () => {
    const result = await shouldProcessPhoto(
      'photo',
      createExistingPhoto(),
      {
        Key: 'photo.jpg',
        LastModified: new Date('2024-01-01T00:00:00.000Z'),
        Size: 2,
        ETag: 'old',
      },
      {
        isForceMode: false,
        isForceManifest: false,
        isForceThumbnails: false,
      },
    )

    expect(result).toEqual({ shouldProcess: true, reason: '文件已更新' })
  })

  it('processes same-timestamp changes when etag changes', async () => {
    const result = await shouldProcessPhoto(
      'photo',
      createExistingPhoto(),
      {
        Key: 'photo.jpg',
        LastModified: new Date('2024-01-01T00:00:00.000Z'),
        Size: 1,
        ETag: 'new',
      },
      {
        isForceMode: false,
        isForceManifest: false,
        isForceThumbnails: false,
      },
    )

    expect(result).toEqual({ shouldProcess: true, reason: '文件已更新' })
  })
})
