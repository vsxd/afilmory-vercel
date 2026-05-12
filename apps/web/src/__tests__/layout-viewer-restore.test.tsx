import { act, render, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Component } from "../pages/(main)/layout";

const hoisted = vi.hoisted(() => ({
  jotaiStoreSet: vi.fn(),
}));

const visiblePhoto = { id: "visible-photo" };
const hiddenPhoto = { id: "hidden-photo" };

const openViewer = vi.fn();
const closeViewer = vi.fn();
const goToIndex = vi.fn();
const changedGoToIndex = vi.fn();
const getViewerPhotos = vi.fn();
const getViewerSourceMode = vi.fn();
const navigate = vi.fn();
const setSearchParams = vi.fn();
let currentGoToIndex = goToIndex;
let navigationTypeState: "POP" | "PUSH" | "REPLACE" = "PUSH";

let gallerySetting = {
  selectedTags: ["keep"],
  selectedCameras: [],
  selectedLenses: [],
  sortOrder: "desc",
  tagFilterMode: "union" as const,
};

let locationState = {
  pathname: "/photos/hidden-photo",
  search: "?tags=keep",
};

let paramsState: { photoId?: string } = {
  photoId: "hidden-photo",
};

let viewerState = {
  currentIndex: 1,
  isOpen: true,
};

vi.mock("@afilmory/ui", () => ({
  ScrollArea: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ScrollElementContext: ({
    children,
  }: PropsWithChildren<{ value: HTMLElement | null }>) => <>{children}</>,
}));

vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>();

  return {
    ...actual,
    useAtomValue: () => gallerySetting,
  };
});

vi.mock("~/lib/jotai", () => ({
  jotaiStore: {
    set: hoisted.jotaiStoreSet,
  },
}));

vi.mock("react-router", () => ({
  Outlet: () => null,
  useLocation: () => locationState,
  useNavigate: () => navigate,
  useNavigationType: () => navigationTypeState,
  useParams: () => paramsState,
  useSearchParams: () => [
    new URLSearchParams(locationState.search),
    setSearchParams,
  ],
}));

vi.mock("~/config", () => ({
  siteConfig: {
    accentColor: "",
  },
}));

vi.mock("~/hooks/useMobile", () => ({
  useMobile: () => false,
}));

vi.mock("~/hooks/usePhotoViewer", () => ({
  getViewerPhotos: (...args: unknown[]) => getViewerPhotos(...args),
  getViewerSourceMode: (...args: unknown[]) => getViewerSourceMode(...args),
  usePhotoViewer: () => ({
    ...viewerState,
    closeViewer,
    goToIndex: currentGoToIndex,
    openViewer,
  }),
  usePhotos: () => [],
}));

vi.mock("~/modules/gallery/MasonryRoot", () => ({
  MasonryRoot: () => <div>masonry</div>,
}));

