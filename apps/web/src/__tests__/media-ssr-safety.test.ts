// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/i18n", () => ({
  getI18n: () => ({
    t: (key: string) => key,
  }),
  i18nAtom: Symbol("i18nAtom"),
}));

const removeGlobal = (name: "document" | "navigator") => {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: undefined,
    writable: true,
  });
};

describe("apps/web media capability SSR safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("imports device-viewport without navigator", async () => {
    removeGlobal("navigator");

    const module = await import("../lib/device-viewport");

    expect(module.isSafari).toBe(false);
    expect(module.isMobileDevice).toBe(false);
  });

  it("does not classify a touch-capable desktop with a fine pointer as mobile", async () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("navigator", {
      maxTouchPoints: 10,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36",
    });

    const module = await import("../lib/device-viewport");

    expect(module.isMobileDevice).toBe(false);
    expect(module.isSafari).toBe(false);
  });

  it("recognizes iPad desktop mode without treating iOS Chromium as Safari", async () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    vi.stubGlobal("navigator", {
      maxTouchPoints: 5,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) CriOS/126 Safari/604.1",
    });

    const module = await import("../lib/device-viewport");

    expect(module.isMobileDevice).toBe(true);
    expect(module.isSafari).toBe(false);
  });

  it("does not crash MOV support detection without document", async () => {
    removeGlobal("document");

    const { needsVideoConversion } = await import("../lib/video-converter");

    expect(needsVideoConversion("clip.mov")).toBe(false);
  });

  it("reports HEIC support as unavailable without navigator", async () => {
    removeGlobal("navigator");

    const { isBrowserSupportHeic } =
      await import("../lib/image-convert/strategies/heic");

    expect(isBrowserSupportHeic()).toBe(false);
  });
});
