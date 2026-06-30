import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getElementTop,
  nextFrame,
  preventDefault,
  stopPropagation,
} from "../dom";

describe("stopPropagation", () => {
  it("calls stopPropagation on the event", () => {
    const event = { stopPropagation: vi.fn() };
    stopPropagation(event as never);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });
});

describe("preventDefault", () => {
  it("calls preventDefault on the event", () => {
    const event = { preventDefault: vi.fn() };
    preventDefault(event as never);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe("nextFrame", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes the callback after two animation frames", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });

    const fn = vi.fn();
    nextFrame(fn);

    // First rAF scheduled, callback not yet called.
    expect(fn).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    // Run the first frame -> schedules the second frame.
    frames[0]!(0);
    expect(fn).not.toHaveBeenCalled();
    expect(frames).toHaveLength(2);

    // Run the second frame -> finally invokes fn.
    frames[1]!(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("getElementTop", () => {
  it("returns the element's own offsetTop when there is no offset parent", () => {
    const el = { offsetTop: 42, offsetParent: null };
    expect(getElementTop(el as never)).toBe(42);
  });

  it("sums offsetTop up the offsetParent chain", () => {
    const grandparent = { offsetTop: 5, offsetParent: null };
    const parent = { offsetTop: 10, offsetParent: grandparent };
    const el = { offsetTop: 20, offsetParent: parent };

    expect(getElementTop(el as never)).toBe(35);
  });
});
