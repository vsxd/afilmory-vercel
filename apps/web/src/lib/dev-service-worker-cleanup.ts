const DEV_SW_RELOAD_FLAG = 'afilmory:dev-service-worker-cleanup-reloaded'

const AFILMORY_CACHE_NAMES = new Set(['google-fonts-cache', 'gstatic-fonts-cache', 'images-cache'])

type CleanupOptions = {
  reload?: () => void
}

export type DevServiceWorkerCleanupResult = {
  cacheNamesDeleted: string[]
  reloadRequested: boolean
  registrationsUnregistered: number
}

export async function cleanupStaleDevServiceWorker(
  options: CleanupOptions = {},
): Promise<DevServiceWorkerCleanupResult> {
  const result: DevServiceWorkerCleanupResult = {
    cacheNamesDeleted: [],
    reloadRequested: false,
    registrationsUnregistered: 0,
  }

  if (!import.meta.env.DEV || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return result
  }

  const { serviceWorker } = navigator
  if (!serviceWorker?.getRegistrations) {
    clearReloadAttempt()
    return result
  }

  try {
    const registrations = await serviceWorker.getRegistrations()
    const hasController = Boolean(serviceWorker.controller)

    if (!hasController && registrations.length === 0) {
      clearReloadAttempt()
      return result
    }

    const unregisterResults = await Promise.all(registrations.map((registration) => registration.unregister()))
    result.registrationsUnregistered = unregisterResults.filter(Boolean).length
    result.cacheNamesDeleted = await deleteAfilmoryRuntimeCaches()

    if (hasController && !hasReloadAttempted()) {
      markReloadAttempted()
      result.reloadRequested = true
      const reload = options.reload ?? (() => window.location.reload())
      reload()
    }
  } catch (error) {
    console.warn('[dev] Failed to clean stale service worker state.', error)
  }

  return result
}

async function deleteAfilmoryRuntimeCaches(): Promise<string[]> {
  if (!('caches' in window)) {
    return []
  }

  const names = await window.caches.keys()
  const namesToDelete = names.filter(isAfilmoryRuntimeCacheName)
  await Promise.all(namesToDelete.map((name) => window.caches.delete(name)))
  return namesToDelete
}

function isAfilmoryRuntimeCacheName(name: string): boolean {
  return AFILMORY_CACHE_NAMES.has(name) || name.startsWith('workbox-') || name.includes('precache')
}

function hasReloadAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(DEV_SW_RELOAD_FLAG) === '1'
  } catch {
    return false
  }
}

function markReloadAttempted(): void {
  try {
    window.sessionStorage.setItem(DEV_SW_RELOAD_FLAG, '1')
  } catch {
    // Ignore restricted storage in private or hardened browser profiles.
  }
}

function clearReloadAttempt(): void {
  try {
    window.sessionStorage.removeItem(DEV_SW_RELOAD_FLAG)
  } catch {
    // Ignore restricted storage in private or hardened browser profiles.
  }
}
