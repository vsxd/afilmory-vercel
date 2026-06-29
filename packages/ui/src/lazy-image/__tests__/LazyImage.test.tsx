import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LazyImage } from "../index";

// Minimal IntersectionObserver stub that immediately reports the observed
// element as intersecting, so `useInView` resolves to inView=true in jsdom.
class ImmediateIntersectionObserver {
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, intersectionRatio: 1, target } as never],
      this as never,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

describe("LazyImage", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resets the error state when the src changes so a new image can load", () => {
    const { rerender } = render(<LazyImage src="/a.jpg" alt="a" />);

    // Simulate the first image failing to load.
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Failed to load image")).not.toBeNull();

    // Swapping the src must clear the stuck error and render the new <img>.
    rerender(<LazyImage src="/b.jpg" alt="b" />);

    expect(screen.queryByText("Failed to load image")).toBeNull();
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/b.jpg");
  });
});
