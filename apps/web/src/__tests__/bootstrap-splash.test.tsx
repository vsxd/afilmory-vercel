import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { AfilmoryManifest } from '@afilmory/data'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const manifest: AfilmoryManifest = {
  version: 'v8',
  data: [],
  cameras: [],
  lenses: [],
}

describe('bootstrap splash', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('__CONFIG__', {})
    vi.stubGlobal('__SITE_CONFIG__', {
      title: 'Test Lens',
      description: 'Loading test photos',
    })
    document.body.innerHTML = ''
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('keeps the static loading state outside the React root', () => {
    const html = readFileSync(path.join(process.cwd(), 'apps/web/index.html'), 'utf-8')
    const splashIndex = html.indexOf('id="splash-screen"')
    const rootIndex = html.indexOf('id="root"')

    expect(splashIndex).toBeGreaterThan(-1)
    expect(rootIndex).toBeGreaterThan(-1)
    expect(splashIndex).toBeLessThan(rootIndex)
    expect(html).toContain("rel='stylesheet'")
  })

  it('keeps splash visible while the manifest bootstrap is still pending', async () => {
    let resolveManifest!: (value: AfilmoryManifest) => void
    const manifestPromise = new Promise<AfilmoryManifest>((resolve) => {
      resolveManifest = resolve
    })
    const initializePhotoLoader = vi.fn()

    vi.doMock('../data-runtime/manifest-runtime', () => ({
      loadManifestRuntime: vi.fn(() => manifestPromise),
    }))
    vi.doMock('../data-runtime/photo-loader', () => ({
      initializePhotoLoader,
    }))
    vi.doMock('../router', () => ({
      router: {},
    }))
    vi.doMock('react-router', () => ({
      RouterProvider: () => <div data-testid="router-app">Gallery ready</div>,
    }))

    document.body.innerHTML =
      '<div id="splash-screen" role="status" aria-label="Loading">Static splash</div><div id="root"></div>'

    let importPromise!: Promise<unknown>
    await act(async () => {
      importPromise = import('../main')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull()
    expect(screen.queryByTestId('router-app')).toBeNull()
    expect(initializePhotoLoader).not.toHaveBeenCalled()

    await act(async () => {
      resolveManifest(manifest)
      await importPromise
    })

    expect(initializePhotoLoader).toHaveBeenCalledWith(manifest)
    await waitFor(() => {
      expect(screen.getByTestId('router-app')).not.toBeNull()
    })
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull()
    })
  })
})
