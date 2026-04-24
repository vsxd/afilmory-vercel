import { describe, expect, it } from 'vitest'

import { createPhotoId, findPhotoIdCollisionKeys } from './id.js'

describe('photo id helpers', () => {
  it('detects basename collisions across different directories', () => {
    expect(findPhotoIdCollisionKeys(['album-a/IMG_0001.JPG', 'album-b/IMG_0001.JPG', 'album-c/IMG_0002.JPG'])).toEqual(
      new Set(['album-a/IMG_0001.JPG', 'album-b/IMG_0001.JPG']),
    )
  })

  it('adds a stable digest only when requested', () => {
    expect(createPhotoId('album-a/IMG_0001.JPG')).toBe('IMG_0001')

    const first = createPhotoId('album-a/IMG_0001.JPG', { forceDigest: true })
    const second = createPhotoId('album-b/IMG_0001.JPG', { forceDigest: true })

    expect(first).toMatch(/^IMG_0001_[a-f0-9]{8}$/)
    expect(second).toMatch(/^IMG_0001_[a-f0-9]{8}$/)
    expect(first).not.toBe(second)
  })
})
