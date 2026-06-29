import type { TileKey } from "./tile-cache";
import { selectPendingTileBatch } from "./tile-scheduler";

export interface LoadingTileInfo {
  priority: number;
}

export class TileRequestRuntime {
  readonly loadingTiles = new Map<TileKey, LoadingTileInfo>();
  readonly pendingTileRequests = new Map<TileKey, number>();

  queueVisibleTile({
    hasCachedTile,
    key,
    priority,
  }: {
    hasCachedTile: boolean;
    key: TileKey;
    priority: number;
  }): boolean {
    const pendingPriority = this.pendingTileRequests.get(key);

    if (
      !hasCachedTile &&
      !this.loadingTiles.has(key) &&
      pendingPriority === undefined
    ) {
      this.pendingTileRequests.set(key, priority);
      return true;
    }

    if (pendingPriority !== undefined) {
      this.pendingTileRequests.set(key, Math.min(pendingPriority, priority));
    }

    return false;
  }

  /**
   * Drop queued-but-not-yet-dispatched requests for tiles that are no longer
   * visible. During fast pan/zoom this prevents stale tiles from being
   * dispatched (consuming per-frame dispatch slots and worker time) ahead of the
   * tiles the user is actually looking at. In-flight (loading) tiles are left
   * alone — they're cheap to discard on arrival.
   */
  pruneInvisiblePending(visibleTiles: Set<TileKey>): number {
    let removed = 0;
    for (const key of this.pendingTileRequests.keys()) {
      if (!visibleTiles.has(key)) {
        this.pendingTileRequests.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get hasPendingWork(): boolean {
    return this.pendingTileRequests.size > 0;
  }

  getLoadingInfo(key: TileKey): LoadingTileInfo | undefined {
    return this.loadingTiles.get(key);
  }

  selectBatch(maxTilesPerFrame: number): Array<{
    key: TileKey;
    priority: number;
  }> {
    const batch = selectPendingTileBatch(
      this.pendingTileRequests,
      maxTilesPerFrame,
    );

    for (const { key, priority } of batch) {
      this.pendingTileRequests.delete(key);
      if (!this.loadingTiles.has(key)) {
        this.loadingTiles.set(key, { priority });
      }
    }

    return batch;
  }

  markLoaded(key: TileKey): void {
    this.loadingTiles.delete(key);
  }

  markFailed(key: TileKey): void {
    this.loadingTiles.delete(key);
  }

  clear(): void {
    this.loadingTiles.clear();
    this.pendingTileRequests.clear();
  }
}
