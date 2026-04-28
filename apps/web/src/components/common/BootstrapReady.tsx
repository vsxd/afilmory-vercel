import type { ReactNode } from 'react'
import { useEffect } from 'react'

import { flushStartupMetrics, markStartup } from '~/lib/startup-metrics'

function dismissBootstrapSplash() {
  const splash = document.querySelector<HTMLElement>('#splash-screen')
  if (!splash) return

  splash.dataset.state = 'hidden'
  splash.addEventListener(
    'transitionend',
    () => {
      splash.remove()
      markStartup('splash-removed', { via: 'transitionend' })
      flushStartupMetrics('splash-removed')
    },
    { once: true },
  )
  window.setTimeout(() => {
    if (!splash.isConnected) return
    splash.remove()
    markStartup('splash-removed', { via: 'timeout' })
    flushStartupMetrics('splash-removed')
  }, 220)
}

export function BootstrapReady({ children }: { children: ReactNode }) {
  useEffect(() => {
    markStartup('app-commit')
    dismissBootstrapSplash()
  }, [])

  return <>{children}</>
}
