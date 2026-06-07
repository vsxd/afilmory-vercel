import type { GeoRegionLevel, PhotoManifestItem } from "@afilmory/schema";

/**
 * GPS Cardinal directions enum
 */
export enum GPSDirection {
  North = "N",
  South = "S",
  East = "E",
  West = "W",
}

/**
 * Enhanced GPS coordinates interface with altitude and direction
 */
export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
  latitudeRef?: GPSDirection.North | GPSDirection.South;
  longitudeRef?: GPSDirection.East | GPSDirection.West;
  altitudeRef?: "Above Sea Level" | "Below Sea Level";
}

/**
 * Photo marker interface for map display
 */
export interface PhotoMarker {
  id: string;
  longitude: number;
  latitude: number;
  altitude?: number;
  latitudeRef?: GPSDirection.North | GPSDirection.South;
  longitudeRef?: GPSDirection.East | GPSDirection.West;
  altitudeRef?: "Above Sea Level" | "Below Sea Level";

  photo: PhotoManifestItem;
}

export type MapDisplayMode = "regions" | "photos";
export type GeographicRegionLevel = GeoRegionLevel;

/**
 * Map bounds interface
 */
export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
  longitudeSpan: number;
  crossesAntimeridian: boolean;
  bounds: [[number, number], [number, number]];
}

export interface GeographicRegion {
  id: string;
  level: GeographicRegionLevel;
  label: string;
  adminPath: {
    country?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    district?: string;
  };
  longitude: number;
  latitude: number;
  photoIds: string[];
  photoCount: number;
  representativeMarker: PhotoMarker;
  markers: PhotoMarker[];
  bounds: MapBounds;
}

/**
 * Map view state interface
 */
export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}
