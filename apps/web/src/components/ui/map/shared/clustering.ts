import Supercluster from "supercluster";

import type { GeographicRegion, PhotoMarker } from "~/types/map";

import type { MapQueryBounds } from "../map-viewport";
import type { ClusterPoint } from "./types";

const CLUSTER_RADIUS = 48;
const CLUSTER_MAX_ZOOM = 16;
const CLUSTER_PREVIEW_SIZE = 4;

type PhotoPointProperties = {
  kind: "photo";
  marker: PhotoMarker;
};

type RegionPointProperties = {
  kind: "region";
  marker: PhotoMarker;
  region: GeographicRegion;
};

type PointProperties = PhotoPointProperties | RegionPointProperties;
type ClusterProperties = { previewPhotos: PhotoMarker[] };
type PointFeature = Supercluster.PointFeature<PointProperties>;
type ClusterFeature = Supercluster.ClusterFeature<ClusterProperties>;
type IndexedFeature = ClusterFeature | PointFeature;

const getClusterPointGeometry = (
  feature: IndexedFeature,
): ClusterPoint["geometry"] => {
  const [longitude, latitude] = feature.geometry.coordinates;

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new TypeError("Cluster point is missing longitude or latitude.");
  }

  return {
    type: "Point",
    coordinates: [longitude, latitude],
  };
};

const isClusterFeature = (feature: IndexedFeature): feature is ClusterFeature =>
  "cluster" in feature.properties && feature.properties.cluster === true;

const createPhotoPoint = (marker: PhotoMarker): PointFeature => ({
  type: "Feature",
  properties: {
    kind: "photo",
    marker,
  },
  geometry: {
    type: "Point",
    coordinates: [marker.longitude, marker.latitude],
  },
});

const createRegionPoint = (region: GeographicRegion): PointFeature => ({
  type: "Feature",
  properties: {
    kind: "region",
    marker: region.representativeMarker,
    region,
  },
  geometry: {
    type: "Point",
    coordinates: [region.longitude, region.latitude],
  },
});

const createIndex = (features: PointFeature[]) =>
  new Supercluster<PointProperties, ClusterProperties>({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    map: (properties) => ({
      previewPhotos:
        properties.kind === "region"
          ? properties.region.markers.slice(0, CLUSTER_PREVIEW_SIZE)
          : [properties.marker],
    }),
    reduce: (accumulated, properties) => {
      // Keep only bounded references in the index; never expand every leaf
      // just to render the four-photo marker mosaic.
      accumulated.previewPhotos = accumulated.previewPhotos
        .concat(properties.previewPhotos)
        .slice(0, CLUSTER_PREVIEW_SIZE);
    },
  }).load(features);

const createSinglePoint = (feature: PointFeature): ClusterPoint => {
  if (feature.properties.kind === "region") {
    return {
      type: "Feature",
      properties: {
        marker: feature.properties.marker,
        region: feature.properties.region,
      },
      geometry: getClusterPointGeometry(feature),
    };
  }

  return {
    type: "Feature",
    properties: {
      marker: feature.properties.marker,
    },
    geometry: getClusterPointGeometry(feature),
  };
};

const createClusterPoint = (feature: ClusterFeature): ClusterPoint => {
  return {
    type: "Feature",
    properties: {
      cluster: true,
      cluster_id: feature.properties.cluster_id,
      point_count: feature.properties.point_count,
      point_count_abbreviated: String(
        feature.properties.point_count_abbreviated,
      ),
      previewPhotos: feature.properties.previewPhotos,
    },
    geometry: getClusterPointGeometry(feature),
  };
};

// Supercluster is built to be loaded once and queried per zoom: index
// construction is O(n log n) while a query is cheap. Callers should build the
// index when the underlying markers/regions change and query the viewport.
export type ClusterIndex = Supercluster<
  PointProperties,
  ClusterProperties
> | null;

export function createMarkerClusterIndex(markers: PhotoMarker[]): ClusterIndex {
  return markers.length > 0 ? createIndex(markers.map(createPhotoPoint)) : null;
}

export function createRegionClusterIndex(
  regions: GeographicRegion[],
): ClusterIndex {
  return regions.length > 0
    ? createIndex(regions.map(createRegionPoint))
    : null;
}

export function getClusterPoints(
  index: ClusterIndex,
  zoom: number,
  bounds: MapQueryBounds,
): ClusterPoint[] {
  if (!index) return [];

  const clusterZoom = Math.max(
    0,
    Math.min(CLUSTER_MAX_ZOOM + 1, Math.floor(zoom)),
  );

  return index.getClusters(bounds, clusterZoom).map((feature) => {
    if (isClusterFeature(feature)) {
      return createClusterPoint(feature);
    }

    return createSinglePoint(feature);
  });
}

// Only an opened cluster needs its complete photo sequence. Region leaves
// contain multiple photos; preserve that full sequence for the grid's links.
export function getClusterPhotos(
  index: ClusterIndex,
  clusterId: number,
): PhotoMarker[] {
  if (!index) return [];
  return index
    .getLeaves(clusterId, Number.POSITIVE_INFINITY)
    .flatMap((leaf) =>
      leaf.properties.kind === "region"
        ? leaf.properties.region.markers
        : [leaf.properties.marker],
    );
}
