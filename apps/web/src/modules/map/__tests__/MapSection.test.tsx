import type { PhotoManifestItem } from "@afilmory/schema";
import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MapSection } from "../MapSection";

vi.mock("~/navigation/hooks", () => ({
  useAppNavigation: () => ({
    getMapView: () => {},
    rememberMapView: vi.fn(),
    updateMapSearch: vi.fn(),
  }),
}));

const genericMapRenders: Array<Record<string, unknown>> = [];
let mapLoadingStateMock: ReturnType<typeof vi.fn>;

vi.mock("~/modules/map/MapProvider", () => ({
  MapProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock("../GenericMap", () => ({
  GenericMap: (props: Record<string, unknown>) => {
    genericMapRenders.push(props);
    return <div data-testid="generic-map" />;
  },
}));

vi.mock("~/components/ui/map", () => ({
  MapBackButton: () => null,
  MapInfoPanel: () => null,
  MapErrorState: () => <div data-testid="map-error" />,
  MapLoadingState: (...args: unknown[]) => {
    mapLoadingStateMock(...args);
    return <div data-testid="map-loading" />;
  },
}));

vi.mock("motion/react", () => ({
  m: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: PropsWithChildren<Record<string, unknown>>) => (
      <div {...(props as Record<string, string>)}>{children}</div>
    ),
  },
}));

const createPhoto = (
  id: string,
  latitude: number,
  longitude: number,
  city: string,
): PhotoManifestItem => ({
  id,
  title: id,
  description: "",
  tags: [],
  originalUrl: `/originals/${id}.jpg`,
  thumbnailUrl: `/thumbnails/${id}.jpg`,
  thumbHash: null,
  width: 100,
  height: 100,
  aspectRatio: 1,
  s3Key: `${id}.jpg`,
  lastModified: new Date().toISOString(),
  size: 1,
  // Web Delivery v3 keeps coordinates in the lightweight location summary;
  // GPS EXIF arrives later with the optional map shard.
  exif: { Make: "Synthetic camera" },
  toneAnalysis: null,
  location: {
    latitude,
    longitude,
    admin: {
      country: "China",
      countryCode: "CN",
      region: "Zhejiang",
      city,
    },
  },
});

const photos = [
  createPhoto("a", 30, 120, "Hangzhou"),
  createPhoto("b", 30.5, 120.5, "Jiaxing"),
];

// Stable repository identity, matching the real hook's contract.
const photoRepository = {
  getPhotos: () => photos,
  getPhoto: (id: string) => photos.find((photo) => photo.id === id),
  ensureMapDetails: vi.fn(async () => {}),
};

vi.mock("~/runtime/app-runtime", () => ({
  usePhotoRepository: () => photoRepository,
  usePhotoRepositoryVersion: () => 0,
}));

describe("MapSection", () => {
  beforeEach(() => {
    genericMapRenders.length = 0;
    mapLoadingStateMock = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the map synchronously from repository data without a loading pass", () => {
    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <MapSection />
      </MemoryRouter>,
    );

    // Repository data is already in memory: no spinner frame, the map renders
    // with the full marker/region data from the very first committed render.
    expect(mapLoadingStateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("generic-map")).toBeTruthy();

    const firstRender = genericMapRenders[0] as {
      markers: Array<{ id: string }>;
      regions: Array<{ label: string }>;
      displayMode: string;
    };
    expect(firstRender.markers.map((marker) => marker.id)).toEqual(["a", "b"]);
    expect(firstRender.displayMode).toBe("regions");
    // Initial region level is "country": both photos collapse into one region.
    expect(firstRender.regions.map((region) => region.label)).toEqual([
      "China",
    ]);
    expect(photoRepository.ensureMapDetails).toHaveBeenCalledTimes(1);
  });
});
