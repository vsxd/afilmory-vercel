import * as React from "react";

import { getInitialViewStateForMarkers } from "~/lib/map-utils";
import { useMapAdapter } from "~/modules/map/map-context";
import type { BaseMapProps, PhotoMarker, ShootingLocation } from "~/types/map";

interface GenericMapProps extends Omit<BaseMapProps, "handlers"> {
  /** Photo markers to display */
  markers?: PhotoMarker[];
  /** Shooting locations to display */
  locations?: ShootingLocation[];
  /** ID of the marker to select */
  selectedMarkerId?: string | null;
  /** ID of the shooting location to select */
  selectedLocationId?: string | null;
  /** Callback when marker is clicked */
  onMarkerClick?: (marker: PhotoMarker) => void;
  /** Callback when shooting location is clicked */
  onLocationClick?: (location: ShootingLocation) => void;
  /** Callback when GeoJSON feature is clicked */
  onGeoJsonClick?: (feature: GeoJSON.Feature) => void;
  /** Callback for geolocation */
  onGeolocate?: (longitude: number, latitude: number) => void;
}

// Default empty array to avoid inline array creation
const DEFAULT_MARKERS: PhotoMarker[] = [];

/**
 * Generic map component that abstracts away the specific map provider
 * This component automatically selects the best available provider from context
 */
export const GenericMap: React.FC<GenericMapProps> = ({
  markers = DEFAULT_MARKERS,
  locations,
  displayMode,
  selectedMarkerId,
  selectedLocationId,
  onMarkerClick,
  onLocationClick,
  onGeoJsonClick,
  onGeolocate,
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
      onLocationClick,
      onGeoJsonClick,
      onGeolocate,
    }),
    [onMarkerClick, onLocationClick, onGeoJsonClick, onGeolocate],
  );

  if (!adapter) {
    return <div>Map provider not available</div>;
  }

  const { MapComponent } = adapter;

  return (
    <MapComponent
      {...props}
      markers={markers}
      locations={locations}
      displayMode={displayMode}
      selectedMarkerId={selectedMarkerId}
      selectedLocationId={selectedLocationId}
      initialViewState={calculatedInitialViewState}
      autoFitBounds={autoFitBounds}
      handlers={handlers}
    />
  );
};
