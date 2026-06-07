// Styles
import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MapMouseEvent, MapRef } from "react-map-gl/maplibre";
import Map from "react-map-gl/maplibre";

import { siteConfig } from "~/config";
import { createRegionMarkers } from "~/lib/geo-regions";
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
import {
  ClusterMarker,
  clusterMarkers,
  clusterRegions,
  DEFAULT_MARKERS,
  DEFAULT_STYLE,
  DEFAULT_VIEW_STATE,
  GeoJsonLayer,
  MapControls,
  PhotoMarkerPin,
  RegionMarkerPin,
} from "./shared";

const DEFAULT_REGIONS: GeographicRegion[] = [];

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
  onClusterClick,
  className = "w-full h-full",
  style = DEFAULT_STYLE,
  mapRef,
  autoFitBounds = true,
  syncViewStateOnInitialViewStateChange = true,
}: PureMaplibreProps) => {
  const { t } = useTranslation();
  const [currentZoom, setCurrentZoom] = useState(initialViewState.zoom);
  const [viewState, setViewState] = useState(initialViewState);
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
    setCurrentZoom(initialViewState.zoom);
  }, [initialViewState, autoFitBounds, syncViewStateOnInitialViewStateChange]);

  // Clustered markers
  const clusteredMarkers = useMemo(
    () =>
      displayMode === "regions"
        ? clusterRegions(regions, currentZoom)
        : clusterMarkers(markers, currentZoom),
    [displayMode, regions, markers, currentZoom],
  );

  useEffect(() => {
    setHasInitialFitCompleted(false);
  }, [displayMode]);

  const handleClusterClick = useCallback(
    (longitude: number, latitude: number) => {
      if (onClusterClick) {
        onClusterClick(longitude, latitude);
        return;
      }

      const map = mapRef?.current?.getMap?.();
      const nextViewState = createClusterZoomViewState({
        currentViewState: viewState,
        longitude,
        latitude,
      });

      if (map) {
        map.flyTo({
          center: [longitude, latitude],
          zoom: nextViewState.zoom,
          duration: 500,
        });
        return;
      }

      setViewState(nextViewState);
      setCurrentZoom(nextViewState.zoom);
    },
    [mapRef, onClusterClick, viewState],
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
      setCurrentZoom(newViewState.zoom);
      return;
    }

    // 使用 mapRef 的 fitBounds 方法（推荐方式）
    if (mapRef?.current?.getMap) {
      // 计算动态padding，确保照片区域控制在窗口的80%内
      // 这意味着每边留出10%的空间作为缓冲区
      const mapContainer = mapRef.current.getContainer();
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
        const map = mapRef.current.getMap();
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat], // 西南角
            [bounds.maxLng, bounds.maxLat], // 东北角
          ],
          {
            padding,
            duration: 800, // 平滑动画
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
      setCurrentZoom(newViewState.zoom);
    }
  }, [fitMarkers, autoFitBounds, isMapLoaded, mapRef, hasInitialFitCompleted]);

  // 当地图加载完成时触发适配
  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true);
    if (mapRef?.current?.getMap) {
      const map = mapRef.current.getMap();
      const projectionType = siteConfig.mapProjection || "mercator";
      map.setProjection({
        type: projectionType,
      });
    }
  }, [mapRef]);

  // 当标记点变化时，重新适配边界
  useEffect(() => {
    // 延迟执行，确保地图已渲染
    const timer = setTimeout(() => {
      fitMapToBounds();
    }, 100);

    return () => clearTimeout(timer);
  }, [fitMapToBounds]);

  return (
    <div className={className} style={style}>
      <Map
        id={id}
        ref={mapRef}
        {...viewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle={getMapStyle()}
        attributionControl={{
          compact: true,
          customAttribution: t("explore.attribution.geocoding"),
        }}
        interactiveLayerIds={geoJsonData ? ["data"] : undefined}
        onClick={onGeoJsonClick}
        onLoad={handleMapLoad}
        onMove={(evt) => {
          setCurrentZoom(evt.viewState.zoom);
          setViewState(evt.viewState);
          onZoomChange?.(evt.viewState.zoom);
        }}
      >
        {/* Map Controls */}
        <MapControls onGeolocate={onGeolocate} />

        {/* Photo Markers */}
        {clusteredMarkers.map((clusterPoint) => {
          if (clusterPoint.properties.cluster) {
            // Render cluster marker
            return (
              <ClusterMarker
                key={`cluster-${clusterPoint.geometry.coordinates[0]}-${clusterPoint.geometry.coordinates[1]}`}
                longitude={clusterPoint.geometry.coordinates[0]}
                latitude={clusterPoint.geometry.coordinates[1]}
                pointCount={clusterPoint.properties.point_count || 0}
                displayMode={displayMode}
                representativeMarker={clusterPoint.properties.marker}
                clusteredPhotos={clusterPoint.properties.clusteredPhotos}
                clusteredRegions={clusterPoint.properties.clusteredRegions}
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
