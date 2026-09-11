import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestNavigation } from "~/navigation/__tests__/test-router";
import type { NavigationController } from "~/navigation/controller";
import { useGallerySettings } from "~/navigation/hooks";

import { GalleryEmptyState } from "../GalleryEmptyState";
import { MasonryHeaderMasonryItem } from "../MasonryHeaderMasonryItem";

let navigation: NavigationController;
const frames: FrameRequestCallback[] = [];
const photos: never[] = [];

vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({ navigation }),
  usePhotoRepositorySnapshot: () => photos,
}));
vi.mock("~/hooks/usePhotoViewer", () => ({
  useContextPhotos: () => photos,
}));
vi.mock("@afilmory/ui", () => ({
  clsxm: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
vi.mock("../ActionGroup", () => ({
  ActionGroup: () => <button data-gallery-search>Search</button>,
}));
vi.mock("~/config", () => ({
  siteConfig: {
    name: "A very long photographer name and personal photography collection",
    author: {},
    social: { github: "photographer", rss: true },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { label?: string }) =>
      key === "gallery.filters.remove"
        ? `Remove filter: ${options?.label}`
        : key,
    i18n: { language: "en" },
  }),
}));

const GalleryHarness = () => {
  const [settings] = useGallerySettings();
  // The real desktop masonry remounts its measured header for a new photo set.
  const key = JSON.stringify(settings);
  return (
    <div data-gallery-root>
      <MasonryHeaderMasonryItem key={key} />
      <GalleryEmptyState />
    </div>
  );
};

beforeEach(() => {
  frames.length = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("gallery filter recovery", () => {
  it("removes the exact chip through shared filter actions and restores focus after header replacement", async () => {
    navigation = createTestNavigation("/?sort=asc").navigation;
    navigation.updateGallerySettings((previous) => ({
      ...previous,
      sortOrder: "asc",
      selectedTags: ["travel"],
      selectedCameras: ["SONY ILCE-7C"],
      selectedGeoDistricts: ["district:country=cn|city=hangzhou|district=xihu"],
    }));
    render(<GalleryHarness />);
    const oldSearch = screen.getByRole("button", { name: "Search" });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove filter: SONY ILCE-7C" }),
    );

    await waitFor(() => {
      expect(navigation.getGallerySettings().selectedCameras).toEqual([]);
      expect(
        screen.queryByRole("button", { name: "Remove filter: SONY ILCE-7C" }),
      ).toBeNull();
    });
    expect(navigation.getGallerySettings()).toMatchObject({
      sortOrder: "asc",
      selectedTags: ["travel"],
      selectedGeoDistricts: ["district:country=cn|city=hangzhou|district=xihu"],
    });
    expect(oldSearch.isConnected).toBe(false);
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: "Remove filter: district:country=cn|city=hangzhou|district=xihu",
      }),
    );
  });

  it("clears every filter from the empty result without changing ordering and returns focus to the new header", async () => {
    navigation = createTestNavigation().navigation;
    navigation.updateGallerySettings((previous) => ({
      ...previous,
      sortOrder: "asc",
      selectedTags: ["travel"],
      selectedCameras: ["SONY ILCE-7C"],
      selectedLenses: ["FE 35mm F1.4 GM"],
      selectedGeoCountries: ["country:cn"],
      selectedGeoRegions: ["region:cn"],
      selectedGeoCities: ["city:cn"],
      selectedGeoDistricts: ["district:cn"],
    }));
    render(<GalleryHarness />);
    expect(screen.getByRole("status").textContent).toBe(
      "gallery.empty.filtered",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "gallery.empty.clear" }),
    );

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(navigation.getGallerySettings()).toMatchObject({
      sortOrder: "asc",
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      selectedGeoCountries: [],
      selectedGeoRegions: [],
      selectedGeoCities: [],
      selectedGeoDistricts: [],
    });
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Search" }),
    );
  });

  it("does not describe an unfiltered empty library as a filter mismatch", () => {
    navigation = createTestNavigation().navigation;
    render(<GalleryEmptyState />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
