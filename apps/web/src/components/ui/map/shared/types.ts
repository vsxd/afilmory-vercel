import type { LayerProps as MapLibreLayerProps } from "react-map-gl/maplibre";

import type {
  GeographicRegion,
  MapDisplayMode,
  PhotoMarker,
} from "~/types/map";

// LayerProps type definition for compatibility
export type LayerProps = MapLibreLayerProps;

// Clustering utilities
export interface ClusterPoint {
  type: "Feature";
  properties: {
    cluster?: boolean;
    cluster_id?: number;
    point_count?: number;
    point_count_abbreviated?: string;
    marker?: PhotoMarker;
    clusteredPhotos?: PhotoMarker[];
    region?: GeographicRegion;
    clusteredRegions?: GeographicRegion[];
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

// Common interfaces
export interface GeoJsonLayerProps {
  data: GeoJSON.FeatureCollection;
  layerStyle?: LayerProps;
}

export interface MapControlsProps {
  onGeolocate?: (longitude: number, latitude: number) => void;
}

export interface PhotoMarkerPinProps {
  marker: PhotoMarker;
  isSelected?: boolean;
  onClick?: (marker: PhotoMarker) => void;
  onClose?: () => void;
}

export interface ClusterMarkerProps {
  longitude: number;
  latitude: number;
  pointCount: number;
  displayMode?: MapDisplayMode;
  representativeMarker?: PhotoMarker;
  clusteredPhotos?: PhotoMarker[];
  clusteredRegions?: GeographicRegion[];
  onClusterClick?: (longitude: number, latitude: number) => void;
}

// Default values
export const DEFAULT_VIEW_STATE = {
  longitude: -122.4,
  latitude: 37.8,
  zoom: 14,
};

export const DEFAULT_MARKERS: PhotoMarker[] = [];
export const DEFAULT_STYLE = { width: "100%", height: "100%" };

export const DEFAULT_LAYER_STYLE: LayerProps = {
  id: "data",
  type: "fill",
  paint: {
    "fill-color": "#0080ff",
    "fill-opacity": 0.5,
  },
};
