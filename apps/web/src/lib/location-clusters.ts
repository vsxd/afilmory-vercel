import type { PhotoMarker, ShootingLocation } from "~/types/map";

import { calculateMapBounds, normalizeLongitude } from "./map-utils";

export const DEFAULT_SHOOTING_LOCATION_RADIUS_METERS = 100;

const EARTH_RADIUS_METERS = 6_371_000;

class DisjointSet {
  private readonly parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    const parent = this.parents[index];
    if (parent === index) return index;

    const root = this.find(parent);
    this.parents[index] = root;
    return root;
  }

  union(a: number, b: number) {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA === rootB) return;

    if (rootA < rootB) {
      this.parents[rootB] = rootA;
    } else {
      this.parents[rootA] = rootB;
    }
  }
}

const toRadians = (degree: number) => (degree * Math.PI) / 180;

export function getHaversineDistanceMeters(
  a: Pick<PhotoMarker, "latitude" | "longitude">,
  b: Pick<PhotoMarker, "latitude" | "longitude">,
): number {
  const latA = toRadians(a.latitude);
  const latB = toRadians(b.latitude);
  const latDelta = toRadians(b.latitude - a.latitude);
  const lngDelta = toRadians(normalizeLongitude(b.longitude - a.longitude));

  const sinLat = Math.sin(latDelta / 2);
  const sinLng = Math.sin(lngDelta / 2);
  const haversine =
    sinLat * sinLat + Math.cos(latA) * Math.cos(latB) * sinLng * sinLng;

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

const getClusterCenter = (markers: PhotoMarker[]) => {
  const latitude =
    markers.reduce((sum, marker) => sum + marker.latitude, 0) / markers.length;
  const longitudeRadians = markers.map((marker) =>
    toRadians(normalizeLongitude(marker.longitude)),
  );
  const sinSum = longitudeRadians.reduce(
    (sum, radians) => sum + Math.sin(radians),
    0,
  );
  const cosSum = longitudeRadians.reduce(
    (sum, radians) => sum + Math.cos(radians),
    0,
  );
  const longitude = normalizeLongitude(
    (Math.atan2(sinSum, cosSum) * 180) / Math.PI,
  );

  return { latitude, longitude };
};

export function createLocationMarker(location: ShootingLocation): PhotoMarker {
  return {
    ...location.representativeMarker,
    id: location.id,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export function createLocationMarkers(
  locations: ShootingLocation[],
): PhotoMarker[] {
  return locations.map(createLocationMarker);
}

export function createShootingLocations(
  markers: PhotoMarker[],
  radiusMeters = DEFAULT_SHOOTING_LOCATION_RADIUS_METERS,
): ShootingLocation[] {
  if (markers.length === 0) return [];

  const disjointSet = new DisjointSet(markers.length);

  for (let i = 0; i < markers.length; i += 1) {
    for (let j = i + 1; j < markers.length; j += 1) {
      if (getHaversineDistanceMeters(markers[i], markers[j]) <= radiusMeters) {
        disjointSet.union(i, j);
      }
    }
  }

  const groups = new Map<number, PhotoMarker[]>();

  markers.forEach((marker, index) => {
    const root = disjointSet.find(index);
    const group = groups.get(root);

    if (group) {
      group.push(marker);
    } else {
      groups.set(root, [marker]);
    }
  });

  return [...groups.values()].map((group) => {
    const representativeMarker = group[0];
    const center = getClusterCenter(group);
    const bounds = calculateMapBounds(group);

    if (!bounds) {
      throw new Error("Cannot create a shooting location without bounds.");
    }

    return {
      id: `location-${representativeMarker.id}`,
      longitude: center.longitude,
      latitude: center.latitude,
      photoIds: group.map((marker) => marker.photo.id),
      photoCount: group.length,
      representativeMarker,
      markers: group,
      bounds,
    };
  });
}
