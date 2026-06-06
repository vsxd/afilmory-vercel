import { isAfilmoryRuntimeCacheName } from "~/runtime/cache-names";
import {
  AFILMORY_REFRESH_SEARCH_PARAM,
  AFILMORY_STORAGE_KEYS,
} from "~/runtime/storage-keys";

const STALE_RUNTIME_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
  "Unable to preload CSS",
  "Unable to preload module",
  "vite:preloadError",
] as const;

type ReloadRequest = (url: string) => void;

export type StaleRuntimeRecoveryOptions = {
  force?: boolean;
  now?: () => number;
  reload?: ReloadRequest;
};

export type StaleRuntimeRecoveryResult = {
  attempted: boolean;
  cacheNamesDeleted: string[];
  reason: "already-attempted" | "not-stale-runtime-error" | "reload-requested";
  registrationsUnregistered: number;
  reloadRequested: boolean;
};

type CleanupResult = {
  cacheNamesDeleted: string[];
  registrationsUnregistered: number;
};

export function isStaleRuntimeError(error: unknown): boolean {
  const message = getErrorMessage(error);
  if (!message) return false;

  return STALE_RUNTIME_ERROR_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}

export async function recoverFromStaleRuntimeError(
  error: unknown,
  options: StaleRuntimeRecoveryOptions = {},
): Promise<StaleRuntimeRecoveryResult> {
  if (!isStaleRuntimeError(error) && !options.force) {
    clearStaleRuntimeReloadAttempt();
    return createSkippedResult("not-stale-runtime-error");
  }

  return recoverStaleRuntime(options);
}

export async function recoverStaleRuntime(
  options: StaleRuntimeRecoveryOptions = {},
): Promise<StaleRuntimeRecoveryResult> {
  if (!options.force && hasReloadAttempted()) {
    return createSkippedResult("already-attempted");
  }

  if (!options.force) {
    markReloadAttempted();
  }

  const cleanup = await cleanupStaleRuntimeState();
  requestCacheBustReload(options);

  return {
    attempted: true,
    cacheNamesDeleted: cleanup.cacheNamesDeleted,
    reason: "reload-requested",
    registrationsUnregistered: cleanup.registrationsUnregistered,
    reloadRequested: true,
  };
}

export function clearStaleRuntimeReloadAttempt(): void {
  try {
    window.sessionStorage.removeItem(
      AFILMORY_STORAGE_KEYS.staleRuntimeRecoveryReloaded,
    );
  } catch {
    // Ignore restricted storage in SSR, private, or hardened browser profiles.
  }
}

async function cleanupStaleRuntimeState(): Promise<CleanupResult> {
  const [registrationsUnregistered, cacheNamesDeleted] = await Promise.all([
    unregisterServiceWorkers(),
    deleteRuntimeCaches(),
  ]);

  return {
    cacheNamesDeleted,
    registrationsUnregistered,
  };
}

async function unregisterServiceWorkers(): Promise<number> {
  if (typeof navigator === "undefined") return 0;

  const { serviceWorker } = navigator;
  if (!serviceWorker?.getRegistrations) return 0;

  try {
    const registrations = await serviceWorker.getRegistrations();
    const unregisterResults = await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
    return unregisterResults.filter(Boolean).length;
  } catch (error) {
    console.warn("[recovery] Failed to unregister service workers.", error);
    return 0;
  }
}

async function deleteRuntimeCaches(): Promise<string[]> {
  if (typeof window === "undefined" || !("caches" in window)) return [];

  try {
    const names = await window.caches.keys();
    const namesToDelete = names.filter(isAfilmoryRuntimeCacheName);
    await Promise.all(namesToDelete.map((name) => window.caches.delete(name)));
    return namesToDelete;
  } catch (error) {
    console.warn("[recovery] Failed to delete runtime caches.", error);
    return [];
  }
}

function requestCacheBustReload(options: StaleRuntimeRecoveryOptions): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.set(
    AFILMORY_REFRESH_SEARCH_PARAM,
    (options.now?.() ?? Date.now()).toString(),
  );

  if (options.reload) {
    options.reload(url.toString());
    return;
  }

  window.location.replace(url);
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

function hasReloadAttempted(): boolean {
  try {
    return (
      window.sessionStorage.getItem(
        AFILMORY_STORAGE_KEYS.staleRuntimeRecoveryReloaded,
      ) === "1"
    );
  } catch {
    return false;
  }
}

function markReloadAttempted(): void {
  try {
    window.sessionStorage.setItem(
      AFILMORY_STORAGE_KEYS.staleRuntimeRecoveryReloaded,
      "1",
    );
  } catch {
    // Ignore restricted storage in private or hardened browser profiles.
  }
}

function createSkippedResult(
  reason: "already-attempted" | "not-stale-runtime-error",
): StaleRuntimeRecoveryResult {
  return {
    attempted: false,
    cacheNamesDeleted: [],
    reason,
    registrationsUnregistered: 0,
    reloadRequested: false,
  };
}
