import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { HTMLAttributes, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PhotoManifest } from "~/types/photo";

import { MasonryPhotoItem } from "../MasonryPhotoItem";

const openViewer = vi.fn();
const navigate = vi.fn();
let contextPhotos: PhotoManifest[] = [];
let gallerySetting = {
  selectedTags: [],
  selectedCameras: ["SONY ILCE-7C"],
  selectedLenses: [],
  selectedGeoCountries: [],
  selectedGeoRegions: [],
  selectedGeoCities: [],
  selectedGeoDistricts: [],
  tagFilterMode: "union" as const,
};

const photo = {
  id: "photo-1",
  title: "A7C01202",
  description: "",
  thumbnailUrl: "/thumb.jpg",
  originalUrl: "/original.jpg",
  width: 6000,
  height: 4000,
  aspectRatio: 1.5,
  tags: [],
  exif: {},
} as unknown as PhotoManifest;

vi.mock("@afilmory/ui", () => ({
  Thumbhash: ({ className }: { className?: string }) => (
    <div className={className} />
  ),
}));

vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>();

  return {
    ...actual,
    useAtomValue: () => gallerySetting,
  };
});

vi.mock("motion/react", () => ({
  m: {
    div: ({
      children,
      ...props
    }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-router", () => ({
  useLocation: () => ({ search: "?cameras=SONY%20ILCE-7C" }),
  useNavigate: () => navigate,
}));

vi.mock("~/hooks/useLivePhotoHandler", () => ({
  useLivePhotoHandler: () => ({
    videoRef: { current: null },
    hasVideo: false,
    isPlayingLivePhoto: false,
    isConvertingVideo: false,
    videoConversionError: null,
    handleMouseEnter: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleVideoEnded: vi.fn(),
  }),
}));

vi.mock("~/hooks/usePhotoViewer", () => ({
  useContextPhotos: () => contextPhotos,
  useOpenPhotoViewer: () => openViewer,
  usePhotoViewer: () => ({
    openViewer,
  }),
}));

vi.mock("~/lib/gallery-thumbnail-cache", () => ({
  getGalleryThumbnailCacheKey: (_id: string, url: string) => url,
  hasLoadedGalleryThumbnail: () => false,
  markGalleryThumbnailLoaded: vi.fn(),
}));

vi.mock("~/lib/image-utils", () => ({
  getImageFormat: () => "jpg",
}));

vi.mock("~/lib/startup-metrics", () => ({
  flushStartupMetrics: vi.fn(),
  markStartupOnce: () => false,
}));

describe("MasonryPhotoItem", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.router = { navigate };
    contextPhotos = [photo];
    gallerySetting = {
      selectedTags: [],
      selectedCameras: ["SONY ILCE-7C"],
      selectedLenses: [],
      selectedGeoCountries: [],
      selectedGeoRegions: [],
      selectedGeoCities: [],
      selectedGeoDistricts: [],
      tagFilterMode: "union",
    };
  });

  it("opens a filtered viewer session and navigates to the photo detail route with filters intact", () => {
    const { getByRole } = render(
      <MasonryPhotoItem data={photo} width={300} index={0} />,
    );

    fireEvent.click(getByRole("button", { name: "A7C01202" }));

    expect(openViewer).toHaveBeenCalledWith(0, {
      element: expect.any(HTMLElement),
      sourceMode: "filtered",
      sourcePhotoIds: ["photo-1"],
    });
    expect(navigate).toHaveBeenCalledWith({
      pathname: "/photos/photo-1",
      search: "?cameras=SONY+ILCE-7C",
    });
  });

  it("still navigates when the current masonry index is temporarily missing from context photos", () => {
    contextPhotos = [];

    const { getByRole } = render(
      <MasonryPhotoItem data={photo} width={300} index={0} />,
    );

    fireEvent.click(getByRole("button", { name: "A7C01202" }));

    expect(openViewer).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({
      pathname: "/photos/photo-1",
      search: "?cameras=SONY+ILCE-7C",
    });
  });

  it("falls back to route hook navigation before the window router is installed", () => {
    delete window.router;

    const { getByRole } = render(
      <MasonryPhotoItem data={photo} width={300} index={0} />,
    );

    fireEvent.click(getByRole("button", { name: "A7C01202" }));

    expect(navigate).toHaveBeenCalledWith({
      pathname: "/photos/photo-1",
      search: "?cameras=SONY+ILCE-7C",
    });
  });

  it("marks masonry thumbnails as low priority so detail images can win user-initiated loads", () => {
    const { getByAltText } = render(
      <MasonryPhotoItem data={photo} width={300} index={0} />,
    );

    expect(getByAltText("A7C01202").getAttribute("fetchpriority")).toBe("low");
  });

  it("waits for async route navigation before opening the viewer", async () => {
    let resolveNavigation!: () => void;
    navigate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveNavigation = resolve;
      }),
    );

    const { getByRole } = render(
      <MasonryPhotoItem data={photo} width={300} index={0} />,
    );

    fireEvent.click(getByRole("button", { name: "A7C01202" }));

    expect(navigate).toHaveBeenCalledWith({
      pathname: "/photos/photo-1",
      search: "?cameras=SONY+ILCE-7C",
    });
    expect(openViewer).not.toHaveBeenCalled();

    resolveNavigation();

    await waitFor(() => {
      expect(openViewer).toHaveBeenCalledWith(0, {
        element: expect.any(HTMLElement),
        sourceMode: "filtered",
        sourcePhotoIds: ["photo-1"],
      });
    });
  });
});
