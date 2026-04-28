import type { AfilmoryManifest } from '@afilmory/data'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

  it('renders an accessible loading state', async () => {
    const { BootstrapSplash } = await import('../components/common/BootstrapSplash')

    render(<BootstrapSplash />)

    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull()
    expect(screen.getByText('Test Lens')).not.toBeNull()
    expect(screen.getByText('Loading test photos')).not.toBeNull()
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

    document.body.innerHTML = '<div id="root"><div id="splash-screen">Static splash</div></div>'

    let importPromise!: Promise<unknown>
    await act(async () => {
      importPromise = import('../main')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(await screen.findByTestId('bootstrap-splash')).not.toBeNull()
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
    expect(screen.queryByTestId('bootstrap-splash')).toBeNull()
  })
})
