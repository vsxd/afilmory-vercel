import assert from 'node:assert/strict'
import test from 'node:test'

import { createPhotoLoader, createRuntimePhotoLoader } from '../../packages/data/src/index'
import type { AfilmoryManifest, PhotoManifestItem } from '../../packages/data/src/types'

const buildPhoto = (id: string, tags: string[]): PhotoManifestItem => ({
  id,
  title: id,
  dateTaken: new Date('2024-01-01').toISOString(),
  tags,
  description: '',
  originalUrl: `/originals/${id}.jpg`,
  thumbnailUrl: `/thumbnails/${id}.jpg`,
  thumbHash: null,
  width: 100,
  height: 100,
  aspectRatio: 1,
  s3Key: `${id}.jpg`,
  lastModified: new Date('2024-01-01').toISOString(),
  size: 1,
  exif: null,
  toneAnalysis: null,
  location: null,
})

const manifest: AfilmoryManifest = {
  version: 'v7',
  data: [buildPhoto('1', ['a', 'b']), buildPhoto('2', ['b', 'c'])],
  cameras: [
    {
      id: 'cam-1',
      make: 'Canon',
      model: 'R6',
      displayName: 'Canon R6',
    },
  ],
  lenses: [
    {
      id: 'lens-1',
      make: 'Canon',
      model: 'RF24-70',
      displayName: 'Canon RF24-70',
    },
  ],
}

test('PhotoLoader 基本查询能力正确', () => {
  const loader = createPhotoLoader(manifest)

  assert.equal(loader.getPhotos().length, 2)
  assert.equal(loader.getPhoto('1')?.id, '1')
  assert.deepEqual(loader.getAllTags(), ['a', 'b', 'c'])
  assert.equal(loader.getAllCameras().length, 1)
  assert.equal(loader.getAllLenses().length, 1)
})

test('createRuntimePhotoLoader 显式传入 null 时不回退 runtime manifest', () => {
  const runtimeGlobal = globalThis as typeof globalThis & { __MANIFEST__?: AfilmoryManifest }
  const originManifest = runtimeGlobal.__MANIFEST__
  runtimeGlobal.__MANIFEST__ = manifest

  try {
    const loader = createRuntimePhotoLoader(null)
    assert.equal(loader.getPhotos().length, 0)
  } finally {
    runtimeGlobal.__MANIFEST__ = originManifest
  }
})

test('createRuntimePhotoLoader 未传参时读取 runtime manifest', () => {
  const runtimeGlobal = globalThis as typeof globalThis & { __MANIFEST__?: AfilmoryManifest }
  const originManifest = runtimeGlobal.__MANIFEST__
  runtimeGlobal.__MANIFEST__ = manifest

  try {
    const loader = createRuntimePhotoLoader()
    assert.equal(loader.getPhotos().length, 2)
  } finally {
    runtimeGlobal.__MANIFEST__ = originManifest
  }
})
