import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProgressiveImage } from '../ProgressiveImage'

vi.mock('@afilmory/ui', () => ({
  clsxm: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}))

vi.mock('@afilmory/webgl-viewer', () => ({
  WebGLImageViewer: () => null,
}))

vi.mock('~/lib/image-loader-manager', () => {
  class MockImageLoaderManager {
    loadImage() {
      return Promise.resolve({ blobSrc: 'blob:mock-image' })
    }

    cleanup() {}
  }

  return { ImageLoaderManager: MockImageLoaderManager }
})

vi.mock('motion/react', async () => {
  const React = await import('react')

  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    m: {
      div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
    },
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('usehooks-ts', () => ({
  useMediaQuery: () => false,
}))

vi.mock('react-zoom-pan-pinch', () => {
  return {
    TransformWrapper: ({ children }: { children?: any }) => <div>{children}</div>,
    TransformComponent: ({ children }: { children?: any }) => <div>{children}</div>,
  }
})

vi.mock('~/atoms/context-menu', () => ({
  useShowContextMenu: () => vi.fn(),
}))

vi.mock('~/lib/feature', () => ({
  canUseWebGL: false,
}))

describe('ProgressiveImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('shows the thumbnail when the browser reports the image as already loaded on mount', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1600)

    render(
      <ProgressiveImage
        src="https://example.com/photo.jpg"
        thumbnailSrc="https://example.com/photo-thumb.jpg"
        alt="Loaded thumbnail"
        isCurrentImage={false}
        shouldRenderHighRes={false}
        loadingIndicatorRef={{ current: null }}
      />,
    )

    const thumbnail = screen.getByAltText('Loaded thumbnail')

    await waitFor(() => {
      expect(thumbnail.className).toContain('opacity-100')
    })
  })

  it('renders a DOM high-resolution image when WebGL is unavailable', async () => {
    render(
      <ProgressiveImage
        src="https://example.com/photo.jpg"
        thumbnailSrc={undefined}
        alt="High resolution fallback"
        isCurrentImage={true}
        shouldRenderHighRes={true}
        loadingIndicatorRef={{ current: null }}
      />,
    )

    const highResImage = await screen.findByAltText('High resolution fallback')

    await waitFor(() => {
      expect(highResImage.getAttribute('src')).toBe('blob:mock-image')
    })
    expect(screen.getByText('photo.webgl.unavailable')).toBeTruthy()
  })
})
