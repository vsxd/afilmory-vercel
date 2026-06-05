import Supercluster from "supercluster";

import type { GeographicRegion, PhotoMarker } from "~/types/map";

import type { ClusterPoint } from "./types";

const CLUSTER_BBOX: [number, number, number, number] = [-180, -90, 180, 90];
const CLUSTER_RADIUS = 48;
const CLUSTER_MAX_ZOOM = 16;

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
type ClusterProperties = Record<string, never>;
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

const createClusterPoint = (
  feature: ClusterFeature,
  index: Supercluster<PointProperties, ClusterProperties>,
): ClusterPoint => {
  const leaves = index.getLeaves(
    feature.properties.cluster_id,
    Number.POSITIVE_INFINITY,
  );
  const markers = leaves.map((leaf) => leaf.properties.marker);
  const regions = leaves
    .map((leaf) =>
      leaf.properties.kind === "region" ? leaf.properties.region : null,
    )
    .filter((region): region is GeographicRegion => region !== null);

  return {
    type: "Feature",
    properties: {
      cluster: true,
      cluster_id: feature.properties.cluster_id,
      point_count: feature.properties.point_count,
      point_count_abbreviated: String(
        feature.properties.point_count_abbreviated,
      ),
      marker: markers[0],
      clusteredPhotos:
        regions.length > 0
          ? regions.flatMap((region) => region.markers)
          : markers,
      clusteredRegions: regions.length > 0 ? regions : undefined,
    },
    geometry: getClusterPointGeometry(feature),
  };
};

const clusterPoints = (features: PointFeature[], zoom: number) => {
  if (features.length === 0) return [];

  const index = createIndex(features);
  const clusterZoom = Math.max(
    0,
    Math.min(CLUSTER_MAX_ZOOM + 1, Math.floor(zoom)),
  );

  return index.getClusters(CLUSTER_BBOX, clusterZoom).map((feature) => {
    if (isClusterFeature(feature)) {
      return createClusterPoint(feature, index);
    }

    return createSinglePoint(feature);
  });
};

export function clusterMarkers(
  markers: PhotoMarker[],
  zoom: number,
): ClusterPoint[] {
  return clusterPoints(markers.map(createPhotoPoint), zoom);
}

export function clusterRegions(
  regions: GeographicRegion[],
  zoom: number,
): ClusterPoint[] {
  return clusterPoints(regions.map(createRegionPoint), zoom);
}
