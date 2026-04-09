import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyAccentTransitionStyle, getAccentTransitionStyle } from '../accent-transition-style'

describe('accent transition style', () => {
  afterEach(() => {
    vi.useRealTimers()
    getAccentTransitionStyle()?.remove()
  })

  it('removes the temporary style when cleanup runs before the timeout', () => {
    vi.useFakeTimers()

    const cleanup = applyAccentTransitionStyle(100)

    expect(getAccentTransitionStyle()).not.toBeNull()

    cleanup()

    expect(getAccentTransitionStyle()).toBeNull()

    vi.runAllTimers()

    expect(getAccentTransitionStyle()).toBeNull()
  })

  it('removes the temporary style automatically after the timeout', () => {
    vi.useFakeTimers()

    applyAccentTransitionStyle(100)

    expect(getAccentTransitionStyle()).not.toBeNull()

    vi.advanceTimersByTime(100)

    expect(getAccentTransitionStyle()).toBeNull()
  })
})
