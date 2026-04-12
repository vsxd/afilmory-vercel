import type { PhotoManifestItem } from '@afilmory/data'
import { describe, expect, it } from 'vitest'

import type { PhotoMarker } from '~/types/map'

import { calculateApproximateCoverageAreaKm2, calculateMapBounds, getInitialViewStateForMarkers } from '../map-utils'

const createPhoto = (id: string): PhotoManifestItem => ({
  id,
  title: id,
  dateTaken: '2024-01-01',
  tags: [],
  description: '',
  originalUrl: `/photos/${id}.jpg`,
  thumbnailUrl: `/thumbs/${id}.jpg`,
  thumbHash: null,
  width: 4000,
  height: 3000,
  aspectRatio: 4 / 3,
  s3Key: `${id}.jpg`,
  lastModified: '2024-01-01T00:00:00Z',
  size: 1024,
  exif: null,
  toneAnalysis: null,
  location: null,
})

const createMarker = (id: string, latitude: number, longitude: number): PhotoMarker => ({
  id,
  latitude,
  longitude,
  photo: createPhoto(id),
})

describe('map-utils', () => {
  it('calculates the minimal longitude span when markers cross the antimeridian', () => {
    const bounds = calculateMapBounds([createMarker('east', 10, 179), createMarker('west', 12, -179)])

    expect(bounds).not.toBeNull()
    expect(bounds?.crossesAntimeridian).toBe(true)
    expect(bounds?.longitudeSpan).toBeCloseTo(2)
    expect(Math.abs(bounds?.centerLng ?? 0)).toBeCloseTo(180)
    expect(bounds?.bounds).toEqual([
      [179, 10],
      [181, 12],
    ])
  })

  it('uses the wrapped longitude span when deriving the initial view state', () => {
    const viewState = getInitialViewStateForMarkers([createMarker('east', 10, 179), createMarker('west', 12, -179)])

    expect(viewState.longitude).toBe(-180)
    expect(viewState.zoom).toBe(5)
  })

  it('estimates coverage area using longitude span corrected by latitude', () => {
    const bounds = calculateMapBounds([createMarker('a', 60, 10), createMarker('b', 61, 11)])

    expect(bounds).not.toBeNull()
    const area = calculateApproximateCoverageAreaKm2(bounds!)

    expect(area).toBeGreaterThan(6000)
    expect(area).toBeLessThan(6300)
  })
})
