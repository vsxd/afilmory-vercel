export type MapQueryBounds = [number, number, number, number];

export interface MapClusterViewport {
  bounds: MapQueryBounds;
  zoom: number;
}

const VIEWPORT_BUFFER = 0.25;

// Keep longitudes unwrapped: Supercluster handles antimeridian crossings and
// repeated worlds, including a viewport spanning more than one whole world.
export function updateMapClusterViewport(
  previous: MapClusterViewport | null,
  bounds: MapQueryBounds,
  zoom: number,
): MapClusterViewport | null {
  if (!bounds.every(Number.isFinite) || !Number.isFinite(zoom)) return previous;

  const [west, rawSouth, rawEast, rawNorth] = bounds;
  const east = rawEast < west ? rawEast + 360 : rawEast;
  const south = Math.max(-90, rawSouth);
  const north = Math.min(90, rawNorth);
  // Keep the camera level even past Supercluster's max zoom: zooming further
  // must still shrink the queried viewport, although all results are singles.
  const clusterZoom = Math.max(0, Math.floor(zoom));

  if (previous?.zoom === clusterZoom) {
    const [queryWest, querySouth, queryEast, queryNorth] = previous.bounds;
    // A camera may report equivalent longitudes in a different world copy.
    const shift = 360 * Math.round((queryWest + queryEast - west - east) / 720);
    const containsLongitude =
      queryEast - queryWest >= 360 ||
      (west + shift >= queryWest && east + shift <= queryEast);
    if (containsLongitude && south >= querySouth && north <= queryNorth) {
      return previous;
    }
  }

  const longitudeBuffer = (east - west) * VIEWPORT_BUFFER;
  const latitudeBuffer = (north - south) * VIEWPORT_BUFFER;
  return {
    zoom: clusterZoom,
    bounds: [
      west - longitudeBuffer,
      Math.max(-90, south - latitudeBuffer),
      east + longitudeBuffer,
      Math.min(90, north + latitudeBuffer),
    ],
  };
}
