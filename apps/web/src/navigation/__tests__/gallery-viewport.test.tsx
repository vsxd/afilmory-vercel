import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NavigationController } from "../controller";
import { useGalleryViewport } from "../useGalleryViewport";

let navigation: NavigationController;
vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({ navigation }),
}));
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  navigation.dispose();
});

describe("gallery viewport memory", () => {
  it("does not overwrite a saved position with zero after the viewport is detached", () => {
    navigation = new NavigationController();
    const element = document.createElement("div");
    document.body.append(element);
    const { unmount } = renderHook(() => useGalleryViewport(element));
    act(() => {
      element.scrollTop = 400;
      element.dispatchEvent(new Event("scroll"));
    });
    expect(navigation.getGalleryPosition("")?.top).toBe(400);
    element.remove();
    element.scrollTop = 0;
    unmount();
    expect(navigation.getGalleryPosition("")?.top).toBe(400);
  });
});
