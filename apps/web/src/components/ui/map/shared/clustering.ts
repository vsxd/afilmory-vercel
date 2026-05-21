import { normalizeLongitude } from "~/lib/map-utils";
import type { PhotoMarker } from "~/types/map";

import type { ClusterPoint } from "./types";

const HIGH_ZOOM_UNCLUSTERED_LIMIT = 300;
const MIN_CLUSTER_THRESHOLD = 0.001;

interface ClusterAccumulator {
  markers: PhotoMarker[];
  latSum: number;
  longitudeSinSum: number;
  longitudeCosSum: number;
  centerLatitude: number;
  centerLongitude: number;
  centerWrappedLongitude: number;
  cellKey: string;
}

const toWrappedLongitude = (longitude: number): number => {
  const normalized = normalizeLongitude(longitude);
  return normalized < 0 ? normalized + 360 : normalized;
};

const getClusterThreshold = (markersCount: number, zoom: number): number => {
  const baseThreshold = Math.max(
    MIN_CLUSTER_THRESHOLD,
    0.01 / Math.pow(2, zoom - 10),
  );

  if (markersCount <= HIGH_ZOOM_UNCLUSTERED_LIMIT) {
    return baseThreshold;
  }

  return baseThreshold * Math.sqrt(markersCount / HIGH_ZOOM_UNCLUSTERED_LIMIT);
};

const getCellCoordinates = (
  wrappedLongitude: number,
  latitude: number,
  threshold: number,
) => ({
  lng: Math.floor(wrappedLongitude / threshold),
  lat: Math.floor(latitude / threshold),
});

const getCellKey = (
  wrappedLongitude: number,
  latitude: number,
  threshold: number,
) => {
  const cell = getCellCoordinates(wrappedLongitude, latitude, threshold);
  return `${cell.lng}:${cell.lat}`;
};

const getLongitudeCenter = (cluster: ClusterAccumulator): number =>
  normalizeLongitude(
    (Math.atan2(cluster.longitudeSinSum, cluster.longitudeCosSum) * 180) /
      Math.PI,
  );

const getDistance = (
  markerWrappedLongitude: number,
  markerLatitude: number,
  cluster: ClusterAccumulator,
): number => {
  const lngDiff = Math.abs(
    markerWrappedLongitude - cluster.centerWrappedLongitude,
  );
  const wrappedLngDiff = Math.min(lngDiff, 360 - lngDiff);
  const latDiff = markerLatitude - cluster.centerLatitude;

  return Math.hypot(wrappedLngDiff, latDiff);
};

const addClusterToGrid = (
  grid: Map<string, ClusterAccumulator[]>,
  cluster: ClusterAccumulator,
) => {
  const bucket = grid.get(cluster.cellKey);
  if (bucket) {
    bucket.push(cluster);
  } else {
    grid.set(cluster.cellKey, [cluster]);
  }
};

const updateClusterCell = (
  grid: Map<string, ClusterAccumulator[]>,
  cluster: ClusterAccumulator,
  threshold: number,
) => {
  const nextCellKey = getCellKey(
    cluster.centerWrappedLongitude,
    cluster.centerLatitude,
    threshold,
  );

  if (nextCellKey === cluster.cellKey) return;

  const currentBucket = grid.get(cluster.cellKey);
  const currentIndex = currentBucket?.indexOf(cluster) ?? -1;
  if (currentBucket && currentIndex >= 0) {
    currentBucket.splice(currentIndex, 1);
  }

  cluster.cellKey = nextCellKey;
  addClusterToGrid(grid, cluster);
};

const addMarkerToCluster = (
  grid: Map<string, ClusterAccumulator[]>,
  cluster: ClusterAccumulator,
  marker: PhotoMarker,
  threshold: number,
) => {
  const longitudeRadians =
    (normalizeLongitude(marker.longitude) * Math.PI) / 180;

  cluster.markers.push(marker);
  cluster.latSum += marker.latitude;
  cluster.longitudeSinSum += Math.sin(longitudeRadians);
  cluster.longitudeCosSum += Math.cos(longitudeRadians);
  cluster.centerLatitude = cluster.latSum / cluster.markers.length;
  cluster.centerLongitude = getLongitudeCenter(cluster);
  cluster.centerWrappedLongitude = toWrappedLongitude(cluster.centerLongitude);

  updateClusterCell(grid, cluster, threshold);
};

