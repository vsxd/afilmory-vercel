// Styles
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapLibre.css";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ErrorEvent as MapErrorEvent,
  MapMouseEvent,
  MapRef,
} from "react-map-gl/maplibre";
import Map from "react-map-gl/maplibre";

import { siteConfig } from "~/config";
import { canUseWebGL2 } from "~/lib/feature";
import { createRegionMarkers } from "~/lib/geo-regions";
import { maplibre } from "~/lib/map/maplibre";
import { getMapStyle } from "~/lib/map/style";
import { calculateMapBounds } from "~/lib/map-utils";
import type {
  GeographicRegion,
  MapDisplayMode,
  PhotoMarker,
} from "~/types/map";

import {
  createClusterZoomViewState,
  createFallbackBoundsViewState,
} from "./map-view-state";
import type { MapClusterViewport } from "./map-viewport";
import { updateMapClusterViewport } from "./map-viewport";
import {
  ClusterMarker,
  createMarkerClusterIndex,
  createRegionClusterIndex,
  DEFAULT_MARKERS,
  DEFAULT_STYLE,
  DEFAULT_VIEW_STATE,
  GeoJsonLayer,
  getClusterPoints,
  MapControls,
  PhotoMarkerPin,
  RegionMarkerPin,
} from "./shared";

const DEFAULT_REGIONS: GeographicRegion[] = [];
const MAP_DATA_ATTRIBUTION = "© CARTO, © OpenStreetMap contributors";

