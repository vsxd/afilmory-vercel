import type { PhotoManifest } from '~/types/photo'

import type { AnimationFrameRect } from './types'

export const DESKTOP_EXIF_PANEL_WIDTH_REM = 20
export const PHOTO_VIEWER_FIT_SCALE = 0.9

const THUMBNAIL_SIZE = {
  mobile: 48,
  desktop: 64,
} as const

const THUMBNAIL_PADDING = {
  mobile: 12,
  desktop: 16,
} as const

export const escapeAttributeValue = (value: string) => {
  if (typeof window !== 'undefined' && window.CSS?.escape) {
    return window.CSS.escape(value)
  }

  return value.replaceAll(/['\\]/g, '\\$&')
}

const getRootFontSize = () => {
  if (typeof window === 'undefined') return 16
  const value = window.getComputedStyle(document.documentElement).fontSize
  const parsed = Number.parseFloat(value || '16')
  return Number.isNaN(parsed) ? 16 : parsed
}

export const getBorderRadius = (element: Element | null) => {
  if (typeof window === 'undefined' || !element) return 0

  const computedStyle = window.getComputedStyle(element)
  const radiusCandidates = [
    computedStyle.borderRadius,
    computedStyle.borderTopLeftRadius,
    computedStyle.borderTopRightRadius,
  ].filter((value) => value && value !== '0px')

  if (radiusCandidates.length === 0) return 0

  const parsed = Number.parseFloat(radiusCandidates[0] || '0')
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, parsed)
}

export const computeViewerImageFrame = (
  photo: PhotoManifest,
  viewportRect: DOMRect | null,
  isMobile: boolean,
): AnimationFrameRect => {
  const baseFontSize = getRootFontSize()
  const exifWidth = isMobile ? 0 : DESKTOP_EXIF_PANEL_WIDTH_REM * baseFontSize
  const thumbnailHeight = isMobile
    ? THUMBNAIL_SIZE.mobile + THUMBNAIL_PADDING.mobile * 2
    : THUMBNAIL_SIZE.desktop + THUMBNAIL_PADDING.desktop * 2

  const viewportWidth = viewportRect?.width ?? window.innerWidth
  const viewportHeight = viewportRect?.height ?? window.innerHeight
  const viewportLeft = viewportRect?.left ?? 0
  const viewportTop = viewportRect?.top ?? 0

  const contentWidth = Math.max(0, viewportWidth - exifWidth)
  const contentHeight = Math.max(0, viewportHeight - thumbnailHeight)

  const photoWidth = photo.width || contentWidth
  const photoHeight = photo.height || contentHeight || 1
  const photoAspect = photoWidth / photoHeight || 1

  let displayWidth = contentWidth
  let displayHeight = contentWidth / photoAspect

  if (displayHeight > contentHeight) {
    displayHeight = contentHeight
    displayWidth = contentHeight * photoAspect
  }

  displayWidth *= PHOTO_VIEWER_FIT_SCALE
  displayHeight *= PHOTO_VIEWER_FIT_SCALE

  const left = viewportLeft + (contentWidth - displayWidth) / 2
  const top = viewportTop + (contentHeight - displayHeight) / 2

  return {
    left,
    top,
    width: displayWidth,
    height: displayHeight,
    borderRadius: 0,
  }
}
