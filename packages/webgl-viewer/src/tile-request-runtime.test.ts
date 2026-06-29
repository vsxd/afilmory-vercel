import { describe, expect, it } from "vitest";

import { TileRequestRuntime } from "./tile-request-runtime";

describe("TileRequestRuntime", () => {
  it("dedupes visible tile requests and keeps the better priority", () => {
    const runtime = new TileRequestRuntime();

    expect(
      runtime.queueVisibleTile({
        hasCachedTile: false,
        key: "1-1-0",
        priority: 10,
      }),
    ).toBe(true);
    expect(
      runtime.queueVisibleTile({
        hasCachedTile: false,
        key: "1-1-0",
        priority: 3,
      }),
    ).toBe(false);

    expect(runtime.pendingTileRequests.get("1-1-0")).toBe(3);
  });

  it("selects pending batches and tracks loading state", () => {
    const runtime = new TileRequestRuntime();
    runtime.queueVisibleTile({
      hasCachedTile: false,
      key: "1-1-0",
      priority: 10,
    });
    runtime.queueVisibleTile({
      hasCachedTile: false,
      key: "0-0-0",
      priority: 1,
    });

    const batch = runtime.selectBatch(1);

    expect(batch).toEqual([{ key: "0-0-0", priority: 1 }]);
    expect(runtime.getLoadingInfo("0-0-0")).toEqual({ priority: 1 });
    expect(runtime.hasPendingWork).toBe(true);

    runtime.markLoaded("0-0-0");
    expect(runtime.getLoadingInfo("0-0-0")).toBeUndefined();
    runtime.clear();
    expect(runtime.hasPendingWork).toBe(false);
  });

  it("prunes pending requests for tiles that are no longer visible", () => {
    const runtime = new TileRequestRuntime();
    runtime.queueVisibleTile({
      hasCachedTile: false,
      key: "0-0-0",
      priority: 1,
    });
    runtime.queueVisibleTile({
      hasCachedTile: false,
      key: "1-0-0",
      priority: 2,
    });
    runtime.queueVisibleTile({
      hasCachedTile: false,
      key: "2-0-0",
      priority: 3,
    });

    const removed = runtime.pruneInvisiblePending(new Set(["1-0-0"]));

    expect(removed).toBe(2);
    expect([...runtime.pendingTileRequests.keys()]).toEqual(["1-0-0"]);
  });

  it("leaves in-flight (loading) tiles untouched when pruning", () => {
    const runtime = new TileRequestRuntime();
    runtime.queueVisibleTile({
      hasCachedTile: false,
      key: "0-0-0",
      priority: 1,
    });
    runtime.selectBatch(1); // moves 0-0-0 into loadingTiles
    runtime.queueVisibleTile({
      hasCachedTile: false,
      key: "9-9-0",
      priority: 5,
    });

    runtime.pruneInvisiblePending(new Set()); // nothing visible

    expect(runtime.getLoadingInfo("0-0-0")).toEqual({ priority: 1 });
    expect(runtime.pendingTileRequests.size).toBe(0);
  });
});
