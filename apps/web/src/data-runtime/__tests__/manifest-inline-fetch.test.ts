import type { PhotoManifestItem as PhotoManifest } from "@afilmory/schema";
import { createManifest } from "@afilmory/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AfilmoryBrowserRuntime } from "~/runtime/browser-runtime";

import {
  buildManifestRequestInit,
  MANIFEST_REQUEST_TIMEOUT_MS,
} from "../manifest-fetch-options";
import { startManifestInlineFetch } from "../manifest-inline-fetch";
import { loadManifestRuntime } from "../manifest-runtime";

const originalFetch = globalThis.fetch;

type GlobalWithRuntime = typeof globalThis & {
  __AFILMORY__?: AfilmoryBrowserRuntime;
};

function createPhoto(id: string): PhotoManifest {
  return {
    id,
    title: id,
    description: "",
    dateTaken: "2024-01-01T00:00:00.000Z",
    tags: [],
    originalUrl: `https://example.com/${id}.jpg`,
    thumbnailUrl: `https://example.com/${id}-thumb.jpg`,
    thumbHash: null,
    width: 100,
    height: 100,
    aspectRatio: 1,
    s3Key: `${id}.jpg`,
    lastModified: "2024-01-01T00:00:00.000Z",
    size: 1,
    exif: null,
    toneAnalysis: null,
    location: null,
  };
}

function stripSignal(init: RequestInit | undefined): Record<string, unknown> {
  return { ...init, signal: undefined };
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as GlobalWithRuntime).__AFILMORY__;
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("manifest fetch options (shared contract)", () => {
  it("exposes the 15s timeout constant", () => {
    expect(MANIFEST_REQUEST_TIMEOUT_MS).toBe(15_000);
  });

  it("builds the exact request init used by both fetch paths", () => {
    expect(buildManifestRequestInit()).toEqual({
      credentials: "same-origin",
      cache: "force-cache",
      signal: undefined,
      headers: { accept: "application/json" },
    });
  });

  it("fetchManifest and the inline module pass structurally identical options to fetch", async () => {
    // 1) 运行时路径：loadManifestRuntime 内部的 fetchManifest。
    (globalThis as GlobalWithRuntime).__AFILMORY__ = {
      version: 1,
      manifest: { mode: "external", url: "/runtime-path.json" },
    };
    const runtimeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => createManifest({ photos: [createPhoto("a")] }),
    });
    globalThis.fetch = runtimeFetch as typeof globalThis.fetch;
    await loadManifestRuntime();
    const runtimeInit = runtimeFetch.mock.calls[0]?.[1] as RequestInit;

    // 2) 内联模块路径：startManifestInlineFetch。
    delete (globalThis as GlobalWithRuntime).__AFILMORY__;
    const inlineFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    globalThis.fetch = inlineFetch as typeof globalThis.fetch;
    startManifestInlineFetch("/inline-path.json");
    const inlineInit = inlineFetch.mock.calls[0]?.[1] as RequestInit;

    expect(stripSignal(runtimeInit)).toEqual(
      stripSignal(buildManifestRequestInit()),
    );
    expect(stripSignal(inlineInit)).toEqual(stripSignal(runtimeInit));
  });
});

describe("startManifestInlineFetch", () => {
  it("stashes { mode: 'external', url, promise } on window.__AFILMORY__.manifest and starts the fetch", async () => {
    const payload = { photos: [] };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    startManifestInlineFetch("/assets/photos-manifest.abc.json");

    const runtime = (globalThis as GlobalWithRuntime).__AFILMORY__;
    expect(runtime?.version).toBe(1);
    expect(runtime?.manifest).toMatchObject({
      mode: "external",
      url: "/assets/photos-manifest.abc.json",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/assets/photos-manifest.abc.json",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "force-cache",
        headers: { accept: "application/json" },
      }),
    );
    await expect(runtime?.manifest?.promise).resolves.toBe(payload);
  });

  it("does not restart the fetch when a promise is already stashed", () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    startManifestInlineFetch("/a.json");
    startManifestInlineFetch("/b.json");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // URL 仍会被最新调用覆盖（与旧内联脚本行为一致）。
    const runtime = (globalThis as GlobalWithRuntime).__AFILMORY__;
    expect(runtime?.manifest).toMatchObject({
      mode: "external",
      url: "/b.json",
    });
  });

  it("rejects with the data-inject error message on a non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Unavailable",
    }) as typeof globalThis.fetch;

    startManifestInlineFetch("/x.json");

    await expect(
      (globalThis as GlobalWithRuntime).__AFILMORY__?.manifest?.promise,
    ).rejects.toThrow(
      "[data-inject] Failed to fetch manifest: 503 Unavailable",
    );
  });

  it("does not surface a failed fetch as an unhandled rejection before a consumer awaits", async () => {
    const unhandled: unknown[] = [];
    const trap = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", trap);
    try {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(
          new Error("network down"),
        ) as typeof globalThis.fetch;

      startManifestInlineFetch("/x.json");

      // 故意几个宏任务不 await —— 模拟 main.tsx bootstrap 尚未挂处理器的窗口。
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);

      // 迟到的消费方仍能观察到 rejection。
      await expect(
        (globalThis as GlobalWithRuntime).__AFILMORY__?.manifest?.promise,
      ).rejects.toThrow("network down");
    } finally {
      process.off("unhandledRejection", trap);
    }
  });

  it("aborts the request after exactly MANIFEST_REQUEST_TIMEOUT_MS", () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_url, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise(() => {});
    }) as typeof globalThis.fetch;

    startManifestInlineFetch("/slow.json");

    expect(capturedSignal?.aborted).toBe(false);
    vi.advanceTimersByTime(MANIFEST_REQUEST_TIMEOUT_MS - 1);
    expect(capturedSignal?.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("hands the stashed promise to loadManifestRuntime without a second fetch", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => createManifest({ photos: [createPhoto("inline-1")] }),
    });
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    startManifestInlineFetch("/assets/photos-manifest.json");
    const manifest = await loadManifestRuntime();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(manifest.photos[0]?.id).toBe("inline-1");
  });
});
