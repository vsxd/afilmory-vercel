import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { useRef } from "react";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DOMImageViewer } from "../DOMImageViewer";

vi.mock("motion/react", () => ({ useReducedMotion: () => true }));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DOMImageViewer with the installed zoom library", () => {
  it("toggles fit and native size around the pointer and reports zoom changes", () => {
    const { result } = renderHook(() => useRef<ReactZoomPanPinchRef>(null));
    const ref = result.current;
    const onZoomChange = vi.fn();
    render(
      <DOMImageViewer
        ref={ref}
        src="/photo.jpg"
        alt="Photo"
        minZoom={1}
        maxZoom={10}
        highResLoaded
        onZoomChange={onZoomChange}
      />,
    );
    const img = screen.getByRole("img");
    Object.defineProperties(img, {
      naturalWidth: { value: 1000 },
      naturalHeight: { value: 800 },
    });
    const wrapper = ref.current!.instance.wrapperComponent!;
    Object.defineProperties(wrapper, {
      clientWidth: { value: 500 },
      clientHeight: { value: 400 },
    });

    fireEvent.doubleClick(img, { clientX: 100, clientY: 80 });
    expect(ref.current!.state).toMatchObject({
      scale: 2,
      positionX: -100,
      positionY: -80,
    });
    expect(onZoomChange).toHaveBeenLastCalledWith(true, 1);

    fireEvent.doubleClick(img, { clientX: 100, clientY: 80 });
    expect(ref.current!.state).toMatchObject({
      scale: 1,
      positionX: 0,
      positionY: 0,
    });
    expect(onZoomChange).toHaveBeenLastCalledWith(false, 0.5);
  });
});
