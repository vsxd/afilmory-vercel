import { describe, expect, it } from "vitest";

import { ImageConversionPipeline } from "../pipeline";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush every pending microtask chain (real timers, zero-delay macrotask). */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Tasks that block on a per-invocation gate while tracking how many run
 * simultaneously, so tests can observe (not just infer) the concurrency level.
 */
function createGatedTaskTracker() {
  let active = 0;
  let maxActive = 0;
  const gates: Deferred<string>[] = [];

  const makeTask = () => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    const gate = createDeferred<string>();
    gates.push(gate);
    try {
      return await gate.promise;
    } finally {
      active -= 1;
    }
  };

  return {
    makeTask,
    gates,
    activeCount: () => active,
    maxActiveCount: () => maxActive,
  };
}

describe("ImageConversionPipeline", () => {
  it("removes cancelled queued work while keeping a cancelled active codec in its slot", async () => {
    const pipeline = new ImageConversionPipeline({ maxConcurrent: 1 });
    const gate = createDeferred<string>();
    const activeSignal = new AbortController();
    const queuedSignal = new AbortController();
    const active = pipeline.enqueue(() => gate.promise, activeSignal.signal);
    let queuedRan = false;
    const queued = pipeline.enqueue(async () => {
      queuedRan = true;
      return "queued";
    }, queuedSignal.signal);
    const cancelledActive = expect(active).rejects.toMatchObject({
      name: "AbortError",
    });
    const cancelledQueued = expect(queued).rejects.toMatchObject({
      name: "AbortError",
    });
    activeSignal.abort();
    queuedSignal.abort();
    await Promise.all([cancelledActive, cancelledQueued]);
    expect(pipeline.getActiveCount()).toBe(1);
    expect(pipeline.getPendingCount()).toBe(0);
    let drained = false;
    const disposal = pipeline.dispose().then(() => {
      drained = true;
    });
    await tick();
    expect(drained).toBe(false);
    gate.resolve("late result");
    await disposal;
    expect(queuedRan).toBe(false);
    expect(pipeline.getActiveCount()).toBe(0);
    await expect(pipeline.enqueue(async () => "closed")).rejects.toMatchObject({
      name: "AbortError",
    });
    await pipeline.dispose();
  });

  it("never runs more than maxConcurrent tasks at once and admits queued tasks as slots free", async () => {
    const pipeline = new ImageConversionPipeline({ maxConcurrent: 2 });
    const tracker = createGatedTaskTracker();

    const results = Array.from({ length: 4 }, () =>
      pipeline.enqueue(tracker.makeTask()),
    );
    await tick();

    expect(tracker.activeCount()).toBe(2);
    expect(tracker.gates).toHaveLength(2);
    expect(pipeline.getActiveCount()).toBe(2);
    expect(pipeline.getPendingCount()).toBe(2);

    tracker.gates[0].resolve("first");
    await tick();

    expect(tracker.activeCount()).toBe(2);
    expect(tracker.gates).toHaveLength(3);
    expect(pipeline.getPendingCount()).toBe(1);

    tracker.gates[1].resolve("second");
    tracker.gates[2].resolve("third");
    await tick();
    tracker.gates[3].resolve("fourth");

    await expect(Promise.all(results)).resolves.toEqual([
      "first",
      "second",
      "third",
      "fourth",
    ]);
    expect(tracker.maxActiveCount()).toBe(2);
    expect(pipeline.getActiveCount()).toBe(0);
    expect(pipeline.getPendingCount()).toBe(0);
  });

  it("releases the slot when a task rejects so queued tasks still run", async () => {
    const pipeline = new ImageConversionPipeline({ maxConcurrent: 1 });
    const gate = createDeferred<string>();

    const failing = pipeline.enqueue(() => gate.promise);
    let secondRan = false;
    const queued = pipeline.enqueue(async () => {
      secondRan = true;
      return "still runs";
    });
    await tick();
    expect(secondRan).toBe(false);

    const failingRejection = expect(failing).rejects.toThrow("decode failed");
    gate.reject(new Error("decode failed"));
    await failingRejection;

    await expect(queued).resolves.toBe("still runs");
    expect(secondRan).toBe(true);
    expect(pipeline.getActiveCount()).toBe(0);
    expect(pipeline.getPendingCount()).toBe(0);
  });

  it("turns a synchronously throwing executor into a rejection without wedging the queue", async () => {
    const pipeline = new ImageConversionPipeline({ maxConcurrent: 1 });

    const failing = pipeline.enqueue(() => {
      throw new Error("executor threw before returning a promise");
    });
    await expect(failing).rejects.toThrow(
      "executor threw before returning a promise",
    );

    await expect(pipeline.enqueue(async () => "alive")).resolves.toBe("alive");
    expect(pipeline.getActiveCount()).toBe(0);
  });

  it("clamps the concurrency limit to at least one and defaults to two", () => {
    expect(
      new ImageConversionPipeline({ maxConcurrent: 0 }).getMaxConcurrent(),
    ).toBe(1);
    expect(
      new ImageConversionPipeline({ maxConcurrent: -3 }).getMaxConcurrent(),
    ).toBe(1);
    expect(new ImageConversionPipeline().getMaxConcurrent()).toBe(2);
  });

  it("rejects non-finite concurrency limits", () => {
    const pipeline = new ImageConversionPipeline();
    expect(() => pipeline.setMaxConcurrent(Number.NaN)).toThrow(TypeError);
    expect(() => pipeline.setMaxConcurrent(Number.POSITIVE_INFINITY)).toThrow(
      TypeError,
    );
  });

  it("immediately admits queued tasks up to the new limit when the concurrency limit is raised", async () => {
    const pipeline = new ImageConversionPipeline({ maxConcurrent: 1 });
    const tracker = createGatedTaskTracker();

    const first = pipeline.enqueue(tracker.makeTask());
    const second = pipeline.enqueue(tracker.makeTask());
    const third = pipeline.enqueue(tracker.makeTask());
    await tick();

    expect(pipeline.getActiveCount()).toBe(1);
    expect(pipeline.getPendingCount()).toBe(2);

    pipeline.setMaxConcurrent(3);
    await tick();

    expect(tracker.activeCount()).toBe(3);
    expect(pipeline.getActiveCount()).toBe(3);
    expect(pipeline.getPendingCount()).toBe(0);

    tracker.gates[0].resolve("first");
    tracker.gates[1].resolve("second");
    tracker.gates[2].resolve("third");
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(tracker.maxActiveCount()).toBe(3);
    expect(pipeline.getActiveCount()).toBe(0);
  });
});
