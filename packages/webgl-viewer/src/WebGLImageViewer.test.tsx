import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebGLImageViewer } from './WebGLImageViewer'
import { WebGLImageViewerEngine } from './WebGLImageViewerEngine'

const engineMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  isTileOutlineEnabled: vi.fn(() => false),
  loadImage: vi.fn(() => Promise.resolve()),
}))

vi.mock('./WebGLImageViewerEngine', () => ({
  WebGLImageViewerEngine: vi.fn(() => ({
    destroy: engineMocks.destroy,
    isTileOutlineEnabled: engineMocks.isTileOutlineEnabled,
    loadImage: engineMocks.loadImage,
    resetView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getScale: vi.fn(() => 1),
    setTileOutlineEnabled: vi.fn(),
  })),
}))

describe('WebGLImageViewer', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('creates and disposes the viewer engine', () => {
    const { unmount } = render(<WebGLImageViewer src="blob:photo" width={100} height={80} />)

    expect(WebGLImageViewerEngine).toHaveBeenCalledTimes(1)
    expect(engineMocks.loadImage).toHaveBeenCalledWith('blob:photo', 100, 80)

    unmount()

    expect(engineMocks.destroy).toHaveBeenCalledTimes(1)
  })
})
