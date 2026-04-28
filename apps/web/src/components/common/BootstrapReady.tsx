import type { ReactNode } from 'react'
import { useEffect } from 'react'

function dismissBootstrapSplash() {
  const splash = document.querySelector<HTMLElement>('#splash-screen')
  if (!splash) return

  splash.dataset.state = 'hidden'
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
  window.setTimeout(() => splash.remove(), 220)
}

export function BootstrapReady({ children }: { children: ReactNode }) {
  useEffect(() => {
    dismissBootstrapSplash()
  }, [])

  return <>{children}</>
}
