import { cleanup, render, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLivePhotoHandler } from '../useLivePhotoHandler'

let processVideoMock: ReturnType<typeof vi.fn>
let cleanupMock: ReturnType<typeof vi.fn>

vi.mock('~/lib/image-loader-manager', () => {
  class MockImageLoaderManager {
    processVideo(...args: unknown[]) {
      return processVideoMock(...args)
    }

    cleanup(...args: unknown[]) {
      return cleanupMock(...args)
    }
  }

  return { ImageLoaderManager: MockImageLoaderManager }
})

vi.mock('~/lib/device-viewport', () => ({
  isMobileDevice: false,
}))

function LivePhotoHandlerHarness({
  data,
  tick,
}: {
  data: {
    id: string
    originalUrl: string
    video: { type: 'live-photo'; videoUrl: string }
  }
  tick: number
}) {
  const { videoRef } = useLivePhotoHandler({
    data: data as never,
    imageLoaded: true,
  })

  return (
    <div data-testid="live-photo-handler" data-tick={String(tick)}>
      <video ref={videoRef} />
    </div>
  )
}

describe('useLivePhotoHandler', () => {
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
    processVideoMock = vi.fn()
    cleanupMock = vi.fn()

    processVideoMock.mockImplementation(async (_videoSource, videoElement: HTMLVideoElement) => {
      videoElement.setAttribute('src', 'blob:masonry-live-photo')
      return {}
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the masonry live photo video source after loading completes', async () => {
    const data = {
      id: 'photo-1',
      originalUrl: 'https://example.com/photo.jpg',
      video: {
        type: 'live-photo' as const,
        videoUrl: 'https://example.com/photo.mov',
      },
    }

    const { container, rerender } = render(<LivePhotoHandlerHarness data={data} tick={0} />)

    const videoElement = container.querySelector('video')
    expect(videoElement).not.toBeNull()

    await waitFor(() => {
      expect(processVideoMock).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(videoElement?.getAttribute('src')).toBe('blob:masonry-live-photo')
    })

    rerender(
      <LivePhotoHandlerHarness
        data={{
          id: data.id,
          originalUrl: data.originalUrl,
          video: { ...data.video },
        }}
        tick={1}
      />,
    )

    expect(processVideoMock).toHaveBeenCalledTimes(1)
    expect(videoElement?.getAttribute('src')).toBe('blob:masonry-live-photo')
  })
})
