import { createManifest } from "@afilmory/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppRuntime } from "~/runtime/app-runtime";

import { createRegularImageCache } from "../image-cache-service";
import { ImageConversionService } from "../image-conversion-service";
import { ImageLoaderManager } from "../image-loader-manager";
import { MediaResourceScope } from "../media-resource";
import { VideoBlobCache } from "../video-blob-cache";
import { VideoLoadService } from "../video-load-service";

const mocks = vi.hoisted(() => ({ convert: vi.fn(), extract: vi.fn() }));
vi.mock("~/i18n", () => ({ getI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../device-viewport", () => ({
  isMobileDevice: true,
  isSafari: false,
}));
vi.mock("../image-convert", () => ({
  ImageConverterManager: class {
    convertImage = mocks.convert;
  },
}));
vi.mock("../motion-photo-extractor", () => ({
  extractMotionPhotoVideo: mocks.extract,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const videoBlob = () => new Blob(["video"], { type: "video/mp4" });
const source = {
  type: "live-photo" as const,
  videoUrl: "https://example.com/live.mov",
};
const respond = () =>
  ({ ok: true, arrayBuffer: async () => new ArrayBuffer(32) }) as Response;
function video() {
  const element = document.createElement("video");
  vi.spyOn(element, "pause").mockImplementation(() => {});
  vi.spyOn(element, "load").mockImplementation(() =>
    element.dispatchEvent(new Event("loadeddata")),
  );
  return element;
}

beforeEach(() => {
  let count = 0;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:media-${++count}`);
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
  mocks.convert.mockReset().mockResolvedValue(null);
  mocks.extract.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("image ownership", () => {
  it("runtime disposal revokes completed image leases and detaches active video", async () => {
    const runtime = createAppRuntime({
      manifest: createManifest({ photos: [] }),
    });
    const blob = new Blob(["photo"]);
    runtime.imageCache.set("cached", {
      blob,
      originalSize: blob.size,
      format: blob.type,
    });
    const imageLoader = runtime.imageLoading.createLoader();
    const lease = await imageLoader.loadImage("cached");
    runtime.imageLoading.cleanupLoader(imageLoader);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    const player = runtime.imageLoading.createLoader();
    const element = video();
    await player.processVideo(
      { type: "live-photo", videoUrl: "https://example.com/a.mp4" },
      element,
    );
    runtime.dispose();
    runtime.dispose();
    lease.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(lease.blobSrc);
    expect(element.getAttribute("src")).toBeNull();
    expect(runtime.imageCache.size()).toBe(0);
    expect(() => runtime.imageLoading.createLoader()).toThrow("disposed");
  });
  it("keeps consumer URLs usable across byte-budget eviction, cache clear and another consumer release", async () => {
    const cache = createRegularImageCache();
    const conversion = new ImageConversionService(cache);
    const resources = new MediaResourceScope();
    const blob = new Blob(["image"], { type: "image/jpeg" });
    Object.defineProperty(blob, "size", { value: 40 * 1024 * 1024 });
    const bytes = await conversion.processImageBlob(
      blob,
      "a",
      {},
      new AbortController().signal,
    );
    const first = resources.acquire(bytes);
    const secondConsumer = resources.acquire(bytes);
    await conversion.processImageBlob(
      blob,
      "b",
      {},
      new AbortController().signal,
    );
    expect(cache.has("a")).toBe(false);
    cache.clear();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    first.release();
    first.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(first.blobSrc);
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(
      secondConsumer.blobSrc,
    );
    resources.dispose();
    secondConsumer.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(() => resources.acquire(blob)).toThrow("disposed");
  });

  it("does not publish a cancelled conversion into cache", async () => {
    const pending = deferred<null>();
    mocks.convert.mockReturnValue(pending.promise);
    const cache = createRegularImageCache();
    const service = new ImageConversionService(cache);
    const controller = new AbortController();
    const result = service.processImageBlob(
      new Blob(["x"]),
      "late",
      {},
      controller.signal,
    );
    const assertion = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    pending.resolve(null);
    await assertion;
    expect(cache.size()).toBe(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("cancels conversion promptly and suppresses late progress callbacks", async () => {
    const pending = deferred<null>();
    const fetchService = {
      fetchBlob: vi.fn().mockResolvedValue(new Blob(["x"])),
      cleanup: vi.fn(),
    };
    const cache = createRegularImageCache();
    mocks.convert.mockReturnValue(pending.promise);
    const manager = new ImageLoaderManager(cache, {
      imageFetchService: fetchService as never,
    });
    const update = vi.fn();
    const result = manager.loadImage("late", { onLoadingStateUpdate: update });
    const assertion = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(mocks.convert).toHaveBeenCalledOnce());
    manager.cleanup();
    await assertion;
    update.mockClear();
    mocks.convert.mock.calls[0][2].onLoadingStateUpdate({ isVisible: true });
    pending.resolve(null);
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
    expect(cache.size()).toBe(0);
  });
});

describe("shared video data", () => {
  it("downloads once but gives concurrent players independent URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond());
    vi.stubGlobal("fetch", fetchMock);
    const cache = new VideoBlobCache();
    const one = new VideoLoadService(1000, cache);
    const two = new VideoLoadService(1000, cache);
    const first = video();
    const second = video();
    await Promise.all([
      one.processVideo(source, first),
      two.processVideo(source, second),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.src).not.toBe(second.src);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    one.cleanup();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(second.src);
    cache.dispose();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(second.src);
    two.cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("one cancelled subscriber does not abort another; last cancellation aborts and permits immediate retry", async () => {
    const request = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal("fetch", fetchMock);
    const cache = new VideoBlobCache();
    const first = new AbortController();
    const second = new AbortController();
    const a = cache.get("shared", first.signal);
    const b = cache.get("shared", second.signal);
    const rejectedA = expect(a).rejects.toMatchObject({ name: "AbortError" });
    const rejectedB = expect(b).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    const sharedSignal = fetchMock.mock.calls[0][1].signal;
    first.abort();
    await rejectedA;
    expect(sharedSignal.aborted).toBe(false);
    second.abort();
    const retry = cache.get("shared", new AbortController().signal);
    await rejectedB;
    expect(sharedSignal.aborted).toBe(true);
    request.resolve(respond());
    await retry;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    cache.dispose();
  });

  it("runtime disposal settles outstanding subscribers even if the transport ignores abort", async () => {
    const request = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(request.promise));
    const cache = new VideoBlobCache();
    const result = cache.get("disposed", new AbortController().signal);
    const assertion = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();
    cache.dispose();
    await assertion;
    request.resolve(respond());
    await expect(
      cache.get("disposed", new AbortController().signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("can retry after a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue(respond()),
    );
    const cache = new VideoBlobCache();
    await expect(
      cache.get("retry", new AbortController().signal),
    ).rejects.toThrow("offline");
    await expect(
      cache.get("retry", new AbortController().signal),
    ).resolves.toBeInstanceOf(Blob);
    cache.dispose();
  });
});

describe("video task cancellation", () => {
  it("cancels a cache hit before it can attach src or emit stale state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond()));
    const cache = new VideoBlobCache();
    await cache.get(source.videoUrl, new AbortController().signal);
    const service = new VideoLoadService(1000, cache);
    const element = video();
    const update = vi.fn();
    const result = service.processVideo(source, element, {
      onLoadingStateUpdate: update,
    });
    const assertion = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    service.cleanup();
    update.mockClear();
    await assertion;
    expect(element.getAttribute("src")).toBeNull();
    expect(element.load).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    cache.dispose();
  });

  it("a stale Motion Photo result cannot overwrite or clear the next video", async () => {
    const extraction = deferred<Blob>();
    mocks.extract.mockReturnValue(extraction.promise);
    const service = new VideoLoadService();
    const element = video();
    const old = service.processVideo(
      { type: "motion-photo", imageUrl: "old", offset: 10 },
      element,
    );
    const cancelled = expect(old).rejects.toMatchObject({ name: "AbortError" });
    await service.processVideo(
      { type: "live-photo", videoUrl: "https://example.com/new.mp4" },
      element,
    );
    await cancelled;
    extraction.resolve(videoBlob());
    await Promise.resolve();
    expect(element.src).toBe("https://example.com/new.mp4");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    service.cleanup();
  });

  it("releases an owned URL on media failure", async () => {
    mocks.extract.mockResolvedValue(videoBlob());
    const service = new VideoLoadService();
    const element = video();
    vi.mocked(element.load).mockImplementation(() =>
      element.dispatchEvent(new Event("error")),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      service.processVideo(
        { type: "motion-photo", imageUrl: "bad", offset: 10 },
        element,
      ),
    ).rejects.toThrow("Video failed to load");
    expect(element.getAttribute("src")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    service.cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
