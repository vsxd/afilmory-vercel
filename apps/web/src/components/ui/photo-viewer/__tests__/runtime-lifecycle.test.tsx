import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useImageLoader } from '../hooks'
import { LivePhotoVideo } from '../LivePhotoVideo'

let loadImageMock: ReturnType<typeof vi.fn>
let processVideoMock: ReturnType<typeof vi.fn>
let cleanupMock: ReturnType<typeof vi.fn>
let animationStartMock: ReturnType<typeof vi.fn>
let animationSetMock: ReturnType<typeof vi.fn>

vi.mock('~/lib/image-loader-manager', () => {
  class MockImageLoaderManager {
    loadImage(...args: unknown[]) {
      return loadImageMock(...args)
    }

    processVideo(...args: unknown[]) {
      return processVideoMock(...args)
    }

    cleanup(...args: unknown[]) {
      return cleanupMock(...args)
    }
  }

  return { ImageLoaderManager: MockImageLoaderManager }
})

vi.mock('react-i18next', () => ({
  // eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix, @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks -- mocking an external hook export.
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@afilmory/ui', () => ({
  clsxm: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}))

vi.mock('motion/react', async () => {
  const React = await import('react')
  const MotionVideo = ({
    ref,
    ...props
  }: React.ComponentProps<'video'> & { ref?: React.RefObject<HTMLVideoElement | null> }) => (
    <video ref={ref} {...props} />
  )

  MotionVideo.displayName = 'MotionVideo'

  return {
    m: { video: MotionVideo },
    // eslint-disable-next-line @eslint-react/hooks-extra/no-unnecessary-use-prefix, @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks -- mocking an external hook export.
    useAnimationControls: () => ({
      start: (...args: unknown[]) => animationStartMock(...args),
      set: (...args: unknown[]) => animationSetMock(...args),
    }),
  }
})

function ImageLoaderHarness({ tick }: { tick: number }) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null)
  const [highResLoaded, setHighResLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [, setIsHighResImageRendered] = useState(false)
  const loadingIndicatorRef = useRef({
    updateLoadingState: vi.fn(),
    resetLoadingState: vi.fn(),
  })

  const imageLoaderManagerRef = useImageLoader(
    'https://example.com/photo.jpg',
    true,
    highResLoaded,
    error,
    undefined,
    undefined,
    undefined,
    loadingIndicatorRef as never,
    setBlobSrc,
    setHighResLoaded,
    setError,
    setIsHighResImageRendered,
  )

  return (
    <div
      data-testid="image-loader-state"
      data-blob-src={blobSrc ?? ''}
      data-loaded={highResLoaded ? 'true' : 'false'}
      data-manager={imageLoaderManagerRef.current ? 'present' : 'missing'}
      data-tick={String(tick)}
    />
  )
}

describe('photo viewer runtime lifecycle', () => {
  let loadSpy: ReturnType<typeof vi.spyOn>
  let pauseSpy: ReturnType<typeof vi.spyOn>
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeAll(() => {
    loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  })

  afterAll(() => {
    loadSpy.mockRestore()
    pauseSpy.mockRestore()
    playSpy.mockRestore()
  })

  beforeEach(() => {
    loadImageMock = vi.fn()
    processVideoMock = vi.fn()
    cleanupMock = vi.fn()
    animationStartMock = vi.fn().mockResolvedValue()
    animationSetMock = vi.fn()

    loadImageMock.mockResolvedValue({
      blobSrc: 'blob:loaded-image',
    })

    processVideoMock.mockImplementation(async (_videoSource, videoElement: HTMLVideoElement) => {
      videoElement.setAttribute('src', 'blob:loaded-live-photo')
      return {}
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the live photo video source after the initial load settles', async () => {
    const imageLoaderManager = {
      processVideo: processVideoMock,
      cleanup: cleanupMock,
    } as never
    const loadingIndicatorRef = {
      current: {
        updateLoadingState: vi.fn(),
      },
    } as never

    const { container, rerender } = render(
      <LivePhotoVideo
        videoSource={{ type: 'live-photo', videoUrl: 'https://example.com/live.mov' }}
        imageLoaderManager={imageLoaderManager}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    )

    const videoElement = container.querySelector('video')
    expect(videoElement).not.toBeNull()

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(videoElement?.getAttribute('src')).toBe('blob:loaded-live-photo')
    })

    rerender(
      <LivePhotoVideo
        videoSource={{ type: 'live-photo', videoUrl: 'https://example.com/live.mov' }}
        imageLoaderManager={imageLoaderManager}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    )

    expect(processVideoMock).toHaveBeenCalledTimes(1)
    expect(cleanupMock).not.toHaveBeenCalled()
    expect(videoElement?.getAttribute('src')).toBe('blob:loaded-live-photo')
  })

  it('cleans up the active live photo request when the current image changes', async () => {
    let resolveVideoLoad: (() => void) | null = null
    processVideoMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveVideoLoad = resolve
        }),
    )

    const imageLoaderManager = {
      processVideo: processVideoMock,
      cleanup: cleanupMock,
    } as never
    const loadingIndicatorRef = {
      current: {
        updateLoadingState: vi.fn(),
      },
    } as never

    const { rerender } = render(
      <LivePhotoVideo
        videoSource={{ type: 'live-photo', videoUrl: 'https://example.com/live.mov' }}
        imageLoaderManager={imageLoaderManager}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    )

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1)
    })

    rerender(
      <LivePhotoVideo
        videoSource={{ type: 'live-photo', videoUrl: 'https://example.com/live.mov' }}
        imageLoaderManager={imageLoaderManager}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={false}
      />,
    )

    expect(cleanupMock).toHaveBeenCalledTimes(1)

    resolveVideoLoad?.()
  })

  it('cleans up the live photo manager on unmount', async () => {
    const imageLoaderManager = {
      processVideo: processVideoMock,
      cleanup: cleanupMock,
    } as never
    const loadingIndicatorRef = {
      current: {
        updateLoadingState: vi.fn(),
      },
    } as never

    const { unmount } = render(
      <LivePhotoVideo
        videoSource={{ type: 'live-photo', videoUrl: 'https://example.com/live.mov' }}
        imageLoaderManager={imageLoaderManager}
        loadingIndicatorRef={loadingIndicatorRef}
        isCurrentImage={true}
      />,
    )

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the image loader manager ref available after the high-res image loads', async () => {
    const { rerender } = render(<ImageLoaderHarness tick={0} />)

    await waitFor(() => {
      expect(screen.getByTestId('image-loader-state').dataset.loaded).toBe('true')
    })

    rerender(<ImageLoaderHarness tick={1} />)

    expect(screen.getByTestId('image-loader-state').dataset.manager).toBe('present')
  })
})
