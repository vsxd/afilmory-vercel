import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isStaleRuntimeError,
  recoverFromStaleRuntimeError,
  recoverStaleRuntime,
} from "../stale-runtime-recovery";

type ServiceWorkerRegistrationMock = {
  unregister: ReturnType<typeof vi.fn>;
};

describe("stale-runtime-recovery", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/photos/A7C03142?mode=photos");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("recognizes stale runtime module loading failures", () => {
    expect(
      isStaleRuntimeError(
        new Error(
          "Failed to fetch dynamically imported module: /assets/MiniMap.js",
        ),
      ),
    ).toBe(true);
    expect(
      isStaleRuntimeError("Unable to preload CSS for /assets/index.css"),
    ).toBe(true);
    expect(isStaleRuntimeError(new Error("Manifest Load Failed"))).toBe(false);
  });

  it("unregisters service workers, deletes runtime caches, and reloads with a cache bust", async () => {
    const registrationA = createRegistration(true);
    const registrationB = createRegistration(false);
    const reload = vi.fn();
    const cacheDelete = vi.fn(async () => true);

    stubServiceWorkerState([registrationA, registrationB]);
    stubCaches({
      delete: cacheDelete,
      keys: vi.fn(async () => [
        "workbox-precache-v2-https://lens.misfork.com/",
        "google-fonts-cache",
        "gstatic-fonts-cache",
        "images-cache",
        "s3-images-cache",
        "unrelated-cache",
      ]),
    });

    await expect(
      recoverFromStaleRuntimeError(
        "Failed to fetch dynamically imported module: /assets/MiniMap.js",
        {
          now: () => 1234,
          reload,
        },
      ),
    ).resolves.toEqual({
      attempted: true,
      cacheNamesDeleted: [
        "workbox-precache-v2-https://lens.misfork.com/",
        "google-fonts-cache",
        "gstatic-fonts-cache",
        "images-cache",
        "s3-images-cache",
      ],
      reason: "reload-requested",
      registrationsUnregistered: 1,
      reloadRequested: true,
    });

    expect(registrationA.unregister).toHaveBeenCalledTimes(1);
    expect(registrationB.unregister).toHaveBeenCalledTimes(1);
    expect(cacheDelete).not.toHaveBeenCalledWith("unrelated-cache");
    expect(reload).toHaveBeenCalledWith(
      "http://localhost:3000/photos/A7C03142?mode=photos&__afilmory_refresh=1234",
    );
  });

  it("avoids an automatic reload loop after the first stale runtime recovery attempt", async () => {
    const registration = createRegistration(true);
    const reload = vi.fn();

    stubServiceWorkerState([registration]);
    stubCaches({
      delete: vi.fn(async () => true),
      keys: vi.fn(async () => []),
    });

    await recoverFromStaleRuntimeError(
      "Failed to fetch dynamically imported module: /assets/MiniMap.js",
      { reload },
    );
    await expect(
      recoverFromStaleRuntimeError(
        "Failed to fetch dynamically imported module: /assets/MiniMap.js",
        { reload },
      ),
    ).resolves.toMatchObject({
      attempted: false,
      reason: "already-attempted",
      reloadRequested: false,
    });
    expect(registration.unregister).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows manual recovery to force cleanup and reload", async () => {
    const reload = vi.fn();

    stubServiceWorkerState([]);
    stubCaches({
      delete: vi.fn(async () => true),
      keys: vi.fn(async () => []),
    });

    await recoverStaleRuntime({ reload });
    await recoverStaleRuntime({ force: true, reload });

    expect(reload).toHaveBeenCalledTimes(2);
  });
});

function createRegistration(
  unregisterResult: boolean,
): ServiceWorkerRegistrationMock {
  return {
    unregister: vi.fn(async () => unregisterResult),
  };
}

function stubServiceWorkerState(
  registrations: ServiceWorkerRegistrationMock[],
): void {
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistrations: vi.fn(async () => registrations),
    },
  });
}

function stubCaches(caches: {
  delete: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
}): void {
  vi.stubGlobal("caches", caches);
}
