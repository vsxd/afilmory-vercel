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
    expect(html).toContain('afilmory:startup-metrics:v1')
    expect(html).toContain("rel='stylesheet'")
    expect(html).not.toContain('logoFade')
    expect(html).not.toContain('titleFade')
    expect(html).not.toContain('subtitleFade')
    expect(html).not.toContain('loaderFade')
  })

  it('keeps splash visible while the manifest bootstrap is still pending', async () => {
    let resolveManifest!: (value: AfilmoryManifest) => void
    const manifestPromise = new Promise<AfilmoryManifest>((resolve) => {
      resolveManifest = resolve
    })
    const initializePhotoLoader = vi.fn()
    const markStartup = vi.fn()
    const flushStartupMetrics = vi.fn()

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

    window.__AFILMORY_STARTUP__ = {
      marks: [],
      mark: markStartup,
      flush: flushStartupMetrics,
      snapshot: vi.fn(),
    }
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
    await waitFor(() => {
      expect(markStartup).toHaveBeenCalledWith('manifest-start', undefined)
    })

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
    expect(markStartup).toHaveBeenCalledWith('manifest-ready', { photos: 0 })
    expect(markStartup).toHaveBeenCalledWith('photo-loader-ready', undefined)
    expect(markStartup).toHaveBeenCalledWith('react-render-start', undefined)
    expect(markStartup).toHaveBeenCalledWith('app-commit', undefined)
    expect(markStartup).toHaveBeenCalledWith('splash-removed', { via: 'timeout' })
    expect(flushStartupMetrics).toHaveBeenCalledWith('splash-removed')
  })
})
