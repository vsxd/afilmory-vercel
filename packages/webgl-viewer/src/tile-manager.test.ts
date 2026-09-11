import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_TILES_PER_FRAME } from "./tile-cache";
import type { TileManagerHost, TileWorkerRequest } from "./tile-manager";
import { createTileMatrix, TileManager } from "./tile-manager";

interface HostState {
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  imageLoaded: boolean;
  scale: number;
  translateX: number;
  translateY: number;
  lodLevel: number;
  canDispatch: boolean;
  lodCoveredByBase: boolean;
}

function createHost(overrides: Partial<HostState> = {}) {
  const state: HostState = {
    canvasWidth: 100,
    canvasHeight: 100,
    imageWidth: 1024,
    imageHeight: 1024,
    imageLoaded: true,
    scale: 1,
    translateX: 0,
    translateY: 0,
    lodLevel: 2,
    canDispatch: true,
    lodCoveredByBase: false,
    ...overrides,
  };

  const createTexture = vi.fn(() => ({}) as WebGLTexture);
  const deleteTexture = vi.fn();
  const requestRender = vi.fn();
  const requestTileFromWorker = vi.fn();
  const onVisibleLodReady = vi.fn();
  const onCoveredByBase = vi.fn();

  const host: TileManagerHost = {
    getViewport: () => ({
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      imageWidth: state.imageWidth,
      imageHeight: state.imageHeight,
      imageLoaded: state.imageLoaded,
      scale: state.scale,
      translateX: state.translateX,
      translateY: state.translateY,
    }),
    getSelectedLodLevel: () => state.lodLevel,
    isLodCoveredByBase: () => state.lodCoveredByBase,
    createTexture,
    deleteTexture,
    requestRender,
    canDispatchTiles: () => state.canDispatch,
    requestTileFromWorker,
    onVisibleLodReady,
    onCoveredByBase,
  };

  return {
    host,
    state,
    createTexture,
    deleteTexture,
    requestRender,
    requestTileFromWorker,
    onVisibleLodReady,
    onCoveredByBase,
  };
}

// ImageBitmap 结构上只有 width/height/close，直接用带 spy 的结构化夹具即可
function makeBitmap(): ImageBitmap & { close: Mock<() => void> } {
  return { width: 512, height: 512, close: vi.fn<() => void>() };
}

function requestedKeys(
  requestTileFromWorker: ReturnType<typeof vi.fn>,
): string[] {
  return requestTileFromWorker.mock.calls.map(
    (call) => (call[0] as TileWorkerRequest).key,
  );
}

