import { render } from '@testing-library/react'
import { createStore,Provider } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EventProvider } from '../event-provider'

const setViewportSize = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
    writable: true,
  })
}

describe('EventProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
    delete document.documentElement.dataset.viewport
  })

  it('cancels trailing viewport updates after unmount', () => {
    vi.useFakeTimers()
    setViewportSize(1440, 900)

    const store = createStore()
    const { unmount } = render(
      <Provider store={store}>
        <EventProvider />
      </Provider>,
    )

    expect(document.documentElement.dataset.viewport).toBe('desktop')

    setViewportSize(375, 812)
    window.dispatchEvent(new Event('resize'))

    unmount()
    vi.advanceTimersByTime(32)

    expect(document.documentElement.dataset.viewport).toBe('desktop')
  })
})
