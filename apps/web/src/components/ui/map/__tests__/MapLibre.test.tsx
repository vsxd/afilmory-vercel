import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GeographicRegion, PhotoMarker } from "~/types/map";

import { Maplibre } from "../MapLibre";

let setProjectionMock: ReturnType<typeof vi.fn>;
let fitBoundsMock: ReturnType<typeof vi.fn>;
let flyToMock: ReturnType<typeof vi.fn>;
let clusterMarkersMock: ReturnType<typeof vi.fn>;
let clusterRegionsMock: ReturnType<typeof vi.fn>;

vi.mock("react-map-gl/maplibre", async () => {
  const React = await import("react");

  const MockMap = ({
    ref,
    longitude,
    latitude,
    zoom,
    onLoad,
    children,
  }: React.ComponentProps<"div"> & {
    longitude: number;
    latitude: number;
    zoom: number;
    onLoad?: () => void;
  } & {
    ref?: React.RefObject<{
      getMap: () => {
        setProjection: (...args: unknown[]) => void;
        fitBounds: (...args: unknown[]) => void;
      };
      getContainer: () => { offsetWidth: number; offsetHeight: number };
    } | null | null>;
  }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (ref && typeof ref === "object") {
        ref.current = {
          getMap: () => ({
            setProjection: (...args: unknown[]) => setProjectionMock(...args),
            fitBounds: (...args: unknown[]) => fitBoundsMock(...args),
            flyTo: (...args: unknown[]) => flyToMock(...args),
          }),
          getContainer: () => containerRef.current as HTMLDivElement,
        };
      }
      onLoad?.();
    }, [onLoad, ref]);

    return (
      <div
        ref={containerRef}
        data-testid="map"
        data-longitude={String(longitude)}
        data-latitude={String(latitude)}
        data-zoom={String(zoom)}
      >
        {children}
      </div>
    );
  };

  MockMap.displayName = "MockMap";

  return { default: MockMap };
});

