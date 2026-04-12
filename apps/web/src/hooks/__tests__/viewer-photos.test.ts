import type { AfilmoryManifest, PhotoManifestItem } from '@afilmory/data'
import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import * as React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { GallerySetting } from '~/atoms/app'
import { gallerySettingAtom } from '~/atoms/app'
import { initializePhotoLoader } from '~/data-runtime/photo-loader'
import {
  getFilteredPhotos,
  getViewerPhotos,
  getViewerSourceMode,
  usePhotoViewer,
  useViewerPhotos,
} from '~/hooks/usePhotoViewer'
import { jotaiStore } from '~/lib/jotai'

const defaultGallerySetting: GallerySetting = {
  sortBy: 'date',
  sortOrder: 'desc',
  selectedTags: [],
  selectedCameras: [],
  selectedLenses: [],
  selectedRatings: null,
  tagFilterMode: 'union',
  columns: 'auto',
}

const createPhoto = (overrides: Partial<PhotoManifestItem>): PhotoManifestItem => ({
  id: 'photo',
  title: 'photo',
  dateTaken: '2026-04-12T00:00:00.000Z',
  tags: [],
  description: '',
  originalUrl: '/photos/photo.jpg',
  thumbnailUrl: '/thumbnails/photo.jpg',
  thumbHash: null,
  width: 1000,
  height: 800,
  aspectRatio: 1.25,
  s3Key: 'photo.jpg',
  lastModified: '2026-04-12T00:00:00.000Z',
  size: 1024,
  exif: null,
  toneAnalysis: null,
  location: null,
  ...overrides,
})

const manifest: AfilmoryManifest = {
  version: 'v8',
  cameras: [],
  lenses: [],
  data: [
    createPhoto({
      id: 'visible-photo',
      title: 'Visible Photo',
      dateTaken: '2026-04-12T00:00:00.000Z',
      s3Key: 'visible-photo.jpg',
      originalUrl: '/photos/visible-photo.jpg',
      thumbnailUrl: '/thumbnails/visible-photo.jpg',
      tags: ['keep'],
    }),
    createPhoto({
      id: 'hidden-photo',
      title: 'Hidden Photo',
      dateTaken: '2026-04-11T00:00:00.000Z',
      lastModified: '2026-04-11T00:00:00.000Z',
      s3Key: 'hidden-photo.jpg',
      originalUrl: '/photos/hidden-photo.jpg',
      thumbnailUrl: '/thumbnails/hidden-photo.jpg',
      tags: ['other'],
    }),
  ],
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(Provider, { store: jotaiStore }, children)

describe('viewer photo resolution', () => {
  beforeEach(() => {
    initializePhotoLoader(manifest)
    jotaiStore.set(gallerySettingAtom, defaultGallerySetting)

    const { result, unmount } = renderHook(() => usePhotoViewer(), { wrapper })
    act(() => {
      result.current.closeViewer()
    })
    unmount()
  })

  it('keeps the filtered viewer set when the requested photo is still visible', () => {
    jotaiStore.set(gallerySettingAtom, {
      ...defaultGallerySetting,
      selectedTags: ['keep'],
    })

    const filteredPhotos = getFilteredPhotos()
    const viewerPhotos = getViewerPhotos('visible-photo')

    expect(filteredPhotos.map((photo) => photo.id)).toEqual(['visible-photo'])
    expect(viewerPhotos.map((photo) => photo.id)).toEqual(['visible-photo'])
  })

  it('falls back to the full photo set when the requested photo is excluded by filters', () => {
    jotaiStore.set(gallerySettingAtom, {
      ...defaultGallerySetting,
      selectedTags: ['keep'],
    })

    const filteredPhotos = getFilteredPhotos()
    const viewerPhotos = getViewerPhotos('hidden-photo')

    expect(filteredPhotos.map((photo) => photo.id)).toEqual(['visible-photo'])
    expect(viewerPhotos.map((photo) => photo.id)).toEqual(['visible-photo', 'hidden-photo'])
    expect(viewerPhotos.findIndex((photo) => photo.id === 'hidden-photo')).toBe(1)
  })

  it('preserves the active sort order when falling back to the full photo set', () => {
    jotaiStore.set(gallerySettingAtom, {
      ...defaultGallerySetting,
      sortOrder: 'asc',
      selectedTags: ['keep'],
    })

    const viewerPhotos = getViewerPhotos('hidden-photo')

    expect(viewerPhotos.map((photo) => photo.id)).toEqual(['hidden-photo', 'visible-photo'])
    expect(viewerPhotos.findIndex((photo) => photo.id === 'hidden-photo')).toBe(0)
  })

  it('keeps goToIndex bounded by the active viewer photo count', () => {
    const { result } = renderHook(() => usePhotoViewer(1), { wrapper })

    act(() => {
      result.current.openViewer(0, { sourceMode: 'filtered' })
      result.current.goToIndex(1)
    })

    expect(result.current.currentIndex).toBe(0)
  })

  it('keeps an all-photos viewer session stable after navigating to a visible filtered photo', async () => {
    jotaiStore.set(gallerySettingAtom, {
      ...defaultGallerySetting,
      selectedTags: ['keep'],
    })

    const { result, rerender } = renderHook(
      ({ photoId }) => {
        const photos = useViewerPhotos(photoId)
        const viewer = usePhotoViewer(photos.length)
        return { photos, viewer }
      },
      { initialProps: { photoId: 'hidden-photo' as string | null }, wrapper },
    )

    act(() => {
      result.current.viewer.openViewer(1, { sourceMode: getViewerSourceMode('hidden-photo') })
    })

    rerender({ photoId: 'visible-photo' })
    expect(result.current.photos.map((photo) => photo.id)).toEqual(['visible-photo', 'hidden-photo'])
    expect(result.current.viewer.viewerSourceMode).toBe('all')

    act(() => {
      result.current.viewer.closeViewer()
    })

    rerender({ photoId: 'visible-photo' })
    await waitFor(() => {
      expect(result.current.photos.map((photo) => photo.id)).toEqual(['visible-photo'])
      expect(result.current.viewer.viewerSourceMode).toBeNull()
    })
  })
})
