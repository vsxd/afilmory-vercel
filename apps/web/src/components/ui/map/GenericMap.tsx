import * as React from "react";

import { getInitialViewStateForMarkers } from "~/lib/map-utils";
import { useMapAdapter } from "~/modules/map/map-context";
import type { BaseMapProps, GeographicRegion, PhotoMarker } from "~/types/map";

interface GenericMapProps extends Omit<BaseMapProps, "handlers"> {
  /** Photo markers to display */
  markers?: PhotoMarker[];
  /** Geographic regions to display */
  regions?: GeographicRegion[];
  /** ID of the marker to select */
  selectedMarkerId?: string | null;
  /** ID of the geographic region to select */
  selectedRegionId?: string | null;
  /** Callback when marker is clicked */
  onMarkerClick?: (marker: PhotoMarker) => void;
  /** Callback when geographic region is clicked */
  onRegionClick?: (region: GeographicRegion) => void;
  /** Callback when GeoJSON feature is clicked */
  onGeoJsonClick?: (feature: GeoJSON.Feature) => void;
  /** Callback for geolocation */
  onGeolocate?: (longitude: number, latitude: number) => void;
  /** Callback when map zoom changes */
  onZoomChange?: (zoom: number) => void;
}

// Default empty array to avoid inline array creation
const DEFAULT_MARKERS: PhotoMarker[] = [];

/**
 * Generic map component that abstracts away the specific map provider
 * This component automatically selects the best available provider from context
 */
export const GenericMap: React.FC<GenericMapProps> = ({
  markers = DEFAULT_MARKERS,
  regions,
  displayMode,
  selectedMarkerId,
  selectedRegionId,
  onMarkerClick,
  onRegionClick,
  onGeoJsonClick,
  onGeolocate,
  onZoomChange,
  initialViewState,
  autoFitBounds = true,
  ...props
}) => {
  const adapter = useMapAdapter();
  // Calculate initial view state from markers (only if autoFitBounds is disabled)
  const calculatedInitialViewState = React.useMemo(() => {
    if (autoFitBounds) {
      // 如果开启自动适配，则使用传入的initialViewState或默认值
      return initialViewState || { longitude: 0, latitude: 0, zoom: 2 };
    }
    return initialViewState || getInitialViewStateForMarkers(markers);
  }, [initialViewState, markers, autoFitBounds]);

  // Prepare handlers for the specific map adapter
  const handlers = React.useMemo(
    () => ({
      onMarkerClick,
      onRegionClick,
      onGeoJsonClick,
      onGeolocate,
      onZoomChange,
    }),
    [onMarkerClick, onRegionClick, onGeoJsonClick, onGeolocate, onZoomChange],
  );

  if (!adapter) {
    return <div>Map provider not available</div>;
  }

  const { MapComponent } = adapter;

  return (
    <MapComponent
      {...props}
      markers={markers}
      regions={regions}
      displayMode={displayMode}
      selectedMarkerId={selectedMarkerId}
      selectedRegionId={selectedRegionId}
      initialViewState={calculatedInitialViewState}
      autoFitBounds={autoFitBounds}
      handlers={handlers}
    />
  );
};
