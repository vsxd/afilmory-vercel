import './styles/index.css'

import type { ReactNode } from 'react'
import { startTransition } from 'react'
import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { BootstrapError } from './components/common/BootstrapError'
import { BootstrapReady } from './components/common/BootstrapReady'
import { loadManifestRuntime } from './data-runtime/manifest-runtime'
import { initializePhotoLoader } from './data-runtime/photo-loader'
import { router } from './router'

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
    getRoot().render(<BootstrapReady>{node}</BootstrapReady>)
  })
}

async function bootstrap() {
  try {
    const startupTasks: Promise<unknown>[] = [loadManifestRuntime()]

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
