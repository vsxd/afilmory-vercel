import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MiniMap } from '../MiniMap'

vi.mock('maplibre-gl', () => ({}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')

  const MockMap = ({ onLoad }: { onLoad?: () => void }) => {
    React.useEffect(() => {
      onLoad?.()
    }, [onLoad])

    return <div data-testid="mini-map-canvas" />
  }

  return { default: MockMap }
})

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('~/lib/map/style', () => ({
  getMapStyle: () => ({}),
}))

describe('MiniMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'URL',
      Object.assign(globalThis.URL ?? {}, {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
      }),
    )
  })

  it('renders when one coordinate is zero but the GPS pair is still valid', () => {
    render(<MiniMap latitude={0} longitude={120.5} photoId="photo-1" />)

    expect(screen.getByTestId('mini-map-canvas')).not.toBeNull()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/explore?photoId=photo-1')
  })
})
