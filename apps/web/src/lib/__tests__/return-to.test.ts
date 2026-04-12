import { describe, expect, it } from 'vitest'

import { buildPhotoDetailSearch, getSafeReturnTo } from '~/lib/return-to'

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
})
