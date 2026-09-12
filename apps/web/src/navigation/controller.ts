import type { createBrowserRouter, Location } from "react-router";

import type { GalleryFilterState } from "~/lib/gallery-filter-url";
import { getGalleryFiltersFromSearch } from "~/lib/gallery-filter-url";
import type { MapViewState } from "~/types/map";

import type { AppDestination } from "./routes";
import {
  destinationHref,
  galleryDestination,
  gallerySearch,
  isMapPath,
  mapSearch,
  parsePhotoId,
  photoDestination,
  safeDestination,
} from "./routes";

type RouterPort = Pick<
  ReturnType<typeof createBrowserRouter>,
  "state" | "subscribe" | "navigate"
>;
interface NavigationEntry {
  version: 1;
  gallerySearch: string;
  returnTo?: AppDestination;
  originKey?: string;
  photoIds?: string[];
  photoSequenceOrigin?: "map" | "gallery";
  mapView?: MapViewState;
}
const EMPTY_LOCATION: Location = {
  pathname: "/",
  search: "",
  hash: "",
  state: null,
  key: "default",
};

/** Commands write the router. Selectors read its committed snapshot directly. */
export class NavigationController {
  private router?: RouterPort;
  private unsubscribe?: () => void;
  private listeners = new Set<() => void>();
  private predecessors = new Map<string, string>();
  private lastKey = "";
  private closingKey?: string;
  private mapViews = new Map<string, MapViewState>();
  private validatedEntries = new WeakMap<object, NavigationEntry | null>();
  private settingsSearch?: string;
  private settings = getGalleryFiltersFromSearch("");
  private galleryPositions = new Map<
    string,
    { top: number; focusPhotoId?: string }
  >();
  private currentMapView?: MapViewState;

