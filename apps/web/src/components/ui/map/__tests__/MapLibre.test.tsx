import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Maplibre } from '../MapLibre'

let setProjectionMock: ReturnType<typeof vi.fn>
let fitBoundsMock: ReturnType<typeof vi.fn>
let flyToMock: ReturnType<typeof vi.fn>
let clusterMarkersMock: ReturnType<typeof vi.fn>

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')

  const MockMap = ({
    ref,
    longitude,
    latitude,
    zoom,
    onLoad,
    children,
  }: React.ComponentProps<'div'> & {
    longitude: number
    latitude: number
    zoom: number
    onLoad?: () => void
  } & {
    ref?: React.RefObject<{
      getMap: () => { setProjection: (...args: unknown[]) => void; fitBounds: (...args: unknown[]) => void }
      getContainer: () => { offsetWidth: number; offsetHeight: number }
    } | null | null>
  }) => {
    if (ref && typeof ref === 'object') {
      ref.current = {
        getMap: () => ({
          setProjection: (...args: unknown[]) => setProjectionMock(...args),
          fitBounds: (...args: unknown[]) => fitBoundsMock(...args),
          flyTo: (...args: unknown[]) => flyToMock(...args),
        }),
        getContainer: () => ({
          offsetWidth: 1200,
          offsetHeight: 800,
        }),
      }
    }

    React.useEffect(() => {
      onLoad?.()
    }, [onLoad])

    return (
      <div
        data-testid="map"
        data-longitude={String(longitude)}
        data-latitude={String(latitude)}
        data-zoom={String(zoom)}
      >
        {children}
      </div>
    )
  }

  MockMap.displayName = 'MockMap'

  return { default: MockMap }
})

vi.mock('~/config', () => ({
  siteConfig: {
    mapProjection: 'mercator',
  },
}))

vi.mock('~/lib/map/style', () => ({
  getMapStyle: () => ({}),
}))

vi.mock('../shared', () => ({
  ClusterMarker: ({
    longitude,
    latitude,
    onClusterClick,
  }: {
    longitude: number
    latitude: number
    onClusterClick?: (longitude: number, latitude: number) => void
  }) => <button type="button" data-testid="cluster-marker" onClick={() => onClusterClick?.(longitude, latitude)} />,
  clusterMarkers: (...args: unknown[]) => clusterMarkersMock(...args),
  DEFAULT_MARKERS: [],
  DEFAULT_STYLE: { width: '100%', height: '100%' },
  DEFAULT_VIEW_STATE: { longitude: -122.4, latitude: 37.8, zoom: 14 },
  GeoJsonLayer: () => null,
  MapControls: () => null,
  PhotoMarkerPin: () => null,
}))

describe('Maplibre', () => {
  beforeEach(() => {
    setProjectionMock = vi.fn()
    fitBoundsMock = vi.fn()
    flyToMock = vi.fn()
    clusterMarkersMock = vi.fn(() => [])
  })

  afterEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('syncs the rendered view state when initialViewState changes and autoFitBounds is disabled', () => {
    const { rerender } = render(
      <Maplibre initialViewState={{ longitude: 120, latitude: 30, zoom: 5 }} autoFitBounds={false} markers={[]} />,
    )

    expect(screen.getByTestId('map').dataset.longitude).toBe('120')
    expect(screen.getByTestId('map').dataset.latitude).toBe('30')
    expect(screen.getByTestId('map').dataset.zoom).toBe('5')

    rerender(
      <Maplibre initialViewState={{ longitude: 121.5, latitude: 31.2, zoom: 9 }} autoFitBounds={false} markers={[]} />,
    )

    expect(screen.getByTestId('map').dataset.longitude).toBe('121.5')
    expect(screen.getByTestId('map').dataset.latitude).toBe('31.2')
    expect(screen.getByTestId('map').dataset.zoom).toBe('9')
  })

  it('can preserve the current view state when initialViewState changes after selection is cleared', () => {
    const { rerender } = render(
      <Maplibre
        initialViewState={{ longitude: 120, latitude: 30, zoom: 5 }}
        autoFitBounds={false}
        syncViewStateOnInitialViewStateChange={false}
        markers={[]}
      />,
    )

    expect(screen.getByTestId('map').dataset.longitude).toBe('120')
    expect(screen.getByTestId('map').dataset.latitude).toBe('30')
    expect(screen.getByTestId('map').dataset.zoom).toBe('5')

    rerender(
      <Maplibre
        initialViewState={{ longitude: 0, latitude: 0, zoom: 2 }}
        autoFitBounds={false}
        syncViewStateOnInitialViewStateChange={false}
        markers={[]}
      />,
    )

    expect(screen.getByTestId('map').dataset.longitude).toBe('120')
    expect(screen.getByTestId('map').dataset.latitude).toBe('30')
    expect(screen.getByTestId('map').dataset.zoom).toBe('5')
  })

  it('zooms into a cluster when no external cluster handler is provided', () => {
    const mapRef = { current: null }

    clusterMarkersMock.mockReturnValue([
      {
        type: 'Feature',
        properties: {
          cluster: true,
          point_count: 3,
          marker: undefined,
          clusteredPhotos: [],
        },
        geometry: {
          type: 'Point',
          coordinates: [121.5, 31.2],
        },
      },
    ])

    render(
      <Maplibre
        initialViewState={{ longitude: 120, latitude: 30, zoom: 5 }}
        autoFitBounds={false}
        markers={[]}
        mapRef={mapRef}
      />,
    )

    fireEvent.click(screen.getByTestId('cluster-marker'))

    expect(flyToMock).toHaveBeenCalledWith({
      center: [121.5, 31.2],
      zoom: 7,
      duration: 500,
    })
  })
})
