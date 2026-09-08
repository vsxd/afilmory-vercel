import { createManifest } from "@afilmory/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppRuntime } from "~/runtime/app-runtime";

import { createRegularImageCache } from "../image-cache-service";
import { ImageConversionService } from "../image-conversion-service";
import { ImageConverterManager } from "../image-convert";
import type {
  ConversionResult,
  ImageConverterStrategy,
} from "../image-convert/type";
import { ImageFetchService } from "../image-fetch-service";
import { ImageLoaderManager } from "../image-loader-manager";

vi.mock("../file-type", () => ({
  detectFileTypeFromBlob: async () => ({ mime: "image/x-test", ext: "test" }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const original = () => new Blob(["original"], { type: "image/x-test" });
const converted = (): ConversionResult => ({
  blob: new Blob(["converted"], { type: "image/jpeg" }),
  originalSize: 8,
  convertedSize: 9,
  format: "image/jpeg",
});
const strategy = (
  convert: ImageConverterStrategy["convert"],
): ImageConverterStrategy => ({
  getName: () => "Test",
  getSupportedFormats: () => ["image/x-test"],
  shouldConvert: async () => true,
  convert,
});

describe("composed image task contracts", () => {
  it("does not cache a failed native fallback; the next request can retry conversion", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn(() => "blob:leased");
        static revokeObjectURL = vi.fn();
      },
    );
    const cache = createRegularImageCache();
    const converter = new ImageConverterManager();
    const cause = new Error("temporary codec failure");
    const result = converted();
    const convert = vi
      .fn()
      .mockRejectedValueOnce(cause)
      .mockResolvedValueOnce(result);
    converter.registerStrategy(strategy(convert));
    const blob = original();
    const loader = new ImageLoaderManager(cache, {
      imageFetchService: { fetchBlob: async () => blob, cleanup: () => {} },
      imageConversionService: new ImageConversionService(cache, converter),
    });
    const onEvent = vi.fn();
    const fallback = await loader.loadImage("retry", { onEvent });
    expect(fallback.blob).toBe(blob);
    expect(cache.has("retry")).toBe(false);
    expect(onEvent).toHaveBeenCalledWith({
      type: "native-fallback",
      error: expect.objectContaining({ code: "conversion-failed", cause }),
    });
    expect(warning).toHaveBeenCalledOnce();
    const retry = await loader.loadImage("retry");
    expect(retry.blob).toBe(result.blob);
    expect(cache.get("retry")?.blob).toBe(result.blob);
    fallback.release();
    retry.release();
    loader.cleanup();
    await converter.dispose();
  });

  it("runtime disposal cancels the real loader/converter chain and awaits active decoder drainage", async () => {
    vi.spyOn(ImageFetchService.prototype, "fetchBlob").mockImplementation(
      async () => original(),
    );
    const runtime = createAppRuntime({
      manifest: createManifest({ photos: [] }),
    });
    const gate = Promise.withResolvers<ConversionResult>();
    const convert = vi.fn().mockReturnValue(gate.promise);
    runtime.imageConverter.registerStrategy(strategy(convert));
    const first = runtime.imageLoading.createLoader().loadImage("active");
    runtime.imageConverter.setMaxConcurrentConversions(1);
    const second = runtime.imageLoading.createLoader().loadImage("queued");
    const assertions = [first, second].map((request) =>
      expect(request).rejects.toMatchObject({ name: "AbortError" }),
    );
    await vi.waitFor(() =>
      expect(runtime.imageConverter.getPipelineStats()).toEqual({
        active: 1,
        pending: 1,
      }),
    );
    let drained = false;
    const disposal = runtime.dispose().then(() => {
      drained = true;
    });
    await Promise.all(assertions);
    expect(drained).toBe(false);
    gate.resolve(converted());
    await disposal;
    expect(convert).toHaveBeenCalledOnce();
    expect(runtime.imageCache.size()).toBe(0);
    await runtime.dispose();
  });
});
