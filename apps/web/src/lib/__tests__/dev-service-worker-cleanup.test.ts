import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cleanupStaleDevServiceWorker } from '../dev-service-worker-cleanup'

type ServiceWorkerRegistrationMock = {
  unregister: ReturnType<typeof vi.fn>
}

describe('cleanupStaleDevServiceWorker', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  it('does nothing when no development service worker state exists', async () => {
    vi.stubGlobal('navigator', {})

    await expect(cleanupStaleDevServiceWorker()).resolves.toEqual({
      cacheNamesDeleted: [],
      reloadRequested: false,
      registrationsUnregistered: 0,
    })
  })

  it('unregisters stale service workers, clears known runtime caches, and reloads once when controlled', async () => {
    const registration = createRegistration()
    const reload = vi.fn()
    const cacheDelete = vi.fn(async () => true)

    stubServiceWorkerState({
      controller: {},
      registrations: [registration],
    })
    stubCaches({
      delete: cacheDelete,
      keys: vi.fn(async () => ['workbox-precache-v2-http://localhost:1924/', 'images-cache', 'unrelated-cache']),
    })

    await expect(cleanupStaleDevServiceWorker({ reload })).resolves.toEqual({
      cacheNamesDeleted: ['workbox-precache-v2-http://localhost:1924/', 'images-cache'],
      reloadRequested: true,
      registrationsUnregistered: 1,
    })
    expect(registration.unregister).toHaveBeenCalledTimes(1)
    expect(cacheDelete).toHaveBeenCalledWith('workbox-precache-v2-http://localhost:1924/')
    expect(cacheDelete).toHaveBeenCalledWith('images-cache')
    expect(cacheDelete).not.toHaveBeenCalledWith('unrelated-cache')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('avoids a reload loop if the old controller survives the first cleanup attempt', async () => {
    const registration = createRegistration()
    const reload = vi.fn()

    stubServiceWorkerState({
      controller: {},
      registrations: [registration],
    })
    stubCaches({
      delete: vi.fn(async () => true),
      keys: vi.fn(async () => []),
    })

    await cleanupStaleDevServiceWorker({ reload })
    await expect(cleanupStaleDevServiceWorker({ reload })).resolves.toMatchObject({
      reloadRequested: false,
      registrationsUnregistered: 1,
    })
    expect(registration.unregister).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

function createRegistration(): ServiceWorkerRegistrationMock {
  return {
    unregister: vi.fn(async () => true),
  }
}

function stubServiceWorkerState(options: {
  controller: unknown
  registrations: ServiceWorkerRegistrationMock[]
}): void {
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: options.controller,
      getRegistrations: vi.fn(async () => options.registrations),
    },
  })
}

function stubCaches(caches: { delete: ReturnType<typeof vi.fn>; keys: ReturnType<typeof vi.fn> }): void {
  vi.stubGlobal('caches', caches)
}
