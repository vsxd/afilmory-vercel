import './styles/index.css'

import type { ReactNode } from 'react'
import { startTransition } from 'react'
import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { BootstrapError } from './components/common/BootstrapError'
import { BootstrapSplash } from './components/common/BootstrapSplash'
import { loadManifestRuntime } from './data-runtime/manifest-runtime'
import { initializePhotoLoader } from './data-runtime/photo-loader'
import { router } from './router'

const BOOT_SPLASH_MIN_VISIBLE_MS = import.meta.env.PROD ? 350 : 0

const rootElement = document.querySelector<HTMLElement>('#root')
if (!rootElement) {
  throw new Error('Root element #root was not found.')
}
const rootContainer: HTMLElement = rootElement

let root: Root | undefined

function getRoot(): Root {
  root ||= createRoot(rootContainer)
  return root
}

function renderApp(node: ReactNode) {
  startTransition(() => {
    getRoot().render(node)
  })
}

function renderBootstrapSplash() {
  getRoot().render(<BootstrapSplash />)
}

function getCurrentTime() {
  return globalThis.performance?.now() ?? Date.now()
}

function waitForNextPaint(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

async function waitForBootstrapSplash(renderedAt: number) {
  await waitForNextPaint()

  const remainingMs = BOOT_SPLASH_MIN_VISIBLE_MS - (getCurrentTime() - renderedAt)
  if (remainingMs <= 0) {
    return
  }

  await new Promise((resolve) => window.setTimeout(resolve, remainingMs))
}

async function bootstrap() {
  const splashRenderedAt = getCurrentTime()
  renderBootstrapSplash()

  try {
    const startupTasks: Promise<unknown>[] = [loadManifestRuntime(), waitForBootstrapSplash(splashRenderedAt)]

    if (import.meta.env.DEV) {
      startupTasks.push(
        import('react-scan').then(({ start }) => {
          start()
        }),
      )
    }

    const [manifest] = await Promise.all(startupTasks)
    initializePhotoLoader(manifest as Awaited<ReturnType<typeof loadManifestRuntime>>)
    renderApp(<RouterProvider router={router} />)
  } catch (error) {
    console.error('[bootstrap] Failed to initialize application:', error)
    renderApp(<BootstrapError error={error} />)
  }
}

await bootstrap()
