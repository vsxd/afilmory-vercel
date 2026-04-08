import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadManifestRuntime } from '../manifest-runtime'

const originalFetch = globalThis.fetch

describe('loadManifestRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as typeof globalThis & { __MANIFEST__?: unknown }).__MANIFEST__
    delete (globalThis as typeof globalThis & { __MANIFEST_URL__?: string }).__MANIFEST_URL__
    delete (globalThis as typeof globalThis & { __MANIFEST_PROMISE__?: Promise<unknown> }).__MANIFEST_PROMISE__
    globalThis.fetch = originalFetch
  })

  it('returns the injected inline manifest without fetching', async () => {
    ;(globalThis as typeof globalThis & { __MANIFEST__?: unknown }).__MANIFEST__ = {
      version: 'v6',
      data: [{ id: '1', tags: [] }],
      cameras: [],
      lenses: [],
    }
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as typeof globalThis.fetch

    const manifest = await loadManifestRuntime()

    expect(manifest.data).toHaveLength(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uses the prestarted manifest promise when available', async () => {
    ;(globalThis as typeof globalThis & { __MANIFEST_PROMISE__?: Promise<unknown> }).__MANIFEST_PROMISE__ =
      Promise.resolve({
        version: 'v6',
        data: [{ id: '2', tags: [] }],
        cameras: [],
        lenses: [],
      })

    const manifest = await loadManifestRuntime()

    expect(manifest.data[0]?.id).toBe('2')
  })

  it('fetches the external manifest when only a URL is injected', async () => {
    ;(globalThis as typeof globalThis & { __MANIFEST_URL__?: string }).__MANIFEST_URL__ = '/assets/photos-manifest.json'
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 'v6',
        data: [{ id: '3', tags: [] }],
        cameras: [],
        lenses: [],
      }),
    })
    globalThis.fetch = fetchSpy as typeof globalThis.fetch

    const manifest = await loadManifestRuntime()

    expect(fetchSpy).toHaveBeenCalledWith('/assets/photos-manifest.json', expect.any(Object))
    expect(manifest.data[0]?.id).toBe('3')
  })

  it('clears the cached promise after a failed fetch so retries can succeed', async () => {
    ;(globalThis as typeof globalThis & { __MANIFEST_URL__?: string }).__MANIFEST_URL__ = '/assets/photos-manifest.json'
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: 'v6',
          data: [{ id: '4', tags: [] }],
          cameras: [],
          lenses: [],
        }),
      })
    globalThis.fetch = fetchSpy as typeof globalThis.fetch

    await expect(loadManifestRuntime()).rejects.toThrow('Manifest request failed: 503 Unavailable')
    const manifest = await loadManifestRuntime()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(manifest.data[0]?.id).toBe('4')
  })
})
