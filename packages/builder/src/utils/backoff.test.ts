import { afterEach, describe, expect, it, vi } from "vitest";

import { backoffDelay, sleep } from "./backoff.js";

describe("backoffDelay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grows exponentially with the attempt number (jitter pinned to 0)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelay(1, 300, 4000)).toBe(300); // 300 * 2^0
    expect(backoffDelay(2, 300, 4000)).toBe(600); // 300 * 2^1
    expect(backoffDelay(3, 300, 4000)).toBe(1200); // 300 * 2^2
  });

  it("caps the exponential term at maxMs (before jitter is added)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // 300 * 2^9 = 153600, capped down to 4000
    expect(backoffDelay(10, 300, 4000)).toBe(4000);
  });

  it("adds jitter on top of the already-capped term, so the result can exceed maxMs", () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // maximum jitter
    // exp capped at 4000; jitter = 1 * 0.3 * 4000 = 1200 -> 5200
    expect(backoffDelay(10, 300, 4000)).toBe(5200);
  });

  it("always returns an integer", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4242);
    expect(Number.isInteger(backoffDelay(2, 300, 4000))).toBe(true);
  });

  it("keeps the result within [exp, floor(exp * 1.3)] for any random jitter", () => {
    // exp for attempt 2 = 600; jitter in [0, 0.3 * 600) => result in [600, 779]
    for (let i = 0; i < 100; i++) {
      const d = backoffDelay(2, 300, 4000);
      expect(d).toBeGreaterThanOrEqual(600);
      expect(d).toBeLessThanOrEqual(Math.floor(600 * 1.3));
    }
  });

  it("uses base=300/max=4000 defaults when omitted", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelay(1)).toBe(300);
    expect(backoffDelay(4)).toBe(2400); // 300 * 2^3
  });
});

describe("sleep", () => {
  it("resolves only after the requested delay elapses", async () => {
    vi.useFakeTimers();
    try {
      let resolved = false;
      const promise = sleep(1000).then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
