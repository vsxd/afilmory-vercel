import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyImageUrlToClipboard } from "./clipboard-service";

class ClipboardItemMock {
  constructor(readonly items: Record<string, Blob>) {}
}

function mockFetchBlob(blob: Blob): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    blob: async () => blob,
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("copyImageUrlToClipboard", () => {
  const originalClipboard = navigator.clipboard;
  const originalClipboardItem = globalThis.ClipboardItem;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    globalThis.ClipboardItem = originalClipboardItem;
    globalThis.fetch = originalFetch;
  });

  it("fetches the image and writes a ClipboardItem", async () => {
    const blob = new Blob(["photo"], { type: "image/png" });
    const fetchMock = mockFetchBlob(blob);
    const write = vi.fn(async (_items: ClipboardItem[]) => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });

    await expect(
      copyImageUrlToClipboard("https://example.com/photo.png"),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/photo.png");
    expect(write).toHaveBeenCalledTimes(1);
    const items = write.mock.calls[0]?.[0] as unknown as ClipboardItemMock[];
    expect(items).toHaveLength(1);
    expect(items[0]).toBeInstanceOf(ClipboardItemMock);
    expect((items[0] as ClipboardItemMock).items).toEqual({
      "image/png": blob,
    });
  });

  it("returns false when Clipboard write is unavailable", async () => {
    const blob = new Blob(["photo"], { type: "image/png" });
    mockFetchBlob(blob);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    await expect(copyImageUrlToClipboard("photo.png")).resolves.toBe(false);
  });

  it("propagates fetch failures", async () => {
    const error = new Error("network unavailable");
    globalThis.fetch = vi.fn(async () => {
      throw error;
    }) as unknown as typeof fetch;

    await expect(copyImageUrlToClipboard("photo.png")).rejects.toThrow(error);
  });

  it("propagates clipboard write failures", async () => {
    const error = new Error("clipboard denied");
    const blob = new Blob(["photo"], { type: "image/png" });
    mockFetchBlob(blob);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: vi.fn(async () => {
          throw error;
        }),
      },
    });

    await expect(copyImageUrlToClipboard("photo.png")).rejects.toThrow(error);
  });
});