describe("TileManager", () => {
  let pendingFrames: FrameRequestCallback[];
  let cancelledFrames: number[];

  beforeEach(() => {
    pendingFrames = [];
    cancelledFrames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pendingFrames.push(callback);
      return pendingFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      cancelledFrames.push(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const runNextFrame = () => {
    const frame = pendingFrames.shift();
    expect(frame).toBeDefined();
    frame!(performance.now());
  };

  describe("dispatch scheduling", () => {
    it("dispatches at most MAX_TILES_PER_FRAME requests per frame and continues on the next frame", () => {
      // 2048×2048 at LOD 2 → 4×4 grid, all 16 tiles visible
      const { host, requestTileFromWorker } = createHost({
        imageWidth: 2048,
        imageHeight: 2048,
      });
      const manager = new TileManager(host);

      manager.updateTileCache();

      expect(requestTileFromWorker).toHaveBeenCalledTimes(MAX_TILES_PER_FRAME);
      expect(pendingFrames).toHaveLength(1);

      runNextFrame();
      expect(requestTileFromWorker).toHaveBeenCalledTimes(
        MAX_TILES_PER_FRAME * 2,
      );
    });

    it("does not dispatch while the host cannot accept work (worker not ready / context lost)", () => {
      const { host, state, requestTileFromWorker } = createHost({
        canDispatch: false,
      });
      const manager = new TileManager(host);

      manager.updateTileCache();
      expect(requestTileFromWorker).not.toHaveBeenCalled();

      // 之后 worker 就绪，再次更新即恢复派发
      state.canDispatch = true;
      manager.updateTileCache();
      expect(requestTileFromWorker).toHaveBeenCalled();
    });

    it("releases a loading slot when posting a tile request throws", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { host, requestTileFromWorker } = createHost();
      requestTileFromWorker.mockImplementationOnce(() => {
        throw new Error("worker terminated");
      });
      const manager = new TileManager(host);

      manager.updateTileCache();

      const failedKey = requestedKeys(requestTileFromWorker)[0];
      expect(manager.loadingTiles.has(failedKey)).toBe(false);
    });
  });

  describe("base-coverage gate", () => {
    it("queues nothing while the base texture already covers the selected LOD, and engages once past it", () => {
      const { host, state, requestTileFromWorker } = createHost({
        lodCoveredByBase: true,
      });
      const manager = new TileManager(host);

      // fit 视图：底图分辨率 ≥ 该 LOD → 不排队、不派发、无可见集
      manager.updateTileCache();
      expect(requestTileFromWorker).not.toHaveBeenCalled();
      expect(manager.currentVisibleTiles.size).toBe(0);
      expect(manager.pendingTileRequests.size).toBe(0);

      // 缩放越过底图分辨率 → 瓦片系统照常介入
      state.lodCoveredByBase = false;
      manager.updateTileCache();
      expect(requestTileFromWorker).toHaveBeenCalled();
      expect(manager.currentVisibleTiles.size).toBeGreaterThan(0);
    });

    it("drops the visible set and pending requests when zooming back into base coverage, keeping cached textures", () => {
      const { host, state, deleteTexture, requestTileFromWorker } =
        createHost();
      const manager = new TileManager(host);
      manager.updateTileCache();

      const key = requestedKeys(requestTileFromWorker)[0];
      manager.handleWorkerMessage({
        type: "tile-created",
        payload: { key, imageBitmap: makeBitmap(), lodLevel: 2 },
      });
      expect(manager.tileCache.size).toBe(1);
      expect(manager.pendingTileRequests.size).toBeGreaterThan(0);

      // 回到底图覆盖区间：可见集与未派发请求全部丢弃，糊瓦片不再可绘
      state.lodCoveredByBase = true;
      manager.updateTileCache();

      expect(manager.currentVisibleTiles.size).toBe(0);
      expect(manager.pendingTileRequests.size).toBe(0);
      expect(manager.collectVisibleRenderTiles(2)).toHaveLength(0);
      // 已缓存纹理留给容量/年龄回收（再放大时直接复用），此处不删
      expect(deleteTexture).not.toHaveBeenCalled();
      expect(manager.tileCache.size).toBe(1);
    });

    it("reports coverage via onCoveredByBase (not onVisibleLodReady) on the skip path so the engine can refresh quality", () => {
      const { host, state, onCoveredByBase, onVisibleLodReady } = createHost({
        lodCoveredByBase: true,
      });
      const manager = new TileManager(host);

      // 底图覆盖跳过路径：清空可见集，同时通知引擎“现在只画底图”——onVisibleLodReady
      // 在此永不触发，缺了 onCoveredByBase 引擎的质量信号就会滞留在瓦片态偏高值。
      manager.updateTileCache();
      expect(onCoveredByBase).toHaveBeenCalledTimes(1);
      expect(onVisibleLodReady).not.toHaveBeenCalled();

      // 缩放越过底图分辨率：走正常路径，改由 onVisibleLodReady 上报，不再触发 onCoveredByBase
      state.lodCoveredByBase = false;
      onCoveredByBase.mockClear();
      manager.updateTileCache();
      expect(onCoveredByBase).not.toHaveBeenCalled();
    });
  });

  describe("worker message handling", () => {
    it("caches created tiles as textures, marks them loaded, and requests a render", () => {
      const { host, createTexture, requestRender, requestTileFromWorker } =
        createHost();
      const manager = new TileManager(host);
      manager.updateTileCache();

      const key = requestedKeys(requestTileFromWorker)[0];
      const bitmap = makeBitmap();

      const handled = manager.handleWorkerMessage({
        type: "tile-created",
        payload: { key, imageBitmap: bitmap, lodLevel: 2 },
      });

      expect(handled).toBe(true);
      expect(createTexture).toHaveBeenCalledWith(bitmap);
      expect(bitmap.close).toHaveBeenCalledTimes(1);
      expect(manager.tileCache.has(key)).toBe(true);
      expect(manager.loadingTiles.has(key)).toBe(false);
      expect(requestRender).toHaveBeenCalledTimes(1);
    });

    it("closes and discards bitmaps for tiles that are no longer visible", () => {
      const { host, createTexture, requestRender } = createHost();
      const manager = new TileManager(host);
      manager.updateTileCache();

      const bitmap = makeBitmap();
      manager.handleWorkerMessage({
        type: "tile-created",
        payload: { key: "9-9-2", imageBitmap: bitmap, lodLevel: 2 },
      });

      expect(bitmap.close).toHaveBeenCalledTimes(1);
      expect(createTexture).not.toHaveBeenCalled();
      expect(manager.tileCache.has("9-9-2")).toBe(false);
      expect(requestRender).not.toHaveBeenCalled();
    });

    it("closes the bitmap and releases the loading slot when texture upload throws", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { host, createTexture, requestRender, requestTileFromWorker } =
        createHost();
      const manager = new TileManager(host);
      manager.updateTileCache();
      const key = requestedKeys(requestTileFromWorker)[0];
      const bitmap = makeBitmap();
      createTexture.mockImplementationOnce(() => {
        throw new Error("GPU allocation failed");
      });

      manager.handleWorkerMessage({
        type: "tile-created",
        payload: { key, imageBitmap: bitmap, lodLevel: 2 },
      });

      expect(bitmap.close).toHaveBeenCalledTimes(1);
      expect(manager.loadingTiles.has(key)).toBe(false);
      expect(requestRender).not.toHaveBeenCalled();
    });

    it("clears the loading slot when the worker reports a tile error", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { host, requestTileFromWorker } = createHost();
      const manager = new TileManager(host);
      manager.updateTileCache();

      const key = requestedKeys(requestTileFromWorker)[0];
      expect(manager.loadingTiles.has(key)).toBe(true);

      const handled = manager.handleWorkerMessage({
        type: "tile-error",
        payload: { key, error: "boom" },
      });

      expect(handled).toBe(true);
      expect(manager.loadingTiles.has(key)).toBe(false);
    });

    it("leaves non-tile messages to the engine", () => {
      const { host } = createHost();
      const manager = new TileManager(host);

      expect(manager.handleWorkerMessage({ type: "init-done" })).toBe(false);
      expect(
        manager.handleWorkerMessage({
          type: "load-error",
          payload: { error: "x" },
        }),
      ).toBe(false);
    });
  });

  describe("honest quality signal", () => {
    it("fires onVisibleLodReady only when every visible tile of the LOD is cached", () => {
      const { host, requestTileFromWorker, onVisibleLodReady } = createHost();
      const manager = new TileManager(host);
      manager.updateTileCache();

      // 把 4 片可见瓦片的请求全部派发出来（分帧批量）
      while (pendingFrames.length > 0) {
        runNextFrame();
      }
      const keys = requestedKeys(requestTileFromWorker);
      expect(keys).toHaveLength(4);

      for (const [index, key] of keys.entries()) {
        expect(onVisibleLodReady).not.toHaveBeenCalled();
        manager.handleWorkerMessage({
          type: "tile-created",
          payload: { key, imageBitmap: makeBitmap(), lodLevel: 2 },
        });
        if (index < keys.length - 1) {
          expect(onVisibleLodReady).not.toHaveBeenCalled();
        }
      }

      expect(onVisibleLodReady).toHaveBeenCalledTimes(1);
      expect(onVisibleLodReady).toHaveBeenCalledWith(2);

      // 视口未变、瓦片全在缓存 → 再次更新也上报（去重交给引擎）
      onVisibleLodReady.mockClear();
      manager.updateTileCache();
      expect(onVisibleLodReady).toHaveBeenCalledWith(2);
    });
  });

  describe("render support", () => {
    it("returns textures with matrices only for visible tiles at the requested LOD", () => {
      const { host, requestTileFromWorker } = createHost();
      const manager = new TileManager(host);
      manager.updateTileCache();

      const key = requestedKeys(requestTileFromWorker)[0];
      manager.handleWorkerMessage({
        type: "tile-created",
        payload: { key, imageBitmap: makeBitmap(), lodLevel: 2 },
      });

      const atSelectedLod = manager.collectVisibleRenderTiles(2);
      expect(atSelectedLod).toHaveLength(1);
      expect(atSelectedLod[0].matrix).toBeInstanceOf(Float32Array);

      expect(manager.collectVisibleRenderTiles(3)).toHaveLength(0);
    });

    it("computes the documented tile matrix for a centered image", () => {
      // 1024² 图、100² 画布、scale 1、无平移：瓦片 (0,0) 的推导值
      const matrix = createTileMatrix({
        tileX: 0,
        tileY: 0,
        lodLevel: 2,
        canvasWidth: 100,
        canvasHeight: 100,
        imageWidth: 1024,
        imageHeight: 1024,
        scale: 1,
        translateX: 0,
        translateY: 0,
      });

      expect(matrix[0]).toBeCloseTo(5.12); // scaleX = 512 / 100
      expect(matrix[4]).toBeCloseTo(5.12); // scaleY
      expect(matrix[6]).toBeCloseTo(-5.12); // translateX
      expect(matrix[7]).toBeCloseTo(5.12); // translateY（Y 轴翻转）
    });
  });

  describe("debounced updates from the render loop", () => {
    it("coalesces render-loop calls into at most one update per window and never schedules during animation", () => {
      // 只伪造 setTimeout/clearTimeout，避免碰掉 beforeEach 里的 rAF spy
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      let now = 200;
      vi.spyOn(performance, "now").mockImplementation(() => now);

      const { host } = createHost();
      const manager = new TileManager(host);
      const updateSpy = vi.spyOn(manager, "updateTileCache");

      // 动画中绝不调度
      manager.maybeScheduleUpdate(true);
      expect(vi.getTimerCount()).toBe(0);

      // 距上次更新已超过阈值 → 立即（下一个宏任务）更新
      manager.maybeScheduleUpdate(false);
      expect(vi.getTimerCount()).toBe(1);
      vi.runAllTimers();
      expect(updateSpy).toHaveBeenCalledTimes(1); // lastUpdateTime = 200

      // 窗口内的连续渲染帧只保有一个定时器（合并到同一次尾随更新）
      now = 250;
      manager.maybeScheduleUpdate(false);
      expect(vi.getTimerCount()).toBe(1);
      now = 260;
      manager.maybeScheduleUpdate(false);
      expect(vi.getTimerCount()).toBe(1);

      // 尾随更新在距上次更新满 100ms 时触发，而不是被丢弃
      now = 299;
      vi.advanceTimersByTime(49);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      now = 300;
      vi.advanceTimersByTime(1);
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    it("a render burst ending inside the window still gets its trailing update (fast flick)", () => {
      // 回归：旧实现是前沿节流，窗口内结束的快速滑动会让最后一个视口
      // 永远等不到瓦片更新（可见集停留在滑动前，留下糊带直到下次输入）。
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      let now = 1000;
      vi.spyOn(performance, "now").mockImplementation(() => now);

      const { host } = createHost();
      const manager = new TileManager(host);

      // 滑动途中的一帧：触发一次更新，lastUpdateTime = 1000
      manager.maybeScheduleUpdate(false);
      vi.runAllTimers();
      const updateSpy = vi.spyOn(manager, "updateTileCache");

      // 滑动的最后一帧渲染落在窗口内（+40ms），随后再无任何输入
      now = 1040;
      manager.maybeScheduleUpdate(false);

      now = 1100;
      vi.runAllTimers();
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("lifecycle", () => {
    it("reset() drops bookkeeping and pending work without deleting GPU textures", () => {
      // 只伪造 setTimeout/clearTimeout，避免碰掉 beforeEach 里的 rAF spy
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      let now = 200;
      vi.spyOn(performance, "now").mockImplementation(() => now);

      const { host, deleteTexture, requestTileFromWorker } = createHost({
        imageWidth: 2048,
        imageHeight: 2048,
      });
      const manager = new TileManager(host);
      manager.updateTileCache();

      const key = requestedKeys(requestTileFromWorker)[0];
      manager.handleWorkerMessage({
        type: "tile-created",
        payload: { key, imageBitmap: makeBitmap(), lodLevel: 2 },
      });
      manager.maybeScheduleUpdate(false);

      expect(manager.tileCache.size).toBe(1);
      expect(manager.pendingTileRequests.size).toBeGreaterThan(0);
      expect(pendingFrames).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(1);

      manager.reset();

      // 上下文丢失：GPU 纹理已随上下文失效，不能逐个 deleteTexture
      expect(deleteTexture).not.toHaveBeenCalled();
      expect(manager.tileCache.size).toBe(0);
      expect(manager.currentVisibleTiles.size).toBe(0);
      expect(manager.loadingTiles.size).toBe(0);
      expect(manager.pendingTileRequests.size).toBe(0);
      expect(cancelledFrames).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);

      // reset 后仍可继续工作（restore 场景）
      now = 400;
      requestTileFromWorker.mockClear();
      manager.updateTileCache();
      expect(requestTileFromWorker).toHaveBeenCalled();
    });

    it("dispose() deletes every cached tile texture and blocks further work", () => {
      const { host, createTexture, deleteTexture, requestTileFromWorker } =
        createHost();
      const manager = new TileManager(host);
      manager.updateTileCache();

      const keys = requestedKeys(requestTileFromWorker);
      for (const key of keys) {
        manager.handleWorkerMessage({
          type: "tile-created",
          payload: { key, imageBitmap: makeBitmap(), lodLevel: 2 },
        });
      }
      const cachedCount = manager.tileCache.size;
      expect(cachedCount).toBeGreaterThan(0);

      manager.dispose();

      expect(deleteTexture).toHaveBeenCalledTimes(cachedCount);
      expect(manager.tileCache.size).toBe(0);

      // dispose 之后：更新不派发，迟到的 worker 瓦片只关闭位图
      requestTileFromWorker.mockClear();
      createTexture.mockClear();
      manager.updateTileCache();
      expect(requestTileFromWorker).not.toHaveBeenCalled();

      const lateBitmap = makeBitmap();
      manager.handleWorkerMessage({
        type: "tile-created",
        payload: { key: keys[0], imageBitmap: lateBitmap, lodLevel: 2 },
      });
      expect(lateBitmap.close).toHaveBeenCalledTimes(1);
      expect(createTexture).not.toHaveBeenCalled();
    });
  });
});
