// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/i18n", () => ({
  getI18n: () => ({
    t: (key: string) => key,
  }),
  i18nAtom: Symbol("i18nAtom"),
}));

vi.mock("~/lib/jotai", () => ({
  jotaiStore: {
    get: () => ({
      t: (key: string) => key,
    }),
  },
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

  it("does not crash MOV support detection without document", async () => {
    removeGlobal("document");

    const { needsVideoConversion } = await import("../lib/video-converter");

    expect(needsVideoConversion("clip.mov")).toBe(false);
  });

  it("reports HEIC support as unavailable without navigator", async () => {
    removeGlobal("navigator");

    const { isBrowserSupportHeic } = await import(
      "../lib/image-convert/strategies/heic"
    );

    expect(isBrowserSupportHeic()).toBe(false);
  });
});
