import { afterEach, describe, expect, it, vi } from 'vitest'

import { installPhotoPagePrefetch, isPhotoPageIntentTarget } from '../photo-page-prefetch'

const MODULE_KEY = './pages/(main)/photos/[photoId]/index.tsx'

describe('photo-page-prefetch', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    delete (window as Partial<Window>).requestIdleCallback
    delete (window as Partial<Window>).cancelIdleCallback
    vi.useRealTimers()
  })

  it('prefetches the photo page after the startup warmup delay', () => {
    vi.useFakeTimers()

    const prefetchModule = vi.fn().mockResolvedValue()
    const cleanup = installPhotoPagePrefetch({ [MODULE_KEY]: prefetchModule })

    expect(prefetchModule).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)

    expect(prefetchModule).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)

    expect(prefetchModule).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('cancels the startup warmup when cleaned up first', () => {
    vi.useFakeTimers()

    const prefetchModule = vi.fn().mockResolvedValue()
    const cleanup = installPhotoPagePrefetch({ [MODULE_KEY]: prefetchModule })

    cleanup()
    vi.advanceTimersByTime(1500)

    expect(prefetchModule).not.toHaveBeenCalled()
  })

  it('uses browser idle time when available for startup warmup', () => {
    vi.useFakeTimers()

    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      return window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 10 }), 1)
    })
    const cancelIdleCallback = vi.fn((handle: number) => window.clearTimeout(handle))
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: requestIdleCallback,
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: cancelIdleCallback,
    })

    const prefetchModule = vi.fn().mockResolvedValue()
    const cleanup = installPhotoPagePrefetch({ [MODULE_KEY]: prefetchModule })

    vi.advanceTimersByTime(1500)

    expect(requestIdleCallback).toHaveBeenCalledTimes(1)
    expect(prefetchModule).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(prefetchModule).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('prefetches immediately when a photo link receives pointer intent', () => {
    vi.useFakeTimers()

    const prefetchModule = vi.fn().mockResolvedValue()
    const cleanup = installPhotoPagePrefetch({ [MODULE_KEY]: prefetchModule })

    const link = document.createElement('a')
    link.href = '/photos/demo'
    const child = document.createElement('span')
    link.append(child)
    document.body.append(link)

    child.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    expect(prefetchModule).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1500)
    expect(prefetchModule).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('detects only photo page navigation targets', () => {
    const photoLink = document.createElement('a')
    photoLink.href = '/photos/demo'
    const photoLinkChild = document.createElement('span')
    photoLink.append(photoLinkChild)

    const nonPhotoLink = document.createElement('a')
    nonPhotoLink.href = '/about'
    const nonPhotoLinkChild = document.createElement('span')
    nonPhotoLink.append(nonPhotoLinkChild)

    expect(isPhotoPageIntentTarget(photoLinkChild)).toBe(true)
    expect(isPhotoPageIntentTarget(nonPhotoLinkChild)).toBe(false)
    expect(isPhotoPageIntentTarget(null)).toBe(false)
  })
})
