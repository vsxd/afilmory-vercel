/* eslint-disable react-refresh/only-export-components */

import * as React from "react";
import { lazy } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import type { BaseMapProps, GeographicRegion, PhotoMarker } from "~/types/map";

import type { MapAdapter } from "./map-context";

const Maplibre = lazy(() =>
  import("~/components/ui/map/MapLibre").then((m) => ({ default: m.Maplibre })),
);
/**
 * MapLibre map adapter implementation
 * This adapts MapLibre to work with our generic map provider system
 */
export class MapLibreMapAdapter implements MapAdapter {
  name = "maplibre";

  readonly isAvailable: boolean = true;

  MapComponent = MapLibreMapComponent;

  async initialize(): Promise<void> {
    // MapLibre doesn't require additional async initialization
  }

  cleanup(): void {
    // No cleanup needed for MapLibre
  }
}

/**
 * MapLibre map component that integrates with the Map Provider context
 * This component reads configuration from the MapProvider context
 */
export const MapLibreMapComponent: React.FC<BaseMapProps> = ({
  id,
  initialViewState,
  markers,
  regions,
  displayMode,
  selectedMarkerId,
  selectedRegionId,
  geoJsonData,
  className,
  style,
  handlers,
  autoFitBounds,
  syncViewStateOnInitialViewStateChange,
}) => {
  const mapRef = React.useRef<MapRef>(null);

  // Handle GeoJSON click
  const handleGeoJsonClick = React.useCallback(
    (
      event: maplibregl.MapMouseEvent & {
        features?: maplibregl.GeoJSONFeature[];
      },
    ) => {
      if (!handlers?.onGeoJsonClick) return;

      const feature = event.features?.[0];
      if (feature) {
        handlers.onGeoJsonClick(feature as GeoJSON.Feature);
      }
    },
    [handlers],
  );

  // Handle marker click
  const handleMarkerClick = React.useCallback(
    (marker: PhotoMarker) => {
      handlers?.onMarkerClick?.(marker);
    },
    [handlers],
  );

  const handleRegionClick = React.useCallback(
    (region: GeographicRegion) => {
      handlers?.onRegionClick?.(region);
    },
    [handlers],
  );

  // Handle geolocate
  const handleGeolocate = React.useCallback(
    (longitude: number, latitude: number) => {
      handlers?.onGeolocate?.(longitude, latitude);
    },
    [handlers],
  );

  const handleZoomChange = React.useCallback(
    (zoom: number) => {
      handlers?.onZoomChange?.(zoom);
    },
    [handlers],
  );

  return (
    <Maplibre
      id={id}
      initialViewState={initialViewState}
      markers={markers}
      regions={regions}
      displayMode={displayMode}
      selectedMarkerId={selectedMarkerId}
      selectedRegionId={selectedRegionId}
      geoJsonData={geoJsonData}
      onMarkerClick={handleMarkerClick}
      onRegionClick={handleRegionClick}
      onGeoJsonClick={handleGeoJsonClick}
      onGeolocate={handleGeolocate}
      onZoomChange={handleZoomChange}
      className={className}
      style={style}
      mapRef={mapRef}
      autoFitBounds={autoFitBounds}
      syncViewStateOnInitialViewStateChange={
        syncViewStateOnInitialViewStateChange
      }
    />
  );
};

/**
 * Create a MapLibre adapter instance
 */
export const createMapLibreAdapter = (): MapAdapter => {
  return new MapLibreMapAdapter();
};
