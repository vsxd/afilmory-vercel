import { assertManifest } from "@afilmory/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhotoMarker } from "~/types/map";

import fixture from "../../../../../../e2e/fixtures/photos-manifest.json";
import { createMarkerClusterIndex, getClusterPoints } from "../clustering";
import { ClusterMarker } from "../ClusterMarker";

const navigation = vi.hoisted(() => ({
  photoHref: (id: string) => `/photos/${id}`,
  openPhoto: vi.fn(),
}));
vi.mock("~/navigation/hooks", () => ({ useAppNavigation: () => navigation }));
vi.mock("~/components/ui/ThumbnailImage", () => ({
  ThumbnailImage: () => null,
}));
vi.mock("react-map-gl/maplibre", () => ({
  Marker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("motion/react", () => ({
  m: {
    button: ({
      children,
      onClick,
      ref,
      "aria-label": label,
      "aria-expanded": expanded,
    }: ComponentProps<"button">) => (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-expanded={expanded}
      >
        {children}
      </button>
    ),
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, values?: { count?: number }) =>
      key === "explore.cluster.viewMore"
        ? `View ${values?.count} more photos`
        : key,
  }),
}));

const markers: PhotoMarker[] = assertManifest(fixture)
  .photos.slice(0, 8)
  .map((photo) => ({
    id: photo.id,
    latitude: 31,
    longitude: 121,
    photo,
  }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("cluster photo loading", () => {
  it("reads leaves only on opening, retains the full continuation sequence, and reuses open contents while panning", () => {
    const index = createMarkerClusterIndex(markers)!;
    const getLeaves = vi.spyOn(index, "getLeaves");
    const cluster = getClusterPoints(index, 10, [120, 30, 122, 32])[0];
    const onClusterClick = vi.fn();
    const props = {
      longitude: 121,
      latitude: 31,
      pointCount: 8,
      clusterIndex: index,
      clusterId: cluster.properties.cluster_id!,
      previewPhotos: cluster.properties.previewPhotos,
      onClusterClick,
    };
    const { rerender } = render(<ClusterMarker {...props} />);
    expect(getLeaves).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "explore.cluster.photos" }),
    );
    expect(onClusterClick).toHaveBeenCalledWith(121, 31);
    expect(getLeaves).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    const queryAgain = getClusterPoints(index, 10, [119, 30, 122, 32])[0];
    rerender(
      <ClusterMarker
        {...props}
        previewPhotos={queryAgain.properties.previewPhotos}
      />,
    );
    expect(getLeaves).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("link", { name: "View 2 more photos" }));
    expect(navigation.openPhoto).toHaveBeenCalledWith(expect.any(String), {
      photoIds: expect.arrayContaining(markers.map((marker) => marker.id)),
    });
    expect(navigation.openPhoto.mock.calls[0][1].photoIds).toHaveLength(8);
  });

  it("refreshes an open cluster from its new filtered index", () => {
    const index = createMarkerClusterIndex(markers)!;
    const cluster = getClusterPoints(index, 10, [120, 30, 122, 32])[0];
    const { rerender } = render(
      <ClusterMarker
        longitude={121}
        latitude={31}
        pointCount={8}
        clusterIndex={index}
        clusterId={cluster.properties.cluster_id!}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "explore.cluster.photos" }),
    );
    expect(
      screen.getByRole("link", { name: "View 2 more photos" }),
    ).toBeTruthy();
    const filtered = createMarkerClusterIndex(markers.slice(0, 2))!;
    const filteredCluster = getClusterPoints(
      filtered,
      10,
      [120, 30, 122, 32],
    )[0];
    const getLeaves = vi.spyOn(filtered, "getLeaves");
    rerender(
      <ClusterMarker
        longitude={121}
        latitude={31}
        pointCount={2}
        clusterIndex={filtered}
        clusterId={filteredCluster.properties.cluster_id!}
      />,
    );
    expect(getLeaves).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: /more photos/ })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
