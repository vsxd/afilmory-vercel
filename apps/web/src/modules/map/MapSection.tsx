import { m } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import {
  GenericMap,
  MapBackButton,
  MapInfoPanel,
  MapLoadingState,
} from "~/components/ui/map";
import { photoLoader } from "~/data-runtime/photo-loader";
import { debugLog } from "~/lib/debug-log";
import {
  createLocationMarkers,
  createShootingLocations,
} from "~/lib/location-clusters";
import {
  calculateMapBounds,
  convertExifGPSToDecimal,
  convertPhotosToMarkersFromEXIF,
  getInitialViewStateForMarkers,
} from "~/lib/map-utils";
import { MapProvider } from "~/modules/map/MapProvider";
import type {
  MapBounds,
  MapDisplayMode,
  PhotoMarker,
  ShootingLocation,
} from "~/types/map";

export const MapSection = () => {
  return (
    <MapProvider>
      <MapSectionContent />
    </MapProvider>
  );
};

const MapSectionContent = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const displayMode: MapDisplayMode =
    searchParams.get("mode") === "photos" ? "photos" : "locations";

  // Photo markers state and loading logic
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [markers, setMarkers] = useState<PhotoMarker[]>([]);
  const [shootingLocations, setShootingLocations] = useState<
    ShootingLocation[]
  >([]);

  // Track if this is the initial load to control auto fit bounds
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Handle marker click - update URL parameters
  const handleMarkerClick = useCallback(
    (marker: PhotoMarker) => {
      const newSearchParams = new URLSearchParams(searchParams);

      // Check if this marker is already selected
      const currentPhotoId = searchParams.get("photoId");

      if (currentPhotoId === marker.id) {
        // If already selected, deselect by removing the photoId parameter
        newSearchParams.delete("photoId");
      } else {
        // Select the new marker
        newSearchParams.set("photoId", marker.id);
      }

      newSearchParams.set("mode", "photos");
      newSearchParams.delete("locationId");
      setSearchParams(newSearchParams, { replace: true });

      // Mark that this is no longer the initial load
      setIsInitialLoad(false);
    },
    [searchParams, setSearchParams],
  );

  const handleLocationClick = useCallback(
    (location: ShootingLocation) => {
      const newSearchParams = new URLSearchParams(searchParams);
      const currentLocationId = searchParams.get("locationId");
      const currentPhotoId = searchParams.get("photoId");
      const isCurrentLocation =
        currentLocationId === location.id ||
        (currentPhotoId ? location.photoIds.includes(currentPhotoId) : false);

      if (isCurrentLocation) {
        newSearchParams.delete("locationId");
      } else {
        newSearchParams.set("locationId", location.id);
      }

      newSearchParams.delete("photoId");
      newSearchParams.delete("mode");
      setSearchParams(newSearchParams, { replace: true });
      setIsInitialLoad(false);
    },
    [searchParams, setSearchParams],
  );

  const handleDisplayModeChange = useCallback(
    (nextMode: MapDisplayMode) => {
      const newSearchParams = new URLSearchParams(searchParams);

      if (nextMode === "photos") {
        newSearchParams.set("mode", "photos");
        newSearchParams.delete("locationId");
      } else {
        newSearchParams.delete("mode");
      }

      setSearchParams(newSearchParams, { replace: true });
      setIsInitialLoad(false);
    },
    [searchParams, setSearchParams],
  );

  const locationMarkers = useMemo(
    () => createLocationMarkers(shootingLocations),
    [shootingLocations],
  );
  const activeMarkers = displayMode === "locations" ? locationMarkers : markers;
  const bounds = useMemo<MapBounds | null>(() => {
    if (activeMarkers.length === 0) return null;
    return calculateMapBounds(activeMarkers);
  }, [activeMarkers]);

  // Load photo markers effect
  useEffect(() => {
    const loadPhotoMarkersData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const photos = photoLoader.getPhotos();
        const photoMarkers = convertPhotosToMarkersFromEXIF(photos);

        setMarkers(photoMarkers);
        setShootingLocations(createShootingLocations(photoMarkers));
        debugLog(`Found ${photoMarkers.length} photos with GPS coordinates`);
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("Failed to load photo markers");
        setError(error);
        console.error("Failed to load photo markers:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPhotoMarkersData();
  }, [setMarkers]);

  // Parse URL parameters and map photo selections into the active display mode.
  const { latitude, longitude, zoom, selectedPhotoId, selectedLocationId } =
    useMemo(() => {
      const photoIdParam = searchParams.get("photoId");
      const locationIdParam = searchParams.get("locationId");

      if (displayMode === "locations") {
        const selectedLocation =
          shootingLocations.find(
            (location) => location.id === locationIdParam,
          ) ??
          shootingLocations.find((location) =>
            photoIdParam ? location.photoIds.includes(photoIdParam) : false,
          );

        if (selectedLocation) {
          return {
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
            zoom: 15,
            selectedPhotoId: null,
            selectedLocationId: selectedLocation.id,
          };
        }

        return {
          latitude: null,
          longitude: null,
          zoom: null,
          selectedPhotoId: null,
          selectedLocationId: locationIdParam,
        };
      }

      if (photoIdParam) {
        const marker = markers.find((item) => item.id === photoIdParam);
        const gpsData = marker
          ? { latitude: marker.latitude, longitude: marker.longitude }
          : convertExifGPSToDecimal(
              photoLoader.getPhoto(photoIdParam)?.exif ?? null,
            );

        if (gpsData) {
          return {
            latitude: gpsData.latitude,
            longitude: gpsData.longitude,
            zoom: 15, // Default zoom when coordinates derived from photo
            selectedPhotoId: photoIdParam,
            selectedLocationId: null,
          };
        }
      }

      return {
        latitude: null,
        longitude: null,
        zoom: null,
        selectedPhotoId: photoIdParam,
        selectedLocationId: null,
      };
    }, [displayMode, markers, searchParams, shootingLocations]);

  // Initial view state calculation - handle URL parameters
  const initialViewState = useMemo(() => {
    if (latitude !== null && longitude !== null) {
      // Use URL parameters if provided
      return {
        latitude,
        longitude,
        zoom: zoom ?? 15,
      };
    }

    // Fall back to markers-based view state
    return getInitialViewStateForMarkers(activeMarkers);
  }, [activeMarkers, latitude, longitude, zoom]);

  // Show loading state
  if (isLoading) {
    return <MapLoadingState />;
  }

  // Show error state
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-4xl">❌</div>
          <div className="text-lg font-medium text-red-900 dark:text-red-100">
            {t("explore.map.error.title")}
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">
            {t("explore.map.error.description")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute h-full w-full">
      {/* Back button */}
      <MapBackButton />

      {/* Map info panel */}
      <MapInfoPanel
        displayMode={displayMode}
        locationsCount={shootingLocations.length}
        photosCount={markers.length}
        bounds={bounds}
        onDisplayModeChange={handleDisplayModeChange}
      />

      {/* Generic Map component */}
      <m.div
        initial={{ opacity: 0, scale: 1.02 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="h-full w-full"
      >
        <GenericMap
          markers={markers}
          locations={shootingLocations}
          displayMode={displayMode}
          initialViewState={initialViewState}
          autoFitBounds={
            isInitialLoad && latitude === null && longitude === null
          }
          syncViewStateOnInitialViewStateChange={Boolean(
            selectedPhotoId || selectedLocationId,
          )}
          selectedMarkerId={displayMode === "photos" ? selectedPhotoId : null}
          selectedLocationId={
            displayMode === "locations" ? selectedLocationId : null
          }
          onMarkerClick={handleMarkerClick}
          onLocationClick={handleLocationClick}
          className="h-full w-full"
        />
      </m.div>
    </div>
  );
};
