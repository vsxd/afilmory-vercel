import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { handleDeletedPhotos, loadExistingManifest, needsUpdate } from '../manifest/manager.js'
import { setBuilderOutputSettings } from '../output-paths.js'
import type { PhotoManifestItem } from '../types/photo.js'

function createPhotoManifestItem(id: string): PhotoManifestItem {
  return {
    id,
    title: id,
    description: '',
    dateTaken: '2024-01-01T00:00:00.000Z',
    tags: [],
    originalUrl: `/originals/${id}.jpg`,
    thumbnailUrl: `/thumbnails/${id}.jpg`,
    thumbHash: null,
    width: 100,
    height: 100,
    aspectRatio: 1,
    s3Key: `${id}.jpg`,
    lastModified: '2024-01-01T00:00:00.000Z',
    size: 1,
    exif: null,
    toneAnalysis: null,
    location: null,
  }
}

describe('handleDeletedPhotos', () => {
  let tmpDir: string
  let thumbnailsDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-manifest-'))
    thumbnailsDir = path.join(tmpDir, 'thumbnails')

    setBuilderOutputSettings({
      manifestPath: path.join(tmpDir, 'photos-manifest.json'),
      thumbnailsDir,
      originalsDir: path.join(tmpDir, 'originals'),
    })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns zero when the thumbnails directory does not exist', async () => {
    await expect(handleDeletedPhotos([createPhotoManifestItem('keep')])).resolves.toBe(0)
  })

  it('removes thumbnails that are no longer present in the manifest', async () => {
    await fs.mkdir(thumbnailsDir, { recursive: true })
    await fs.writeFile(path.join(thumbnailsDir, 'keep.jpg'), '')
    await fs.writeFile(path.join(thumbnailsDir, 'remove.jpg'), '')

    const deletedCount = await handleDeletedPhotos([createPhotoManifestItem('keep')])

    expect(deletedCount).toBe(1)
    await expect(fs.access(path.join(thumbnailsDir, 'keep.jpg'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(thumbnailsDir, 'remove.jpg'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('loadExistingManifest', () => {
  let tmpDir: string
  let manifestPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-load-manifest-'))
    manifestPath = path.join(tmpDir, 'photos-manifest.json')

    setBuilderOutputSettings({
      manifestPath,
      thumbnailsDir: path.join(tmpDir, 'thumbnails'),
      originalsDir: path.join(tmpDir, 'originals'),
    })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a new manifest only when the file does not exist', async () => {
    const manifest = await loadExistingManifest()

    expect(manifest.version).toBe('v8')
    await expect(fs.access(manifestPath)).resolves.toBeUndefined()
  })

  it('preserves an unreadable manifest instead of overwriting it', async () => {
    await fs.writeFile(manifestPath, '{ invalid json')

    await expect(loadExistingManifest()).rejects.toThrow(/解析 manifest 失败/)
    await expect(fs.readFile(manifestPath, 'utf-8')).resolves.toBe('{ invalid json')
  })
})

describe('needsUpdate', () => {
  it('detects same-timestamp content changes by size and etag', () => {
    const existing = {
      ...createPhotoManifestItem('photo'),
      lastModified: '2024-01-01T00:00:00.000Z',
      size: 1,
      etag: 'old',
    }

    expect(
      needsUpdate(existing, {
        Key: 'photo.jpg',
        LastModified: new Date('2024-01-01T00:00:00.000Z'),
        Size: 2,
        ETag: 'old',
      }),
    ).toBe(true)
    expect(
      needsUpdate(existing, {
        Key: 'photo.jpg',
        LastModified: new Date('2024-01-01T00:00:00.000Z'),
        Size: 1,
        ETag: 'new',
      }),
    ).toBe(true)
  })
})
