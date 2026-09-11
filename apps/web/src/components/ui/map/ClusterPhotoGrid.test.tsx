import { assertManifest } from "@afilmory/schema";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PhotoMarker } from "~/types/map";

import fixture from "../../../../e2e/fixtures/photos-manifest.json";
import { ClusterPhotoGrid } from "./ClusterPhotoGrid";

const navigation = vi.hoisted(() => ({
  photoHref: (id: string) => `/photos/${id}`,
  openPhoto: vi.fn(),
}));
vi.mock("~/navigation/hooks", () => ({ useAppNavigation: () => navigation }));
vi.mock("~/components/ui/ThumbnailImage", () => ({
  ThumbnailImage: () => null,
}));
vi.mock("motion/react", () => ({
  m: {
    div: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
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

const photos: PhotoMarker[] = assertManifest(fixture)
  .photos.slice(0, 8)
  .map((photo) => ({
    id: photo.id,
    latitude: 31,
    longitude: 121,
    photo,
  }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("map cluster continuation", () => {
  it("opens the first unshown photo with the full cluster as the viewing sequence", () => {
    const onPhotoClick = vi.fn();
    render(<ClusterPhotoGrid photos={photos} onPhotoClick={onPhotoClick} />);
    const more = screen.getByRole("link", { name: "View 2 more photos" });
    expect(more.getAttribute("href")).toBe(`/photos/${photos[6].photo.id}`);
    fireEvent.click(more);
    expect(navigation.openPhoto).toHaveBeenCalledWith(photos[6].photo.id, {
      photoIds: photos.map((marker) => marker.photo.id),
    });
    expect(onPhotoClick).toHaveBeenCalledWith(photos[6]);
  });

  it("retains native modified-link navigation and omits continuation for small clusters", () => {
    const onPhotoClick = vi.fn();
    const view = render(
      <ClusterPhotoGrid photos={photos} onPhotoClick={onPhotoClick} />,
    );
    const more = screen.getByRole("link", { name: "View 2 more photos" });
    more.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(more, { metaKey: true });
    expect(navigation.openPhoto).not.toHaveBeenCalled();
    expect(onPhotoClick).not.toHaveBeenCalled();
    view.rerender(<ClusterPhotoGrid photos={photos.slice(0, 6)} />);
    expect(screen.queryByRole("link", { name: /more photos/ })).toBeNull();
  });
});
