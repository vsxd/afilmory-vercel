import { afterEach, describe, expect, it } from 'vitest'

import type { PhotoManifest } from '~/types/photo'

import { computeViewerImageFrame, DESKTOP_EXIF_PANEL_WIDTH_REM, PHOTO_VIEWER_FIT_SCALE } from '../utils'

describe('photo viewer transition utilities', () => {
  afterEach(() => {
    document.documentElement.style.fontSize = ''
  })

  it('keeps entry thumbnails aligned with the viewer fit baseline after the transition', () => {
    document.documentElement.style.fontSize = '16px'

    const viewportRect = new DOMRect(0, 0, 1600, 1000)
    const frame = computeViewerImageFrame(
      {
        width: 6000,
        height: 4000,
      } as PhotoManifest,
      viewportRect,
      false,
    )

    const desktopExifWidth = DESKTOP_EXIF_PANEL_WIDTH_REM * 16
    const desktopThumbnailStripHeight = 64 + 16 * 2
    const contentWidth = viewportRect.width - desktopExifWidth
    const contentHeight = viewportRect.height - desktopThumbnailStripHeight
    const unscaledWidth = contentWidth
    const unscaledHeight = contentWidth / 1.5

    expect(frame.width).toBeCloseTo(unscaledWidth * PHOTO_VIEWER_FIT_SCALE)
    expect(frame.height).toBeCloseTo(unscaledHeight * PHOTO_VIEWER_FIT_SCALE)
    expect(frame.left).toBeCloseTo((contentWidth - frame.width) / 2)
    expect(frame.top).toBeCloseTo((contentHeight - frame.height) / 2)
  })
})
