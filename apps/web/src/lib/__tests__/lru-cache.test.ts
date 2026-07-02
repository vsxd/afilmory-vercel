import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBlobUrlCache, LRUCache } from "../lru-cache";

describe("LRUCache", () => {
  it("stores and retrieves values", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
    expect(cache.size()).toBe(2);
  });

  it("returns undefined for missing keys", () => {
    const cache = new LRUCache<string, number>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("defaults to a maxSize of 10", () => {
    const cache = new LRUCache<number, number>();
    expect(cache.getStats().maxSize).toBe(10);
  });

  it("reports has() correctly", () => {
    const cache = new LRUCache<string, number>();
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("evicts the least recently used entry when full", () => {
    const evicted: Array<[string, string]> = [];
    const cache = new LRUCache<string, number>(3, (_v, key, reason) => {
      evicted.push([key, reason]);
    });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // Adding a 4th entry evicts "a" (least recently used).
    cache.set("d", 4);

    expect(cache.has("a")).toBe(false);
    expect(cache.getStats().keys).toEqual(["b", "c", "d"]);
    expect(evicted).toEqual([["a", "LRU eviction: a"]]);
  });

  it("get() marks an entry as most recently used, protecting it from eviction", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Touch "a" so it becomes most-recently-used.
    expect(cache.get("a")).toBe(1);
    expect(cache.getStats().keys).toEqual(["b", "c", "a"]);

    // Now "b" is the LRU entry and gets evicted instead of "a".
    cache.set("d", 4);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.getStats().keys).toEqual(["c", "a", "d"]);
  });

  it("replacing an existing key cleans up the old value and keeps size stable", () => {
    const cleanup = vi.fn();
    const cache = new LRUCache<string, number>(3, cleanup);
    cache.set("a", 1);
    cache.set("a", 2);

    expect(cache.get("a")).toBe(2);
    expect(cache.size()).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(
      1,
      "a",
      "Replacing existing cache entry for a",
    );
  });

  it("replacing an existing key moves it to the most-recently-used position", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);

    expect(cache.getStats().keys).toEqual(["b", "a"]);
  });

  it("delete() removes an entry, runs cleanup, and reports whether it existed", () => {
    const cleanup = vi.fn();
    const cache = new LRUCache<string, number>(3, cleanup);
    cache.set("a", 1);

    expect(cache.delete("a")).toBe(true);
    expect(cache.has("a")).toBe(false);
    expect(cleanup).toHaveBeenCalledWith(1, "a", "Manual deletion: a");

    // Deleting a missing key returns false and does not invoke cleanup again.
    cleanup.mockClear();
    expect(cache.delete("missing")).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("clear() removes everything and runs cleanup for each entry", () => {
    const cleanup = vi.fn();
    const cache = new LRUCache<string, number>(5, cleanup);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.getStats().keys).toEqual([]);
    expect(cleanup).toHaveBeenCalledTimes(3);
    expect(cleanup).toHaveBeenCalledWith(1, "a", "Cache clear: a");
  });

  it("getStats() reflects size, maxSize, and insertion order of keys", () => {
    const cache = new LRUCache<string, number>(4);
    cache.set("x", 1);
    cache.set("y", 2);

    expect(cache.getStats()).toEqual({
      size: 2,
      maxSize: 4,
      keys: ["x", "y"],
    });
  });

  it("exposes values() and entries() iterators in recency order", () => {
    const cache = new LRUCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);

    expect(Array.from(cache.values())).toEqual([1, 2]);
    expect(Array.from(cache.entries())).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("swallows cleanup errors and logs a warning instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = new LRUCache<string, number>(1, () => {
      throw new Error("cleanup boom");
    });
    cache.set("a", 1);

    // Eviction triggers the throwing cleanup but must not propagate.
    expect(() => cache.set("b", 2)).not.toThrow();
    expect(cache.has("b")).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does no cleanup work when no cleanup function is provided", () => {
    const cache = new LRUCache<string, number>(1);
    cache.set("a", 1);
    // Eviction with no cleanup function must not throw.
    expect(() => cache.set("b", 2)).not.toThrow();
    expect(cache.getStats().keys).toEqual(["b"]);
  });

  it("documents the undefined-value quirk: stored undefined is indistinguishable from a miss", () => {
    const cache = new LRUCache<string, number | undefined>(3);
    cache.set("a", undefined);

    // The key is present...
    expect(cache.has("a")).toBe(true);
    expect(cache.size()).toBe(1);
    // ...but get() and delete() treat the undefined value as "not found".
    expect(cache.get("a")).toBeUndefined();
    expect(cache.delete("a")).toBe(false);
    expect(cache.has("a")).toBe(true);
  });
});

