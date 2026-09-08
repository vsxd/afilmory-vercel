// @vitest-environment node
// esbuild 的启动自检（TextEncoder→Uint8Array instanceof）在 jsdom realm 下会
// 误报，所以打包器相关的测试必须跑在 node 环境；执行内联片段时用
// window = globalThis 的最小 shim 模拟经典内联 <script> 的全局作用域。
import type { PhotoManifestItem as PhotoManifest } from "@afilmory/schema";
import { createManifest } from "@afilmory/schema";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AfilmoryBrowserRuntime } from "~/runtime/browser-runtime";

import { buildExternalManifestScriptContent } from "../../../plugins/vite/__internal__/manifest-inline-snippet";
import {
  buildManifestRequestInit,
  MANIFEST_REQUEST_TIMEOUT_MS,
} from "../manifest-fetch-options";
import { loadManifestRuntime } from "../manifest-runtime";

const originalFetch = globalThis.fetch;

type GlobalWithRuntime = typeof globalThis & {
  __AFILMORY__?: AfilmoryBrowserRuntime;
};

const MANIFEST_URL = "/assets/photos-manifest.deadbeef42.json";

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

beforeAll(() => {
  vi.stubGlobal("window", globalThis);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as GlobalWithRuntime).__AFILMORY__;
  globalThis.fetch = originalFetch;
});

describe("buildExternalManifestScriptContent (bundled inline snippet)", () => {
  it("emits a classic script: no import statements, no HTML-breaking sequences", () => {
    const snippet = buildExternalManifestScriptContent(MANIFEST_URL);
    expect(snippet).not.toMatch(/^\s*import[\s("']/m);
    expect(snippet).not.toContain("</script");
    expect(snippet).not.toContain("<!--");
  });

  it("contains the injected manifest URL and the shared timeout constant value", () => {
    const snippet = buildExternalManifestScriptContent(MANIFEST_URL);
    expect(snippet).toContain(JSON.stringify(MANIFEST_URL));
    // esbuild 会改写数字字面量（15_000 → 15e3），按数值而非文本比对。
    const match = snippet.match(/MANIFEST_REQUEST_TIMEOUT_MS\s*=\s*([\d._e]+)/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1]?.replaceAll("_", ""))).toBe(
      MANIFEST_REQUEST_TIMEOUT_MS,
    );
  });

  it("executed snippet aborts after exactly MANIFEST_REQUEST_TIMEOUT_MS", () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      globalThis.fetch = vi.fn((_url, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        return new Promise(() => {});
      }) as typeof globalThis.fetch;

      new Function(buildExternalManifestScriptContent(MANIFEST_URL))();

      expect(capturedSignal?.aborted).toBe(false);
      vi.advanceTimersByTime(MANIFEST_REQUEST_TIMEOUT_MS - 1);
      expect(capturedSignal?.aborted).toBe(false);
      vi.advanceTimersByTime(1);
      expect(capturedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("injects each URL independently (template is cached, substitution is per call)", () => {
    const first = buildExternalManifestScriptContent("/assets/a.json");
    const second = buildExternalManifestScriptContent("/assets/b.json");
    expect(first).toContain('"/assets/a.json"');
    expect(first).not.toContain('"/assets/b.json"');
    expect(second).toContain('"/assets/b.json"');
    expect(second).not.toContain('"/assets/a.json"');
  });

  it("executes like the handwritten script: stashes { mode: 'external', url, promise } under window.__AFILMORY__.manifest", async () => {
    const payload = { photos: [] };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    const snippet = buildExternalManifestScriptContent(MANIFEST_URL);
    // 在全局作用域执行，模拟经典内联 <script>。
    new Function(snippet)();

    const runtime = (globalThis as GlobalWithRuntime).__AFILMORY__;
    expect(runtime?.version).toBe(1);
    expect(runtime?.manifest).toMatchObject({
      mode: "external",
      url: MANIFEST_URL,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(MANIFEST_URL);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(stripSignal(init)).toEqual(stripSignal(buildManifestRequestInit()));
    await expect(runtime?.manifest?.promise).resolves.toBe(payload);
  });

  it("executed snippet rejects with the data-inject error message on a non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Unavailable",
    }) as typeof globalThis.fetch;

    new Function(buildExternalManifestScriptContent(MANIFEST_URL))();

    await expect(
      (globalThis as GlobalWithRuntime).__AFILMORY__?.manifest?.promise,
    ).rejects.toThrow(
      "[data-inject] Failed to fetch manifest: 503 Unavailable",
    );
  });

  it("executed snippet feeds loadManifestRuntime without refetching", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => createManifest({ photos: [createPhoto("snippet-1")] }),
    });
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    new Function(buildExternalManifestScriptContent(MANIFEST_URL))();
    const manifest = await loadManifestRuntime();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(manifest.photos[0]?.id).toBe("snippet-1");
  });
});
