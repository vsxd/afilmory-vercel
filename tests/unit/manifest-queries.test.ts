import assert from 'node:assert/strict'
import test from 'node:test'

import { collectSortedTags, createPhotoMap } from '../../packages/data/src/manifest-queries'
import type { PhotoManifestItem } from '../../packages/data/src/types'

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

test('createPhotoMap maps by id and skips invalid ids', () => {
  const map = createPhotoMap([
    buildPhoto('a', []),
    {
      ...buildPhoto('ignored', []),
      id: '' as string,
    },
  ])

  assert.deepEqual(Object.keys(map), ['a'])
  assert.equal(map.a?.id, 'a')
})

test('collectSortedTags returns unique sorted tags', () => {
  const tags = collectSortedTags([buildPhoto('a', ['b', 'a']), buildPhoto('b', ['a', 'c'])])
  assert.deepEqual(tags, ['a', 'b', 'c'])
})
