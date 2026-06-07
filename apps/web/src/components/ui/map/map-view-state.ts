export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

export interface MapBoundsLike {
  centerLng: number;
  centerLat: number;
  minLat: number;
  maxLat: number;
  longitudeSpan: number;
}

export function calculateFallbackZoomLevel(
  latDiff: number,
  lngDiff: number,
): number {
  const maxDiff = Math.max(latDiff, lngDiff);

  if (maxDiff < 0.001) return 16;
  if (maxDiff < 0.01) return 14;
  if (maxDiff < 0.1) return 11;
  if (maxDiff < 1) return 8;
  if (maxDiff < 10) return 5;
  return 2;
}

export function createFallbackBoundsViewState(
  bounds: MapBoundsLike,
): MapViewState {
  const latDiff = bounds.maxLat - bounds.minLat;
  const zoom = Math.max(
    calculateFallbackZoomLevel(latDiff, bounds.longitudeSpan) - 1,
    2,
  );

  return {
    longitude: bounds.centerLng,
    latitude: bounds.centerLat,
    zoom,
  };
}

export function createClusterZoomViewState({
  currentViewState,
  longitude,
  latitude,
  maxZoom = 18,
}: {
  currentViewState: MapViewState;
  longitude: number;
  latitude: number;
  maxZoom?: number;
}): MapViewState {
  return {
    ...currentViewState,
    longitude,
    latitude,
    zoom: Math.min(currentViewState.zoom + 2, maxZoom),
  };
}
