import './styles/index.css'

import { startTransition } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { BootstrapError } from './components/common/BootstrapError'
import { loadManifestRuntime } from './data-runtime/manifest-runtime'
import { initializePhotoLoader } from './data-runtime/photo-loader'
import { router } from './router'

const rootElement = document.querySelector('#root')
if (!rootElement) {
  throw new Error('Root element #root was not found.')
}

const root = createRoot(rootElement)

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

    startTransition(() => {
      root.render(<RouterProvider router={router} />)
    })
  } catch (error) {
    console.error('[bootstrap] Failed to initialize application:', error)
    startTransition(() => {
      root.render(<BootstrapError error={error} />)
    })
  }
}

await bootstrap()