vi.mock("~/providers/photos-provider", () => ({
  PhotosProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));

describe("main layout viewer URL restore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    currentGoToIndex = goToIndex;
    navigationTypeState = "PUSH";
    gallerySetting = {
      selectedTags: ["keep"],
      selectedCameras: [],
      selectedLenses: [],
      sortOrder: "desc",
      tagFilterMode: "union",
    };
    locationState = {
      pathname: "/photos/hidden-photo",
      search: "?tags=keep",
    };
    paramsState = {
      photoId: "hidden-photo",
    };
    viewerState = {
      currentIndex: 1,
      isOpen: true,
    };
    getViewerPhotos.mockReturnValue([visiblePhoto, hiddenPhoto]);
    getViewerSourceMode.mockReturnValue("filtered");
  });

  it("keeps the active viewer source mode when restoring an already-open detail URL", async () => {
    render(<Component />);

    await waitFor(() => {
      expect(getViewerPhotos).toHaveBeenCalledWith("hidden-photo");
    });

    expect(openViewer).not.toHaveBeenCalled();
    expect(getViewerSourceMode).not.toHaveBeenCalled();
    expect(goToIndex).not.toHaveBeenCalled();
    expect(setSearchParams).not.toHaveBeenCalled();
  });

  it("does not reopen the viewer while a detail route is closing", async () => {
    const { rerender } = render(<Component />);

    await waitFor(() => {
      expect(getViewerPhotos).toHaveBeenCalledWith("hidden-photo");
    });

    vi.clearAllMocks();
    currentGoToIndex = changedGoToIndex;
    viewerState = {
      currentIndex: 1,
      isOpen: false,
    };

    rerender(<Component />);

    expect(openViewer).not.toHaveBeenCalled();
    expect(getViewerSourceMode).not.toHaveBeenCalled();
    expect(changedGoToIndex).not.toHaveBeenCalled();
  });

  it("opens a viewer source mode only for a cold photo detail URL", async () => {
    viewerState = {
      currentIndex: 0,
      isOpen: false,
    };
    paramsState = {
      photoId: "visible-photo",
    };
    locationState = {
      pathname: "/photos/visible-photo",
      search: "?tags=keep",
    };
    getViewerPhotos.mockReturnValue([visiblePhoto]);

    render(<Component />);

    await waitFor(() => {
      expect(openViewer).toHaveBeenCalledWith(0, {
        sourceMode: "filtered",
        sourcePhotoIds: ["visible-photo"],
      });
    });

    expect(getViewerSourceMode).toHaveBeenCalledWith("visible-photo");
    expect(goToIndex).not.toHaveBeenCalled();
  });

  it("syncs an opened homepage viewer into the matching photo detail route", async () => {
    viewerState = {
      currentIndex: 0,
      isOpen: true,
    };
    paramsState = {};
    locationState = {
      pathname: "/",
      search: "",
    };
    getViewerPhotos.mockReturnValue([visiblePhoto, hiddenPhoto]);

    render(<Component />);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        { pathname: "/photos/visible-photo", search: "" },
        { replace: true },
      );
    });
  });

  it("closes the viewer instead of re-pushing the detail route when browser back returns to the gallery", async () => {
    viewerState = {
      currentIndex: 0,
      isOpen: true,
    };
    paramsState = {
      photoId: "visible-photo",
    };
    locationState = {
      pathname: "/photos/visible-photo",
      search: "",
    };
    getViewerPhotos.mockReturnValue([visiblePhoto]);

    const { rerender } = render(<Component />);

    await waitFor(() => {
      expect(getViewerPhotos).toHaveBeenCalledWith("visible-photo");
    });

    vi.clearAllMocks();
    navigationTypeState = "POP";
    paramsState = {};
    locationState = {
      pathname: "/",
      search: "",
    };

    rerender(<Component />);

    await waitFor(() => {
      expect(closeViewer).toHaveBeenCalledTimes(1);
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("returns to the filtered gallery URL after closing a photo detail route", async () => {
    vi.useFakeTimers();
    viewerState = {
      currentIndex: 0,
      isOpen: true,
    };
    paramsState = {
      photoId: "visible-photo",
    };
    locationState = {
      pathname: "/photos/visible-photo",
      search: "?cameras=SONY+ILCE-7C",
    };
    gallerySetting = {
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      sortOrder: "desc",
      tagFilterMode: "union",
    };
    getViewerPhotos.mockReturnValue([visiblePhoto]);

    const { rerender } = render(<Component />);

    expect(getViewerPhotos).toHaveBeenCalledWith("visible-photo");

    vi.clearAllMocks();
    viewerState = {
      currentIndex: 0,
      isOpen: false,
    };

    rerender(<Component />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(navigate).toHaveBeenCalledWith(
      { pathname: "/", search: "?cameras=SONY+ILCE-7C" },
      { replace: true },
    );
    expect(hoisted.jotaiStoreSet).toHaveBeenCalledTimes(1);
    const applyReturnedFilters = hoisted.jotaiStoreSet.mock.calls[0]?.[1];
    expect(typeof applyReturnedFilters).toBe("function");
    expect(
      applyReturnedFilters({
        selectedTags: [],
        selectedCameras: [],
        selectedLenses: [],
        sortOrder: "desc",
        tagFilterMode: "union",
      }),
    ).toMatchObject({
      selectedTags: [],
      selectedCameras: ["SONY ILCE-7C"],
      selectedLenses: [],
      tagFilterMode: "union",
    });
    expect(setSearchParams).not.toHaveBeenCalled();
  });

  it("does not cancel the close return when the detail search changes during the close delay", async () => {
    vi.useFakeTimers();
    viewerState = {
      currentIndex: 0,
      isOpen: true,
    };
    paramsState = {
      photoId: "visible-photo",
    };
    locationState = {
      pathname: "/photos/visible-photo",
      search: "?lenses=FE+35mm",
    };
    gallerySetting = {
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: ["FE 35mm"],
      sortOrder: "desc",
      tagFilterMode: "union",
    };
    getViewerPhotos.mockReturnValue([visiblePhoto]);

    const { rerender } = render(<Component />);

    expect(getViewerPhotos).toHaveBeenCalledWith("visible-photo");

    vi.clearAllMocks();
    viewerState = {
      currentIndex: 0,
      isOpen: false,
    };

    rerender(<Component />);

    locationState = {
      pathname: "/photos/visible-photo",
      search: "",
    };
    rerender(<Component />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(navigate).toHaveBeenCalledWith(
      { pathname: "/", search: "?lenses=FE+35mm" },
      { replace: true },
    );
  });
});
