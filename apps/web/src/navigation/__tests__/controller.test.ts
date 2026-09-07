// @vitest-environment node
import { createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NavigationController } from "../controller";
import { parsePhotoId, safeDestination } from "../routes";

const cleanups: (() => void)[] = [];
function setup(url = "/") {
  const router = createMemoryRouter([{ path: "*" }], { initialEntries: [url] });
  const navigation = new NavigationController();
  navigation.bind(router);
  cleanups.push(() => {
    navigation.dispose();
    router.dispose();
  });
  return {
    router,
    navigation,
    href: () => router.state.location.pathname + router.state.location.search,
  };
}
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
});

describe("navigation journeys", () => {
  it("opens with PUSH, steps with REPLACE, closes to the verified source and supports forward", async () => {
    const { navigation: n, router, href } = setup("/?sort=asc&tags=travel");
    const source = router.state.location.key;
    n.openPhoto("a", { photoIds: ["a", "b"] });
    expect(router.state.historyAction).toBe("PUSH");
    n.stepPhoto("b");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(href()).toBe("/photos/b?sort=asc&tags=travel");
    expect(n.getPhotoIds()).toEqual(["a", "b"]);
    n.closePhoto();
    expect(router.state.location.key).toBe(source);
    await router.navigate(1);
    expect(n.getPhotoId()).toBe("b");
    expect(n.isPhotoPresented()).toBe(true);
  });

  it("preserves gallery filters through map and keeps map parameters out of gallery", () => {
    const { navigation: n, href } = setup("/?sort=asc");
    n.showMap();
    n.updateMapSearch("?mode=photos&photoId=a&sort=desc");
    expect(href()).toBe("/explore?photoId=a&mode=photos");
    n.showGallery(undefined, true);
    expect(href()).toBe("/?sort=asc");
  });

  it("returns to the original map selection and camera after photo stepping", () => {
    const { navigation: n, href } = setup("/explore?photoId=a&mode=photos");
    const camera = { longitude: 120, latitude: 30, zoom: 10 };
    n.rememberMapView(camera);
    n.openPhoto("a", { photoIds: ["a", "b"] });
    n.stepPhoto("b");
    n.closePhoto();
    expect(href()).toBe("/explore?photoId=a&mode=photos");
    expect(n.getMapView()).toEqual(camera);
  });

  it("a new location-map intent does not reuse an old panned camera", () => {
    const { navigation: n } = setup("/explore?photoId=a");
    n.rememberMapView({ longitude: 120, latitude: 30, zoom: 10 });
    n.showGallery();
    n.showMap("a");
    expect(n.getMapView()).toBeUndefined();
  });

  it("detail → map → gallery does not reopen detail", () => {
    const { navigation: n, href } = setup("/photos/a?sort=asc");
    n.showMap("a");
    n.showGallery(undefined, true);
    expect(href()).toBe("/?sort=asc");
    expect(n.isPhotoOpen()).toBe(false);
  });

  it("a standalone trailing-slash detail closes by replacement, not browser back", () => {
    const { navigation: n, router, href } = setup("/photos/a/?sort=asc");
    expect(n.getPhotoId()).toBe("a");
    n.closePhoto();
    expect(href()).toBe("/?sort=asc");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("restored history state without a verified predecessor uses a safe fallback", async () => {
    const { navigation: n, router, href } = setup();
    await router.navigate("/photos/a", {
      replace: true,
      state: {
        afilmoryNavigation: {
          version: 1,
          gallerySearch: "?sort=asc",
          originKey: "unknown",
          returnTo: { pathname: "/explore", search: "?mode=photos" },
        },
      },
    });
    n.closePhoto();
    expect(href()).toBe("/explore?mode=photos");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("ignores old close callbacks after a new navigation", () => {
    const { navigation: n, href } = setup();
    n.openPhoto("a");
    const closingKey = n.getLocation().key;
    n.requestPhotoClose();
    expect(n.isPhotoPresented()).toBe(false);
    n.showMap("a");
    n.closePhoto(closingKey);
    expect(href()).toBe("/explore?photoId=a");
    n.openPhoto("b");
    expect(n.isPhotoPresented()).toBe(true);
    n.closePhoto(closingKey);
    expect(n.getPhotoId()).toBe("b");
  });

  it("applying a filter on the map opens the gallery and back restores the map", async () => {
    const { navigation: n, router, href } = setup("/explore?mode=photos");
    n.updateGallerySettings((previous) => ({
      ...previous,
      selectedTags: ["travel"],
    }));
    expect(href()).toBe("/?tags=travel");
    await router.navigate(-1);
    expect(href()).toBe("/explore?mode=photos");
  });

  it("keeps filter snapshot identity stable while stepping through photos", () => {
    const { navigation: n } = setup("/?sort=asc");
    const settings = n.getGallerySettings();
    n.openPhoto("a");
    n.stepPhoto("b");
    expect(n.getGallerySettings()).toBe(settings);
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/photos/a",
    "/missing",
  ])("rejects unsafe legacy returnTo %s", (target) => {
    expect(safeDestination(target)).toBeNull();
    const { navigation: n, href } = setup(
      `/photos/a?returnTo=${encodeURIComponent(target)}`,
    );
    n.closePhoto();
    expect(href()).toBe("/");
  });

  it("accepts a legacy map link but removes nested returnTo and unrelated parameters", () => {
    const { navigation: n, href } = setup(
      `/photos/a?returnTo=${encodeURIComponent("/explore/?mode=photos&returnTo=/photos/a&sort=asc")}`,
    );
    n.closePhoto();
    expect(href()).toBe("/explore?mode=photos");
  });

  it("does not let exit completion cancel an in-flight destination loader", async () => {
    let finish!: () => void;
    const router = createMemoryRouter([
      {
        path: "/explore",
        loader: () =>
          new Promise<null>((resolve) => {
            finish = () => resolve(null);
          }),
      },
      { path: "*" },
    ]);
    const n = new NavigationController();
    n.bind(router);
    cleanups.push(() => {
      n.dispose();
      router.dispose();
    });
    n.openPhoto("a");
    const { key } = n.getLocation();
    n.requestPhotoClose();
    n.showMap("a");
    expect(router.state.navigation.state).toBe("loading");
    n.completePhotoClose(key);
    finish();
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/explore"),
    );
  });

  it("parses encoded IDs and fails safely on malformed routes", () => {
    expect(parsePhotoId("/photos/a%26b%23c/")).toBe("a&b#c");
    expect(parsePhotoId("/photos/%ZZ")).toBeNull();
    expect(parsePhotoId("/photos/a/b")).toBeNull();
  });
});