describe("LRUCache byte budget", () => {
  interface Entry {
    name: string;
    bytes: number;
  }

  const byteBudget = (maxBytes: number) => ({
    maxBytes,
    sizeOf: (v: Entry) => v.bytes,
  });

  it("evicts least-recently-used entries until under the byte budget", () => {
    const cleanup = vi.fn();
    const cache = new LRUCache<string, Entry>(50, cleanup, byteBudget(10));

    cache.set("a", { name: "a", bytes: 4 });
    cache.set("b", { name: "b", bytes: 4 });
    cache.set("c", { name: "c", bytes: 4 }); // 12 > 10 → 逐出 a

    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup.mock.calls[0][1]).toBe("a");
  });

  it("keeps at least the newest entry even when it alone exceeds the budget", () => {
    const cache = new LRUCache<string, Entry>(50, undefined, byteBudget(10));
    cache.set("huge", { name: "huge", bytes: 100 });
    expect(cache.has("huge")).toBe(true);
    expect(cache.size()).toBe(1);
  });

  it("accounts bytes on replace and delete", () => {
    const cache = new LRUCache<string, Entry>(50, undefined, byteBudget(10));
    cache.set("a", { name: "a", bytes: 8 });
    cache.set("a", { name: "a2", bytes: 2 }); // 替换：8 → 2
    cache.set("b", { name: "b", bytes: 8 }); // 2+8=10，恰好不逐出
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(true);

    cache.delete("a");
    cache.set("c", { name: "c", bytes: 2 }); // 8+2=10，仍不逐出
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("recently-used entries survive byte eviction (LRU order respected)", () => {
    const cache = new LRUCache<string, Entry>(50, undefined, byteBudget(10));
    cache.set("a", { name: "a", bytes: 4 });
    cache.set("b", { name: "b", bytes: 4 });
    cache.get("a"); // a 变为最新
    cache.set("c", { name: "c", bytes: 4 }); // 超预算 → 逐出 b（最久未用）
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("does not evict by bytes when no budget is configured (back-compat)", () => {
    const cache = new LRUCache<string, Entry>(3);
    cache.set("a", { name: "a", bytes: 1e9 });
    cache.set("b", { name: "b", bytes: 1e9 });
    expect(cache.size()).toBe(2);
  });
});

describe("createBlobUrlCache", () => {
  let counter = 0;

  beforeEach(() => {
    counter = 0;
    // jsdom's object-URL support is inconsistent across versions; install
    // spy-able stubs so vi.spyOn always has something to wrap regardless.
    Object.assign(URL, {
      createObjectURL: () => "",
      revokeObjectURL: () => {},
    });
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:mock/${++counter}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("revokes the blob URL of an evicted entry", () => {
    const cache = createBlobUrlCache<{ url?: string }>(1);
    cache.set("a", { url: "blob:one" });
    cache.set("b", { url: "blob:two" });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:one");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes blob URLs on manual delete and on clear", () => {
    const cache = createBlobUrlCache<{ url?: string }>(5);
    cache.set("a", { url: "blob:a" });
    cache.set("b", { url: "blob:b" });

    cache.delete("a");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:a");

    cache.clear();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:b");
  });

  it("does not revoke when the evicted value has no url", () => {
    const cache = createBlobUrlCache<{ url?: string }>(1);
    cache.set("a", {});
    cache.set("b", { url: "blob:b" });

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("swallows revoke errors during cleanup", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(URL.revokeObjectURL).mockImplementation(() => {
      throw new Error("revoke failed");
    });

    const cache = createBlobUrlCache<{ url?: string }>(1);
    cache.set("a", { url: "blob:a" });

    expect(() => cache.set("b", { url: "blob:b" })).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
