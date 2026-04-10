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
  // eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix, @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks -- mocking an external hook export.
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('usehooks-ts', () => ({
  // eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix, @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks -- mocking an external hook export.
  useMediaQuery: () => false,
}))

vi.mock('~/atoms/context-menu', () => ({
  // eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix, @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks -- mocking an external hook export.
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
})
