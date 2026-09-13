import { act, cleanup, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { createContext, use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isCommandPaletteOpenAtom } from "~/atoms/app";
import { createTestNavigation } from "~/navigation/__tests__/test-router";
import type { NavigationController } from "~/navigation/controller";

import { useCommandPaletteSession } from "../useCommandPaletteSession";

const TestNavigationContext = createContext<NavigationController | null>(null);
vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({ navigation: use(TestNavigationContext)! }),
}));

afterEach(cleanup);

function setup(url = "/") {
  const { navigation, router } = createTestNavigation(url);
  const store = createStore();
  const hook = renderHook(() => useCommandPaletteSession(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <TestNavigationContext value={navigation}>
        <Provider store={store}>{children}</Provider>
      </TestNavigationContext>
    ),
  });
  const openPalette = () => {
    act(() => store.set(isCommandPaletteOpenAtom, true));
  };
  const openPhoto = (id = "a") => {
    act(() => {
      hook.result.current.onPhotoOpen();
      navigation.openPhoto(id);
    });
  };
  return { ...hook, navigation, router, store, openPalette, openPhoto };
}

describe("command palette browsing session", () => {
  it("mounts only after first use and keeps the instance after ordinary closure", () => {
    const session = setup();
    expect(session.result.current.shouldMount).toBe(false);

    session.openPalette();
    expect(session.result.current.shouldMount).toBe(true);
    expect(session.result.current.isOpen).toBe(true);
    act(() => session.result.current.onClose());
    expect(session.result.current.shouldMount).toBe(true);
    expect(session.result.current.isOpen).toBe(false);
    expect(session.result.current.restoreFocusOnClose).toBe(true);

    session.openPalette();
    expect(session.result.current.isOpen).toBe(true);
  });

  it("resumes only after the photo route closes, preserving the source through steps", () => {
    const session = setup("/?sort=asc&tags=travel");
    const origin = session.navigation.getLocation();
    session.openPalette();
    session.openPhoto();
    expect(session.result.current.isOpen).toBe(false);
    expect(session.result.current.restoreFocusOnClose).toBe(false);

    act(() => session.navigation.stepPhoto("b"));
    const closingKey = session.navigation.getLocation().key;
    act(() => session.navigation.requestPhotoClose());
    expect(session.navigation.isPhotoPresented()).toBe(false);
    expect(session.result.current.isOpen).toBe(false);

    act(() => session.navigation.completePhotoClose(closingKey));
    expect(session.navigation.getLocation()).toEqual(origin);
    expect(session.result.current.isOpen).toBe(true);
    expect(session.result.current.restoreFocusOnClose).toBe(true);
  });

  it("resumes on browser back to the exact map entry", async () => {
    const session = setup("/explore?photoId=a&mode=photos");
    session.openPalette();
    session.openPhoto();
    act(() => session.navigation.stepPhoto("b"));

    await act(() => session.router.navigate(-1));
    expect(session.navigation.getLocation().pathname).toBe("/explore");
    expect(session.result.current.isOpen).toBe(true);
  });

  it("tracks a complete navigation round trip even when React batches its renders", () => {
    const session = setup();
    session.openPalette();
    act(() => {
      session.result.current.onPhotoOpen();
      session.navigation.openPhoto("a");
      session.navigation.closePhoto();
    });
    expect(session.result.current.isOpen).toBe(true);
  });

  it("waits if the photo navigation has not committed yet", () => {
    const session = setup();
    session.openPalette();
    act(() => session.result.current.onPhotoOpen());
    expect(session.navigation.getLocation().pathname).toBe("/");
    expect(session.result.current.isOpen).toBe(false);

    act(() => session.navigation.openPhoto("a"));
    expect(session.result.current.isOpen).toBe(false);
    act(() => session.navigation.closePhoto());
    expect(session.result.current.isOpen).toBe(true);
  });

  it("forgets the return when another destination supersedes the photo", async () => {
    const session = setup();
    session.openPalette();
    session.openPhoto();
    act(() => {
      session.navigation.requestPhotoClose();
      session.navigation.showMap("a");
    });
    expect(session.result.current.isOpen).toBe(false);

    await act(() => session.router.navigate(-2));
    expect(session.navigation.getLocation().pathname).toBe("/");
    expect(session.result.current.isOpen).toBe(false);
  });

  it("does not treat a new entry at the same URL as a return to search", async () => {
    const session = setup();
    const originKey = session.navigation.getLocation().key;
    session.openPalette();
    session.openPhoto();
    act(() => session.navigation.showGallery());
    expect(session.navigation.getLocation().pathname).toBe("/");
    expect(session.navigation.getLocation().key).not.toBe(originKey);
    expect(session.result.current.isOpen).toBe(false);

    await act(() => session.router.navigate(-2));
    expect(session.navigation.getLocation().key).toBe(originKey);
    expect(session.result.current.isOpen).toBe(false);
  });

  it("does not resume an ordinary closed search for unrelated photo navigation", () => {
    const session = setup();
    session.openPalette();
    act(() => session.result.current.onClose());
    act(() => session.navigation.openPhoto("a"));
    act(() => session.navigation.closePhoto());
    expect(session.result.current.isOpen).toBe(false);
  });

  it("does not invent a search return for a direct photo entry", () => {
    const session = setup("/photos/a");
    session.openPalette();
    session.openPhoto("b");
    expect(session.result.current.restoreFocusOnClose).toBe(false);
    act(() => session.navigation.closePhoto());
    expect(session.navigation.getLocation().pathname).toBe("/");
    expect(session.result.current.isOpen).toBe(false);
  });

  it("hides resumed search for browser Forward without replaying its earlier return", async () => {
    const session = setup();
    session.openPalette();
    session.openPhoto();
    act(() => session.navigation.closePhoto());
    expect(session.result.current.isOpen).toBe(true);

    await act(() => session.router.navigate(1));
    expect(session.navigation.getPhotoId()).toBe("a");
    expect(session.result.current.isOpen).toBe(false);
    expect(session.result.current.restoreFocusOnClose).toBe(false);
    act(() => session.navigation.closePhoto());
    expect(session.result.current.isOpen).toBe(false);
  });

  it("hides search for a new photo entry but allows search on the current photo", () => {
    const session = setup();
    session.openPalette();
    act(() => session.navigation.openPhoto("a"));
    expect(session.result.current.isOpen).toBe(false);

    session.openPalette();
    expect(session.result.current.isOpen).toBe(true);
    act(() => session.navigation.stepPhoto("b"));
    expect(session.result.current.isOpen).toBe(false);
    act(() => session.navigation.closePhoto());
    expect(session.result.current.isOpen).toBe(false);
  });

  it("lets a fresh explicit search recover an uncommitted photo navigation", () => {
    const session = setup();
    session.openPalette();
    act(() => session.result.current.onPhotoOpen());
    expect(session.result.current.isOpen).toBe(false);

    session.openPalette();
    expect(session.result.current.isOpen).toBe(true);
    expect(session.result.current.restoreFocusOnClose).toBe(true);
    act(() => session.result.current.onClose());
    act(() => session.navigation.openPhoto("a"));
    act(() => session.navigation.closePhoto());
    expect(session.result.current.isOpen).toBe(false);
  });

  it("cancels the suspended return when search is reopened and explicitly closed", () => {
    const session = setup();
    session.openPalette();
    session.openPhoto();
    session.openPalette();
    act(() => session.result.current.onClose());
    act(() => session.navigation.closePhoto());
    expect(session.result.current.isOpen).toBe(false);
  });

  it("isolates app instances and starts a refreshed session without pending search", () => {
    const first = setup();
    first.openPalette();
    first.openPhoto();
    const refreshed = setup("/photos/a");
    expect(refreshed.result.current.shouldMount).toBe(false);
    expect(refreshed.result.current.isOpen).toBe(false);

    act(() => first.navigation.closePhoto());
    expect(first.result.current.isOpen).toBe(true);
    expect(refreshed.result.current.isOpen).toBe(false);
    act(() => refreshed.navigation.closePhoto());
    expect(refreshed.result.current.shouldMount).toBe(false);
  });
});
