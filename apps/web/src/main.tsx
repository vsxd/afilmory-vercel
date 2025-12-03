import './styles/index.css'

import { injectSpeedInsights } from '@vercel/speed-insights'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { router } from './router'

// Inject Vercel Speed Insights on the client side
injectSpeedInsights()

if (import.meta.env.DEV) {
  const { start } = await import('react-scan')
  start()
}

createRoot(document.querySelector('#root')!).render(<RouterProvider router={router} />)