const MapAttribution = ({ geocodingLabel }: { geocodingLabel: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const label = `${geocodingLabel} | ${MAP_DATA_ATTRIBUTION}`;

  return (
    <div
      className="afilmory-map-attribution"
      data-state={isOpen ? "open" : "closed"}
      data-testid="map-attribution"
    >
      {isOpen && (
        <div className="af-popover afilmory-map-attribution-panel">
          <span>{geocodingLabel}</span>
          <span aria-hidden="true">|</span>
          <a
            href="https://carto.com/attributions"
            target="_blank"
            rel="noreferrer noopener"
          >
            © CARTO
          </a>
          <span aria-hidden="true">,</span>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer noopener"
          >
            © OpenStreetMap contributors
          </a>
        </div>
      )}
      <button
        type="button"
        className="afilmory-map-attribution-button"
        aria-label={label}
        aria-expanded={isOpen}
        title={label}
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="af-glass" aria-hidden="true">
          i
        </span>
      </button>
    </div>
  );
};

export interface PureMaplibreProps {
  id?: string;
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  markers?: PhotoMarker[];
  regions?: GeographicRegion[];
  displayMode?: MapDisplayMode;
  selectedMarkerId?: string | null;
  selectedRegionId?: string | null;
  geoJsonData?: GeoJSON.FeatureCollection;
  onMarkerClick?: (marker: PhotoMarker) => void;
  onRegionClick?: (region: GeographicRegion) => void;
  onGeoJsonClick?: (event: MapMouseEvent) => void;
  onGeolocate?: (longitude: number, latitude: number) => void;
  onZoomChange?: (zoom: number) => void;
  onViewStateChange?: (view: import("~/types/map/core").MapViewState) => void;
  onClusterClick?: (longitude: number, latitude: number) => void;
  className?: string;
  style?: React.CSSProperties;
  mapRef?: React.RefObject<MapRef | null>;
  autoFitBounds?: boolean;
  syncViewStateOnInitialViewStateChange?: boolean;
}

export const Maplibre = ({
  id,
  initialViewState = DEFAULT_VIEW_STATE,
  markers = DEFAULT_MARKERS,
  regions = DEFAULT_REGIONS,
  displayMode = "regions",
  selectedMarkerId,
  selectedRegionId,
  geoJsonData,
  onMarkerClick,
  onRegionClick,
  onGeoJsonClick,
  onGeolocate,
  onZoomChange,
  onViewStateChange,
  onClusterClick,
  className = "w-full h-full",
  style = DEFAULT_STYLE,
  mapRef,
  autoFitBounds = true,
  syncViewStateOnInitialViewStateChange = true,
}: PureMaplibreProps) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion() === true;
  const internalMapRef = useRef<MapRef | null>(null);
  const resolvedMapRef = mapRef ?? internalMapRef;
  const [viewState, setViewState] = useState(initialViewState);
  const [clusterViewport, setClusterViewport] =
    useState<MapClusterViewport | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [hasInitialFitCompleted, setHasInitialFitCompleted] = useState(false);
  const fitMarkers = useMemo(
    () => (displayMode === "regions" ? createRegionMarkers(regions) : markers),
    [displayMode, regions, markers],
  );

  // Handle marker click - only call the external callback
  const handleMarkerClick = useCallback(
    (marker: PhotoMarker) => {
      onMarkerClick?.(marker);
    },
    [onMarkerClick],
  );

  // Handle marker close - call onMarkerClick with the currently selected marker to toggle it off
  const handleMarkerClose = useCallback(() => {
    if (selectedMarkerId && onMarkerClick) {
      // Find the currently selected marker and call onMarkerClick to deselect it
      const selectedMarker = markers.find(
        (marker) => marker.id === selectedMarkerId,
      );
      if (selectedMarker) {
        onMarkerClick(selectedMarker);
      }
    }
  }, [selectedMarkerId, onMarkerClick, markers]);

  const handleRegionClick = useCallback(
    (region: GeographicRegion) => {
      onRegionClick?.(region);
    },
    [onRegionClick],
  );

  const handleRegionClose = useCallback(() => {
    if (selectedRegionId && onRegionClick) {
      const selectedRegion = regions.find(
        (region) => region.id === selectedRegionId,
      );
      if (selectedRegion) {
        onRegionClick(selectedRegion);
      }
    }
  }, [selectedRegionId, onRegionClick, regions]);

  useEffect(() => {
    if (autoFitBounds || !syncViewStateOnInitialViewStateChange) {
      return;
    }

    setViewState(initialViewState);
  }, [initialViewState, autoFitBounds, syncViewStateOnInitialViewStateChange]);

  const updateViewport = useCallback(
    (force = false) => {
      const map = resolvedMapRef.current?.getMap();
      if (!map) return;
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      setClusterViewport((previous) =>
        updateMapClusterViewport(
          force ? null : previous,
          [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
          ],
          zoom,
        ),
      );
    },
    [resolvedMapRef],
  );

  // Read after react-map-gl applies controlled camera props in its layout
  // effect. This also covers URL selection, restored views and single-photo
  // auto-fit, whose programmatic camera changes do not emit onMove callbacks.
  useEffect(() => {
    if (isMapLoaded) updateViewport();
  }, [isMapLoaded, viewState, updateViewport]);

  // Rebuild only for data changes. Small pans inside the buffered viewport and
  // fractional zoom changes reuse the same query result.
  const clusterIndex = useMemo(
    () =>
      displayMode === "regions"
        ? createRegionClusterIndex(regions)
        : createMarkerClusterIndex(markers),
    [displayMode, regions, markers],
  );
  const clusteredMarkers = useMemo(
    () =>
      clusterViewport
        ? getClusterPoints(
            clusterIndex,
            clusterViewport.zoom,
            clusterViewport.bounds,
          )
        : [],
    [clusterIndex, clusterViewport],
  );
  const selectedRegion = useMemo(
    () =>
      displayMode === "regions" && selectedRegionId
        ? regions.find((item) => item.id === selectedRegionId)
        : undefined,
    [displayMode, regions, selectedRegionId],
  );
  const selectedMarker = useMemo(
    () =>
      displayMode === "photos" && selectedMarkerId
        ? markers.find((item) => item.id === selectedMarkerId)
        : selectedRegion?.representativeMarker,
    [displayMode, markers, selectedMarkerId, selectedRegion],
  );
  const visibleMarkers = useMemo(() => {
    // Keep an explicitly selected pin available even if it was clustered or
    // panned just outside the query. Only retain selections in the current
    // data set, so changing filters cannot resurrect a removed photo/region.
    const region = selectedRegion;
    const marker = selectedMarker;
    if (
      !marker ||
      clusteredMarkers.some(
        (point) =>
          !point.properties.cluster &&
          (region
            ? point.properties.region?.id === region.id
            : point.properties.marker?.id === marker.id),
      )
    )
      return clusteredMarkers;
    return [
      ...clusteredMarkers,
      {
        type: "Feature" as const,
        properties: { marker, region },
        geometry: {
          type: "Point" as const,
          coordinates: [
            region?.longitude ?? marker.longitude,
            region?.latitude ?? marker.latitude,
          ] as [number, number],
        },
      },
    ];
  }, [clusteredMarkers, selectedMarker, selectedRegion]);

  useEffect(() => {
    setHasInitialFitCompleted(false);
  }, [displayMode]);

  const handleClusterClick = useCallback(
    (longitude: number, latitude: number) => {
      if (onClusterClick) {
        onClusterClick(longitude, latitude);
        return;
      }

      const map = resolvedMapRef.current?.getMap?.();
      const nextViewState = createClusterZoomViewState({
        currentViewState: viewState,
        longitude,
        latitude,
      });

      if (map) {
        map.flyTo({
          center: [longitude, latitude],
          zoom: nextViewState.zoom,
          duration: shouldReduceMotion ? 0 : 500,
        });
        return;
      }

      setViewState(nextViewState);
    },
    [resolvedMapRef, onClusterClick, shouldReduceMotion, viewState],
  );

  // 自动适配到包含所有照片的区域 - 只在初次加载时执行
  const fitMapToBounds = useCallback(() => {
    if (
      !autoFitBounds ||
      fitMarkers.length === 0 ||
      !isMapLoaded ||
      hasInitialFitCompleted
    )
      return;

    const bounds = calculateMapBounds(fitMarkers);
    if (!bounds) return;

    // 标记初次适配已完成
    setHasInitialFitCompleted(true);

    // 如果只有一个点，设置默认缩放级别
    if (fitMarkers.length === 1) {
      const newViewState = {
        longitude: fitMarkers[0].longitude,
        latitude: fitMarkers[0].latitude,
        zoom: 13, // 单点时的合理缩放级别
      };
      setViewState(newViewState);
      return;
    }

    // 使用 mapRef 的 fitBounds 方法（推荐方式）
    if (resolvedMapRef.current?.getMap) {
      // 计算动态padding，确保照片区域控制在窗口的80%内
      // 这意味着每边留出10%的空间作为缓冲区
      const mapContainer = resolvedMapRef.current.getContainer();
      const containerWidth = mapContainer.offsetWidth;
      const containerHeight = mapContainer.offsetHeight;

      const paddingPercentage = 0.1; // 每边10%的padding
      const horizontalPadding = containerWidth * paddingPercentage;
      const verticalPadding = containerHeight * paddingPercentage;

      const padding = {
        top: Math.max(verticalPadding, 40), // 最小40px
        bottom: Math.max(verticalPadding, 40),
        left: Math.max(horizontalPadding, 40),
        right: Math.max(horizontalPadding, 40),
      };

      try {
        const map = resolvedMapRef.current.getMap();
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat], // 西南角
            [bounds.maxLng, bounds.maxLat], // 东北角
          ],
          {
            padding,
            duration: shouldReduceMotion ? 0 : 800,
            maxZoom: 15, // 最大缩放级别限制，避免过度放大
          },
        );
      } catch (error) {
        console.warn("使用 fitBounds 失败，使用备用方案:", error);
        // 备用方案：手动计算视图状态
        fallbackToViewState(bounds);
      }
    } else {
      // mapRef 不可用时的备用方案
      fallbackToViewState(bounds);
    }

    function fallbackToViewState(
      bounds: ReturnType<typeof calculateMapBounds>,
    ) {
      if (!bounds) return;

      const newViewState = createFallbackBoundsViewState(bounds);

      setViewState(newViewState);
    }
  }, [
    fitMarkers,
    autoFitBounds,
    isMapLoaded,
    resolvedMapRef,
    hasInitialFitCompleted,
    shouldReduceMotion,
  ]);

  // 当地图加载完成时触发适配
  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true);
    if (resolvedMapRef.current?.getMap) {
      const map = resolvedMapRef.current.getMap();
      const projectionType = siteConfig.mapProjection || "mercator";
      map.setProjection({
        type: projectionType,
      });
    }
  }, [resolvedMapRef]);

  const handleMapError = useCallback((event: MapErrorEvent) => {
    // MapLibre aborts outstanding style/tile requests during normal unmount.
    // Suppress that expected teardown event but preserve all real map errors.
    if (/signal is aborted/i.test(event.error.message)) return;
    console.error(event.error);
  }, []);

  // 当标记点变化时，重新适配边界
  useEffect(() => {
    // 延迟执行，确保地图已渲染
    const timer = setTimeout(() => {
      fitMapToBounds();
    }, 100);

    return () => clearTimeout(timer);
  }, [fitMapToBounds]);

  if (!canUseWebGL2) {
    return (
      <div className={`afilmory-map ${className}`} style={style}>
        <div role="status" className="flex h-full items-center justify-center">
          {t("explore.map.error.title")}
        </div>
      </div>
    );
  }

  return (
    <div className={`afilmory-map ${className}`} style={style}>
      <Map
        mapLib={maplibre}
        id={id}
        ref={resolvedMapRef}
        {...viewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle={getMapStyle()}
        attributionControl={false}
        interactiveLayerIds={geoJsonData ? ["data"] : undefined}
        onClick={onGeoJsonClick}
        onError={handleMapError}
        onLoad={handleMapLoad}
        onResize={() => updateViewport(true)}
        onMove={(evt) => {
          setViewState(evt.viewState);
          onViewStateChange?.(evt.viewState);
          onZoomChange?.(evt.viewState.zoom);
        }}
      >
        {/* Map Controls */}
        <MapControls onGeolocate={onGeolocate} />
        <MapAttribution geocodingLabel={t("explore.attribution.geocoding")} />

        {/* Photo Markers */}
        {visibleMarkers.map((clusterPoint) => {
          if (
            clusterPoint.properties.cluster &&
            clusterPoint.properties.cluster_id !== undefined
          ) {
            // Render cluster marker
            return (
              <ClusterMarker
                key={`cluster-${displayMode}-${clusterPoint.properties.cluster_id}`}
                longitude={clusterPoint.geometry.coordinates[0]}
                latitude={clusterPoint.geometry.coordinates[1]}
                pointCount={clusterPoint.properties.point_count || 0}
                displayMode={displayMode}
                clusterIndex={clusterIndex}
                clusterId={clusterPoint.properties.cluster_id}
                previewPhotos={clusterPoint.properties.previewPhotos}
                onClusterClick={handleClusterClick}
              />
            );
          }

          if (clusterPoint.properties.region) {
            const { region } = clusterPoint.properties;
            return (
              <RegionMarkerPin
                key={region.id}
                region={region}
                isSelected={selectedRegionId === region.id}
                onClick={handleRegionClick}
                onClose={handleRegionClose}
              />
            );
          }

          // Render individual marker
          const { marker } = clusterPoint.properties;
          if (!marker) return null;

          return (
            <PhotoMarkerPin
              key={marker.id}
              marker={marker}
              isSelected={selectedMarkerId === marker.id}
              onClick={handleMarkerClick}
              onClose={handleMarkerClose}
            />
          );
        })}

        {/* GeoJSON Layer */}
        {geoJsonData && <GeoJsonLayer data={geoJsonData} />}
      </Map>
    </div>
  );
};