  bind(router: RouterPort): void {
    this.unsubscribe?.();
    this.router = router;
    this.lastKey = router.state.location.key;
    this.unsubscribe = router.subscribe((state) => {
      if (state.navigation.state !== "idle") this.closingKey = undefined;
      const { key } = state.location;
      if (key !== this.lastKey) {
        this.closingKey = undefined;
        if (state.historyAction === "PUSH")
          this.predecessors.set(key, this.lastKey);
        if (state.historyAction === "REPLACE") {
          const previous = this.predecessors.get(this.lastKey);
          if (previous) this.predecessors.set(key, previous);
        }
        this.lastKey = key;
        if (this.predecessors.size > 200)
          this.predecessors.delete(this.predecessors.keys().next().value!);
      }
      for (const listener of this.listeners) listener();
    });
    for (const listener of this.listeners) listener();
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getLocation = (): Location =>
    this.router?.state.location ?? EMPTY_LOCATION;
  readonly getPhotoId = () => parsePhotoId(this.getLocation().pathname);
  readonly isPhotoOpen = () => this.getPhotoId() !== null;
  readonly isPhotoPresented = () =>
    this.isPhotoOpen() && this.closingKey !== this.getLocation().key;
  requestPhotoClose(): void {
    if (!this.isPhotoOpen()) return;
    this.closingKey = this.getLocation().key;
    for (const listener of this.listeners) listener();
  }

  private entry(): NavigationEntry | undefined {
    const value = this.getLocation().state?.afilmoryNavigation as
      NavigationEntry | undefined;
    if (!value || typeof value !== "object") return undefined;
    if (this.validatedEntries.has(value))
      return this.validatedEntries.get(value) ?? undefined;
    this.validatedEntries.set(value, null);
    if (value.version !== 1 || typeof value.gallerySearch !== "string")
      return undefined;
    if (value.originKey !== undefined && typeof value.originKey !== "string")
      return undefined;
    if (
      value.photoIds !== undefined &&
      (!Array.isArray(value.photoIds) ||
        !value.photoIds.every((id) => typeof id === "string"))
    )
      return undefined;
    if (
      value.photoSequenceOrigin !== undefined &&
      value.photoSequenceOrigin !== "map" &&
      value.photoSequenceOrigin !== "gallery"
    )
      return undefined;
    if (
      value.returnTo &&
      !safeDestination(`${value.returnTo.pathname}${value.returnTo.search}`)
    )
      return undefined;
    if (
      value.mapView &&
      ![
        value.mapView.longitude,
        value.mapView.latitude,
        value.mapView.zoom,
      ].every(Number.isFinite)
    )
      return undefined;
    this.validatedEntries.set(value, value);
    return value;
  }

  readonly getGallerySearch = (): string => {
    const location = this.getLocation();
    return isMapPath(location.pathname)
      ? gallerySearch(this.entry()?.gallerySearch ?? "")
      : gallerySearch(location.search);
  };
  readonly getGallerySettings = (): GalleryFilterState => {
    const search = this.getGallerySearch();
    if (search !== this.settingsSearch) {
      this.settingsSearch = search;
      this.settings = getGalleryFiltersFromSearch(search);
    }
    return this.settings;
  };
  readonly getPhotoIds = () => this.entry()?.photoIds;
  readonly getPhotoSequenceOrigin = () =>
    this.isPhotoOpen() ? (this.entry()?.photoSequenceOrigin ?? null) : null;
  readonly getMapView = () =>
    this.entry()?.mapView ??
    (this.router?.state.historyAction === "POP"
      ? this.mapViews.get(mapSearch(this.getLocation().search))
      : undefined);

  private navigate(
    destination: AppDestination,
    entry: NavigationEntry,
    replace = false,
  ): void {
    if (!this.router) throw new Error("Navigation router is not bound.");
    // Supersede an exit animation before a lazy destination has committed.
    this.closingKey = undefined;
    void this.router.navigate(destination, {
      replace,
      state: { afilmoryNavigation: entry },
    });
  }

  photoHref(id: string): string {
    return destinationHref(photoDestination(id, this.getGallerySearch()));
  }

  openPhoto(id: string, options: { photoIds?: string[] } = {}): void {
    const location = this.getLocation();
    if (this.isPhotoOpen()) {
      this.navigate(
        photoDestination(id, this.getGallerySearch()),
        {
          ...this.entry(),
          version: 1,
          gallerySearch: this.getGallerySearch(),
          photoIds: options.photoIds ?? this.getPhotoIds(),
          photoSequenceOrigin: options.photoIds
            ? "gallery"
            : (this.getPhotoSequenceOrigin() ?? undefined),
        },
        true,
      );
      return;
    }
    const fromMap = isMapPath(location.pathname);
    const returnTo = fromMap
      ? { pathname: "/explore", search: mapSearch(location.search) }
      : { pathname: "/", search: this.getGallerySearch() };
    this.navigate(photoDestination(id, this.getGallerySearch()), {
      version: 1,
      gallerySearch: this.getGallerySearch(),
      returnTo,
      originKey: location.key,
      photoIds: options.photoIds,
      // Only an explicitly supplied map sequence belongs to the map scope.
      // stepPhoto may later persist a full-library fallback for a map pin.
      photoSequenceOrigin: options.photoIds
        ? fromMap
          ? "map"
          : "gallery"
        : undefined,
      mapView: fromMap ? this.currentMapView : undefined,
    });
  }

  stepPhoto(id: string, photoIds?: string[]): void {
    if (!this.isPhotoOpen() || id === this.getPhotoId()) return;
    this.navigate(
      photoDestination(id, this.getGallerySearch()),
      {
        ...this.entry(),
        version: 1,
        gallerySearch: this.getGallerySearch(),
        photoIds: this.getPhotoIds() ?? photoIds,
      },
      true,
    );
  }

  completePhotoClose(expectedKey: string): void {
    if (this.closingKey === expectedKey) this.closePhoto(expectedKey);
  }

  closePhoto(expectedKey = this.getLocation().key): void {
    const location = this.getLocation();
    if (!this.isPhotoOpen() || location.key !== expectedKey) return;
    const entry = this.entry();
    const legacy = safeDestination(
      new URLSearchParams(location.search).get("returnTo"),
    );
    const target = (entry?.returnTo
      ? safeDestination(destinationHref(entry.returnTo))
      : null) ??
      legacy ?? { pathname: "/", search: this.getGallerySearch() };
    if (
      entry?.originKey &&
      this.predecessors.get(location.key) === entry.originKey
    ) {
      void this.router?.navigate(-1);
    } else {
      this.navigate(
        target,
        {
          version: 1,
          gallerySearch: this.getGallerySearch(),
          mapView: entry?.mapView,
        },
        true,
      );
    }
  }

  showMap(photoId?: string): void {
    const location = this.getLocation();
    this.navigate(
      {
        pathname: "/explore",
        search: photoId ? `?${new URLSearchParams({ photoId })}` : "",
      },
      {
        version: 1,
        gallerySearch: this.getGallerySearch(),
        originKey: location.key,
        returnTo: { pathname: "/", search: this.getGallerySearch() },
      },
    );
  }

  showGallery(filters = this.getGallerySettings(), replace = false): void {
    this.navigate(
      galleryDestination(filters),
      { version: 1, gallerySearch: galleryDestination(filters).search },
      replace,
    );
  }

  readonly updateGallerySettings = (
    update:
      | GalleryFilterState
      | ((previous: GalleryFilterState) => GalleryFilterState),
  ): void => {
    const next =
      typeof update === "function" ? update(this.getGallerySettings()) : update;
    if (
      galleryDestination(next).search === this.getGallerySearch() &&
      this.getLocation().pathname === "/"
    )
      return;
    this.showGallery(next);
  };

  updateMapSearch(search: string): void {
    if (!isMapPath(this.getLocation().pathname)) return;
    this.navigate(
      { pathname: "/explore", search: mapSearch(search) },
      {
        ...this.entry(),
        version: 1,
        gallerySearch: this.getGallerySearch(),
        mapView: this.currentMapView,
      },
      true,
    );
  }

  readonly rememberMapView = (view: MapViewState): void => {
    this.currentMapView = view;
    this.mapViews.set(mapSearch(this.getLocation().search), view);
    if (this.mapViews.size > 50)
      this.mapViews.delete(this.mapViews.keys().next().value!);
  };
  getGalleryPosition(search: string) {
    return this.galleryPositions.get(search);
  }
  rememberGalleryPosition(
    search: string,
    top: number,
    focusPhotoId?: string,
  ): void {
    this.galleryPositions.set(search, { top, focusPhotoId });
    if (this.galleryPositions.size > 50)
      this.galleryPositions.delete(this.galleryPositions.keys().next().value!);
  }
  dispose(): void {
    this.unsubscribe?.();
    this.listeners.clear();
    this.predecessors.clear();
    this.galleryPositions.clear();
    this.mapViews.clear();
    this.router = undefined;
    this.unsubscribe = undefined;
    this.currentMapView = undefined;
    this.closingKey = undefined;
    this.validatedEntries = new WeakMap();
  }
}