vi.mock("~/config", () => ({
  siteConfig: {
    mapProjection: "mercator",
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("~/lib/map/style", () => ({
  getMapStyle: () => ({}),
}));

vi.mock("../shared", () => ({
  ClusterMarker: ({
    longitude,
    latitude,
    onClusterClick,
  }: {
    longitude: number;
    latitude: number;
    onClusterClick?: (longitude: number, latitude: number) => void;
  }) => (
    <button
      type="button"
      data-testid="cluster-marker"
      onClick={() => onClusterClick?.(longitude, latitude)}
    />
  ),
  clusterRegions: (...args: unknown[]) => clusterRegionsMock(...args),
  clusterMarkers: (...args: unknown[]) => clusterMarkersMock(...args),
  DEFAULT_MARKERS: [],
  DEFAULT_STYLE: { width: "100%", height: "100%" },
  DEFAULT_VIEW_STATE: { longitude: -122.4, latitude: 37.8, zoom: 14 },
  GeoJsonLayer: () => null,
  RegionMarkerPin: ({
    region,
    onClick,
  }: {
    region: GeographicRegion;
    onClick?: (region: GeographicRegion) => void;
  }) => (
    <button
      type="button"
      data-testid="region-marker"
      onClick={() => onClick?.(region)}
    />
  ),
  MapControls: () => null,
  PhotoMarkerPin: () => null,
}));

const createMarker = (
  id: string,
  latitude: number,
  longitude: number,
): PhotoMarker =>
  ({
    id,
    latitude,
    longitude,
    photo: {
      id,
      title: id,
      thumbnailUrl: "",
      originalUrl: "",
      thumbHash: null,
    },
  }) as PhotoMarker;

const createRegion = (marker: PhotoMarker): GeographicRegion => ({
  id: `region-${marker.id}`,
  level: "city",
  label: marker.id,
  adminPath: { city: marker.id },
  longitude: marker.longitude,
  latitude: marker.latitude,
  photoIds: [marker.id],
  photoCount: 1,
  representativeMarker: marker,
  markers: [marker],
  bounds: {
    minLat: marker.latitude,
    maxLat: marker.latitude,
    minLng: marker.longitude,
    maxLng: marker.longitude,
    centerLat: marker.latitude,
    centerLng: marker.longitude,
    longitudeSpan: 0,
    crossesAntimeridian: false,
    bounds: [
      [marker.longitude, marker.latitude],
      [marker.longitude, marker.latitude],
    ],
  },
});

describe("Maplibre", () => {
  beforeEach(() => {
    setProjectionMock = vi.fn();
    fitBoundsMock = vi.fn();
    flyToMock = vi.fn();
    clusterMarkersMock = vi.fn(() => []);
    clusterRegionsMock = vi.fn(() => []);
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("syncs the rendered view state when initialViewState changes and autoFitBounds is disabled", () => {
    const { rerender } = render(
      <Maplibre
        initialViewState={{ longitude: 120, latitude: 30, zoom: 5 }}
        autoFitBounds={false}
        markers={[]}
      />,
    );

    expect(screen.getByTestId("map").dataset.longitude).toBe("120");
    expect(screen.getByTestId("map").dataset.latitude).toBe("30");
    expect(screen.getByTestId("map").dataset.zoom).toBe("5");

    rerender(
      <Maplibre
        initialViewState={{ longitude: 121.5, latitude: 31.2, zoom: 9 }}
        autoFitBounds={false}
        markers={[]}
      />,
    );

    expect(screen.getByTestId("map").dataset.longitude).toBe("121.5");
    expect(screen.getByTestId("map").dataset.latitude).toBe("31.2");
    expect(screen.getByTestId("map").dataset.zoom).toBe("9");
  });

  it("renders the custom map attribution collapsed by default", () => {
    render(<Maplibre autoFitBounds={false} markers={[]} />);

    const attribution = screen.getByTestId("map-attribution");
    const attributionToggle = screen.getByRole("button", {
      name: "explore.attribution.geocoding | © CARTO, © OpenStreetMap contributors",
    });

    expect(attribution.dataset.state).toBe("closed");
    expect(attributionToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("© CARTO")).toBeNull();

    fireEvent.click(attributionToggle);
    expect(attribution.dataset.state).toBe("open");
    expect(attributionToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText("explore.attribution.geocoding")).not.toBeNull();
    expect(screen.queryByText("© CARTO")).not.toBeNull();
    expect(screen.queryByText("© OpenStreetMap contributors")).not.toBeNull();

    fireEvent.click(attributionToggle);
    expect(attribution.dataset.state).toBe("closed");
    expect(attributionToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("© CARTO")).toBeNull();
  });

  it("disables native MapLibre attribution", () => {
    render(<Maplibre autoFitBounds={false} markers={[]} />);

    expect(
      screen.getByTestId("map").querySelector(".maplibregl-ctrl-attrib"),
    ).toBeNull();
  });

  it("can preserve the current view state when initialViewState changes after selection is cleared", () => {
    const { rerender } = render(
      <Maplibre
        initialViewState={{ longitude: 120, latitude: 30, zoom: 5 }}
        autoFitBounds={false}
        syncViewStateOnInitialViewStateChange={false}
        markers={[]}
      />,
    );

    expect(screen.getByTestId("map").dataset.longitude).toBe("120");
    expect(screen.getByTestId("map").dataset.latitude).toBe("30");
    expect(screen.getByTestId("map").dataset.zoom).toBe("5");

    rerender(
      <Maplibre
        initialViewState={{ longitude: 0, latitude: 0, zoom: 2 }}
        autoFitBounds={false}
        syncViewStateOnInitialViewStateChange={false}
        markers={[]}
      />,
    );

    expect(screen.getByTestId("map").dataset.longitude).toBe("120");
    expect(screen.getByTestId("map").dataset.latitude).toBe("30");
    expect(screen.getByTestId("map").dataset.zoom).toBe("5");
  });

  it("zooms into a cluster when no external cluster handler is provided", () => {
    const mapRef = { current: null };

    clusterMarkersMock.mockReturnValue([
      {
        type: "Feature",
        properties: {
          cluster: true,
          point_count: 3,
          marker: undefined,
          clusteredPhotos: [],
        },
        geometry: {
          type: "Point",
          coordinates: [121.5, 31.2],
        },
      },
    ]);

    render(
      <Maplibre
        initialViewState={{ longitude: 120, latitude: 30, zoom: 5 }}
        autoFitBounds={false}
        displayMode="photos"
        markers={[]}
        mapRef={mapRef}
      />,
    );

    fireEvent.click(screen.getByTestId("cluster-marker"));

    expect(flyToMock).toHaveBeenCalledWith({
      center: [121.5, 31.2],
      zoom: 7,
      duration: 500,
    });
  });

  it("renders region pins and forwards region clicks in regions mode", () => {
    const marker = createMarker("a", 30, 120);
    const region = createRegion(marker);
    const onRegionClick = vi.fn();

    clusterRegionsMock.mockReturnValue([
      {
        type: "Feature",
        properties: {
          marker,
          region,
        },
        geometry: {
          type: "Point",
          coordinates: [120, 30],
        },
      },
    ]);

    render(
      <Maplibre
        initialViewState={{ longitude: 120, latitude: 30, zoom: 8 }}
        autoFitBounds={false}
        displayMode="regions"
        regions={[region]}
        onRegionClick={onRegionClick}
      />,
    );

    fireEvent.click(screen.getByTestId("region-marker"));

    expect(clusterRegionsMock).toHaveBeenCalledWith([region], 8);
    expect(onRegionClick).toHaveBeenCalledWith(region);
  });
});
