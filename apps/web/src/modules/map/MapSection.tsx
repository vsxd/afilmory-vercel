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
import { debugLog } from "~/lib/debug-log";
import {
  createGeographicRegions,
  createRegionMarkers,
  getRegionLevelForZoom,
} from "~/lib/geo-regions";
import {
  calculateMapBounds,
  convertExifGPSToDecimal,
  convertPhotosToMarkersFromEXIF,
  getInitialViewStateForMarkers,
} from "~/lib/map-utils";
import { MapProvider } from "~/modules/map/MapProvider";
import { usePhotoRepository } from "~/runtime/app-runtime";
import type {
  GeographicRegion,
  GeographicRegionLevel,
  MapBounds,
  MapDisplayMode,
  PhotoMarker,
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
  const photoRepository = usePhotoRepository();
  const displayMode: MapDisplayMode =
    searchParams.get("mode") === "photos" ? "photos" : "regions";

  // Photo markers state and loading logic
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [markers, setMarkers] = useState<PhotoMarker[]>([]);
  const [regionsByLevel, setRegionsByLevel] = useState<
    Record<GeographicRegionLevel, GeographicRegion[]>
  >({
    country: [],
    region: [],
    city: [],
    district: [],
  });
  const [regionLevel, setRegionLevel] =
    useState<GeographicRegionLevel>("country");

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
      newSearchParams.delete("regionId");
      newSearchParams.delete("locationId");
      setSearchParams(newSearchParams, { replace: true });

      // Mark that this is no longer the initial load
      setIsInitialLoad(false);
    },
    [searchParams, setSearchParams],
  );

  const handleRegionClick = useCallback(
    (region: GeographicRegion) => {
      const newSearchParams = new URLSearchParams(searchParams);
      const currentRegionId = searchParams.get("regionId");
      const currentPhotoId = searchParams.get("photoId");
      const isCurrentRegion =
        currentRegionId === region.id ||
        (currentPhotoId ? region.photoIds.includes(currentPhotoId) : false);

      if (isCurrentRegion) {
        newSearchParams.delete("regionId");
      } else {
        newSearchParams.set("regionId", region.id);
      }

      newSearchParams.delete("photoId");
      newSearchParams.delete("mode");
      newSearchParams.delete("locationId");
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
        newSearchParams.delete("regionId");
        newSearchParams.delete("locationId");
      } else {
        newSearchParams.delete("mode");
      }

      setSearchParams(newSearchParams, { replace: true });
      setIsInitialLoad(false);
    },
    [searchParams, setSearchParams],
  );

  const hasRegionData = useMemo(
    () => Object.values(regionsByLevel).some((regions) => regions.length > 0),
    [regionsByLevel],
  );
  const hasGpsFallback = !hasRegionData && markers.length > 0;
  const isMapGpsFallback = displayMode === "regions" && hasGpsFallback;
  const activeRegions = regionsByLevel[regionLevel];
  const regionMarkers = useMemo(
    () => createRegionMarkers(activeRegions),
    [activeRegions],
  );
  const effectiveMapMode: MapDisplayMode = isMapGpsFallback
    ? "photos"
    : displayMode;
  const activeMarkers =
    effectiveMapMode === "regions" ? regionMarkers : markers;
  const bounds = useMemo<MapBounds | null>(() => {
    if (activeMarkers.length === 0) return null;
    return calculateMapBounds(activeMarkers);
  }, [activeMarkers]);

  useEffect(() => {
    if (
      !searchParams.has("locationId") &&
      searchParams.get("mode") !== "locations"
    ) {
      return;
    }

    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete("locationId");
    if (newSearchParams.get("mode") === "locations") {
      newSearchParams.delete("mode");
    }
    setSearchParams(newSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Load photo markers effect
  useEffect(() => {
    const loadPhotoMarkersData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const photos = photoRepository.getPhotos();
        const photoMarkers = convertPhotosToMarkersFromEXIF(photos);

        setMarkers(photoMarkers);
        setRegionsByLevel({
          country: createGeographicRegions(photoMarkers, "country"),
          region: createGeographicRegions(photoMarkers, "region"),
          city: createGeographicRegions(photoMarkers, "city"),
          district: createGeographicRegions(photoMarkers, "district"),
        });
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
  }, [photoRepository, setMarkers]);

  // Parse URL parameters and map photo selections into the active display mode.
  const { latitude, longitude, zoom, selectedPhotoId, selectedRegionId } =
    useMemo(() => {
      const photoIdParam = searchParams.get("photoId");
      const regionIdParam = searchParams.get("regionId");

      if (effectiveMapMode === "regions") {
        const allRegions = Object.values(regionsByLevel).flat();
        const selectedRegion =
          allRegions.find((region) => region.id === regionIdParam) ??
          allRegions.find((region) =>
            photoIdParam ? region.photoIds.includes(photoIdParam) : false,
          );

        if (selectedRegion) {
          return {
            latitude: selectedRegion.latitude,
            longitude: selectedRegion.longitude,
            zoom:
              selectedRegion.level === "country"
                ? 4
                : selectedRegion.level === "region"
                  ? 7
                  : selectedRegion.level === "city"
                    ? 10
                    : 13,
            selectedPhotoId: null,
            selectedRegionId: selectedRegion.id,
          };
        }

        return {
          latitude: null,
          longitude: null,
          zoom: null,
          selectedPhotoId: null,
          selectedRegionId: regionIdParam,
        };
      }

      if (photoIdParam) {
        const marker = markers.find((item) => item.id === photoIdParam);
        const gpsData = marker
          ? { latitude: marker.latitude, longitude: marker.longitude }
          : convertExifGPSToDecimal(
              photoRepository.getPhoto(photoIdParam)?.exif ?? null,
            );

        if (gpsData) {
          return {
            latitude: gpsData.latitude,
            longitude: gpsData.longitude,
            zoom: 15, // Default zoom when coordinates derived from photo
            selectedPhotoId: photoIdParam,
            selectedRegionId: null,
          };
        }
      }

      return {
        latitude: null,
        longitude: null,
        zoom: null,
        selectedPhotoId: photoIdParam,
        selectedRegionId: null,
      };
    }, [effectiveMapMode, markers, photoRepository, regionsByLevel, searchParams]);

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

    // Fall back to GPS photo bounds when region data has not been generated yet.
    return getInitialViewStateForMarkers(
      activeMarkers.length > 0 ? activeMarkers : markers,
    );
  }, [activeMarkers, latitude, longitude, markers, zoom]);

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
        regionsCount={activeRegions.length}
        cityCount={regionsByLevel.city.length}
        photosCount={markers.length}
        regionLevel={regionLevel}
        isGpsFallback={hasGpsFallback}
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
          regions={activeRegions}
          displayMode={effectiveMapMode}
          initialViewState={initialViewState}
          autoFitBounds={
            isInitialLoad && latitude === null && longitude === null
          }
          syncViewStateOnInitialViewStateChange={Boolean(
            selectedPhotoId || selectedRegionId,
          )}
          selectedMarkerId={
            effectiveMapMode === "photos" ? selectedPhotoId : null
          }
          selectedRegionId={
            effectiveMapMode === "regions" ? selectedRegionId : null
          }
          onMarkerClick={handleMarkerClick}
          onRegionClick={handleRegionClick}
          onZoomChange={(zoomValue) => {
            setRegionLevel(getRegionLevelForZoom(zoomValue));
            setIsInitialLoad(false);
          }}
          className="h-full w-full"
        />
      </m.div>
    </div>
  );
};
