import { describe, expect, it } from 'vitest'

import { buildPhotoDetailSearch, getSafeReturnTo, syncPhotoDetailSearch } from '~/lib/return-to'

describe('return-to helpers', () => {
  it('builds a returnTo query string for internal routes', () => {
    expect(buildPhotoDetailSearch('/explore?photoId=A7C09524')).toBe('?returnTo=%2Fexplore%3FphotoId%3DA7C09524')
  })

  it('reads back safe internal return targets', () => {
    expect(getSafeReturnTo('?returnTo=%2Fexplore%3FphotoId%3DA7C09524')).toBe('/explore?photoId=A7C09524')
  })

  it('rejects external or protocol-relative return targets', () => {
    expect(getSafeReturnTo('?returnTo=https%3A%2F%2Fevil.example')).toBeNull()
    expect(getSafeReturnTo('?returnTo=%2F%2Fevil.example')).toBeNull()
  })

  it('rejects internal paths outside the allowed browse surfaces', () => {
    expect(getSafeReturnTo('?returnTo=%2Fphotos%2FA7C09524')).toBeNull()
    expect(getSafeReturnTo('?returnTo=%2F')).toBeNull()
  })

  it('keeps nested explore photoId in sync with the active photo', () => {
    expect(syncPhotoDetailSearch('?returnTo=%2Fexplore%3FphotoId%3DA7C09524', 'A7C01202')).toBe(
      '?returnTo=%2Fexplore%3FphotoId%3DA7C01202',
    )
  })
})
