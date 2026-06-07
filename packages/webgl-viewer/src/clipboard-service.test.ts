import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyImageUrlToClipboard } from "./clipboard-service";

class ClipboardItemMock implements ClipboardItem {
  readonly presentationStyle: PresentationStyle = "unspecified";
  readonly types: string[];

  constructor(readonly items: Record<string, Blob>) {
    this.types = Object.keys(items);
  }

  async getType(type: string): Promise<Blob> {
    const item = this.items[type];
    if (!item) {
      throw new TypeError(`Missing clipboard item type: ${type}`);
    }
    return item;
  }
}

function mockFetchBlob(blob: Blob): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(blob, {
        headers: { "Content-Type": blob.type },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function expectClipboardItemMock(item: ClipboardItem): ClipboardItemMock {
  expect(item).toBeInstanceOf(ClipboardItemMock);
  if (!(item instanceof ClipboardItemMock)) {
    throw new TypeError("Expected ClipboardItemMock instance.");
  }
  return item;
}

describe("copyImageUrlToClipboard", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
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
    const items = write.mock.calls[0]?.[0];
    if (!items) {
      throw new Error("Expected clipboard write payload.");
    }
    expect(items).toHaveLength(1);
    const item = items[0];
    if (!item) {
      throw new Error("Expected one clipboard item.");
    }
    expect(expectClipboardItemMock(item).items).toEqual({
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
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw error;
    });
    vi.stubGlobal("fetch", fetchMock);

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
