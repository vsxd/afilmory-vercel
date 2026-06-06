import { afterEach, describe, expect, it, vi } from "vitest";

import { registerProductionServiceWorker } from "../register-service-worker";

describe("registerProductionServiceWorker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("skips service worker registration outside production", async () => {
    await expect(
      registerProductionServiceWorker({ isProduction: false }),
    ).resolves.toEqual({
      reason: "not-production",
      registered: false,
    });
  });

  it("skips service worker registration when the browser does not support it", async () => {
    vi.stubGlobal("navigator", {});

    await expect(
      registerProductionServiceWorker({ isProduction: true }),
    ).resolves.toEqual({
      reason: "unsupported",
      registered: false,
    });
  });

  it("registers the production service worker explicitly", async () => {
    const updateServiceWorker = vi.fn(async () => {});
    const registerSW = vi.fn(() => updateServiceWorker);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal("navigator", { serviceWorker: {} });

    const result = await registerProductionServiceWorker({
      isProduction: true,
      loadRegisterSW: async () => ({ registerSW }),
    });

    expect(result).toEqual({
      reason: "registered",
      registered: true,
      updateServiceWorker,
    });
    expect(registerSW).toHaveBeenCalledTimes(1);
    expect(registerSW).toHaveBeenCalledWith({
      immediate: true,
      onRegisterError: expect.any(Function),
    });

    registerSW.mock.calls[0]?.[0]?.onRegisterError?.(
      new Error("registration failed"),
    );
    expect(warn).toHaveBeenCalledWith(
      "[pwa] Failed to register service worker.",
      expect.any(Error),
    );
  });

  it("warns without throwing when the registration module cannot be loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal("navigator", { serviceWorker: {} });

    await expect(
      registerProductionServiceWorker({
        isProduction: true,
        loadRegisterSW: async () => {
          throw new Error("missing virtual module");
        },
      }),
    ).resolves.toEqual({
      reason: "register-error",
      registered: false,
    });
    expect(warn).toHaveBeenCalledWith(
      "[pwa] Failed to load service worker registration.",
      expect.any(Error),
    );
  });
});
