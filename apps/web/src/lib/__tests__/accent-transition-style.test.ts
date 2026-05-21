import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAccentTransitionStyle,
  getAccentTransitionStyle,
} from "../accent-transition-style";

describe("accent transition style", () => {
  afterEach(() => {
    vi.useRealTimers();
    document
      .querySelectorAll('style[data-afilmory-accent-transition="true"]')
      .forEach((style) => {
        style.remove();
      });
  });

  it("removes the temporary style when cleanup runs before the timeout", () => {
    vi.useFakeTimers();

    const cleanup = applyAccentTransitionStyle(100);

    expect(getAccentTransitionStyle()).not.toBeNull();

    cleanup();

    expect(getAccentTransitionStyle()).toBeNull();

    vi.runAllTimers();

    expect(getAccentTransitionStyle()).toBeNull();
  });

  it("removes the temporary style automatically after the timeout", () => {
    vi.useFakeTimers();

    applyAccentTransitionStyle(100);

    expect(getAccentTransitionStyle()).not.toBeNull();

    vi.advanceTimersByTime(100);

    expect(getAccentTransitionStyle()).toBeNull();
  });

  it("keeps overlapping transition styles independent until each caller finishes", () => {
    vi.useFakeTimers();

    const firstCleanup = applyAccentTransitionStyle(100);
    const secondCleanup = applyAccentTransitionStyle(200);

    expect(
      document.querySelectorAll(
        'style[data-afilmory-accent-transition="true"]',
      ),
    ).toHaveLength(2);

    firstCleanup();

    expect(
      document.querySelectorAll(
        'style[data-afilmory-accent-transition="true"]',
      ),
    ).toHaveLength(1);

    vi.advanceTimersByTime(100);

    expect(
      document.querySelectorAll(
        'style[data-afilmory-accent-transition="true"]',
      ),
    ).toHaveLength(1);

    secondCleanup();

    expect(getAccentTransitionStyle()).toBeNull();
  });
});
