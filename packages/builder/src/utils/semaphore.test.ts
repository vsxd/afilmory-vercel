import { describe, expect, it } from "vitest";

import { Semaphore } from "./semaphore.js";

describe("Semaphore", () => {
  it("allows up to `permits` concurrent acquisitions without blocking", async () => {
    const sem = new Semaphore(2);
    const release1 = await sem.acquire();
    const release2 = await sem.acquire();
    expect(typeof release1).toBe("function");
    expect(typeof release2).toBe("function");
    release1();
    release2();
  });

  it("queues acquisitions beyond the permit count until a release happens", async () => {
    const sem = new Semaphore(1);
    const release1 = await sem.acquire();

    let acquired2 = false;
    const pending = sem.acquire().then((release) => {
      acquired2 = true;
      return release;
    });

    // Flush microtasks: the second acquire must still be parked.
    await Promise.resolve();
    expect(acquired2).toBe(false);

    release1();
    const release2 = await pending;
    expect(acquired2).toBe(true);
    release2();
  });

  it("treats a permit count below 1 as exactly 1", async () => {
    const sem = new Semaphore(0); // clamped up to 1 permit
    const release = await sem.acquire();

    let second = false;
    const pending = sem.acquire().then((release2) => {
      second = true;
      return release2;
    });

    await Promise.resolve();
    expect(second).toBe(false); // second acquire parked behind the lone permit

    release();
    const release2 = await pending; // deterministic wait for the hand-off
    expect(second).toBe(true);
    release2();
  });

  it("run() bounds concurrency and returns each fn's result in order", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxActive = 0;

    const task = async (value: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    };

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => sem.run(() => task(n))),
    );

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("releases the permit even when the wrapped fn throws", async () => {
    const sem = new Semaphore(1);

    await expect(
      sem.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // If the permit leaked, this acquire would block forever.
    const release = await sem.acquire();
    expect(typeof release).toBe("function");
    release();
  });
});