const createCluster = (
  marker: PhotoMarker,
  threshold: number,
): ClusterAccumulator => {
  const longitude = normalizeLongitude(marker.longitude);
  const longitudeRadians = (longitude * Math.PI) / 180;
  const wrappedLongitude = toWrappedLongitude(marker.longitude);

  return {
    markers: [marker],
    latSum: marker.latitude,
    longitudeSinSum: Math.sin(longitudeRadians),
    longitudeCosSum: Math.cos(longitudeRadians),
    centerLatitude: marker.latitude,
    centerLongitude: longitude,
    centerWrappedLongitude: wrappedLongitude,
    cellKey: getCellKey(wrappedLongitude, marker.latitude, threshold),
  };
};

const createSinglePoint = (marker: PhotoMarker): ClusterPoint => ({
  type: "Feature",
  properties: { marker },
  geometry: {
    type: "Point",
    coordinates: [marker.longitude, marker.latitude],
  },
});

/**
 * Grid-based clustering that avoids full pairwise marker scans.
 * @param markers Array of photo markers to cluster
 * @param zoom Current zoom level
 * @returns Array of cluster points
 */
export function clusterMarkers(
  markers: PhotoMarker[],
  zoom: number,
): ClusterPoint[] {
  if (markers.length === 0) return [];

  if (zoom >= 15 && markers.length <= HIGH_ZOOM_UNCLUSTERED_LIMIT) {
    return markers.map(createSinglePoint);
  }

  const threshold = getClusterThreshold(markers.length, zoom);
  const grid = new Map<string, ClusterAccumulator[]>();
  const clusters: ClusterAccumulator[] = [];
  const longitudeCellCount = Math.max(1, Math.ceil(360 / threshold));

  const getNeighborClusters = (
    wrappedLongitude: number,
    latitude: number,
  ): ClusterAccumulator[] => {
    const cell = getCellCoordinates(wrappedLongitude, latitude, threshold);
    const neighbors: ClusterAccumulator[] = [];

    for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
      for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
        const lngCell =
          (cell.lng + lngOffset + longitudeCellCount) % longitudeCellCount;
        const latCell = cell.lat + latOffset;
        const bucket = grid.get(`${lngCell}:${latCell}`);
        if (bucket) neighbors.push(...bucket);
      }
    }

    return neighbors;
  };

  for (const marker of markers) {
    const wrappedLongitude = toWrappedLongitude(marker.longitude);
    let nearestCluster: ClusterAccumulator | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of getNeighborClusters(
      wrappedLongitude,
      marker.latitude,
    )) {
      const distance = getDistance(wrappedLongitude, marker.latitude, cluster);
      if (distance <= threshold && distance < nearestDistance) {
        nearestCluster = cluster;
        nearestDistance = distance;
      }
    }

    if (nearestCluster) {
      addMarkerToCluster(grid, nearestCluster, marker, threshold);
    } else {
      const cluster = createCluster(marker, threshold);
      clusters.push(cluster);
      addClusterToGrid(grid, cluster);
    }
  }

  return clusters.map((cluster) => {
    if (cluster.markers.length === 1) {
      return createSinglePoint(cluster.markers[0]);
    }

    return {
      type: "Feature",
      properties: {
        cluster: true,
        point_count: cluster.markers.length,
        point_count_abbreviated: cluster.markers.length.toString(),
        marker: cluster.markers[0],
        clusteredPhotos: cluster.markers,
      },
      geometry: {
        type: "Point",
        coordinates: [cluster.centerLongitude, cluster.centerLatitude],
      },
    };
  });
}
