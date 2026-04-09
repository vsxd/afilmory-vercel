import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router'

import { useCommandPaletteShortcut } from './hooks/useCommandPaletteShortcut'
import { RootProviders } from './providers/root-providers'

const CommandPalette = lazy(() =>
  import('./components/gallery/CommandPalette').then((m) => ({ default: m.CommandPalette })),
)

const photoPagePrefetch = import.meta.glob('./pages/(main)/photos/[photoId]/index.tsx', { eager: false })

if (typeof window !== 'undefined') {
  const moduleKey = './pages/(main)/photos/[photoId]/index.tsx'

  let hasPrefetchedPhotoPage = false

  const prefetchPhotoPage = () => {
    if (hasPrefetchedPhotoPage) {
      return
    }

    hasPrefetchedPhotoPage = true
    void photoPagePrefetch[moduleKey]?.()
    window.removeEventListener('pointerover', onPhotoLinkIntent, true)
    window.removeEventListener('focusin', onPhotoLinkIntent, true)
  }

  const onPhotoLinkIntent = (event: Event) => {
    const { target } = event

    if (!(target instanceof Element)) {
      return
    }

    const link = target.closest('a[href]')
    const href = link?.getAttribute('href')
    if (!href?.startsWith('/photos/')) {
      return
    }

    prefetchPhotoPage()
  }

  window.addEventListener('pointerover', onPhotoLinkIntent, { capture: true, passive: true })
  window.addEventListener('focusin', onPhotoLinkIntent, true)
}

function App() {
  return (
    <RootProviders>
      <div className="overflow-hidden lg:h-svh">
        <Outlet />
        <CommandPaletteContainer />
      </div>
    </RootProviders>
  )
}

const CommandPaletteContainer = () => {
  const { isOpen, setIsOpen } = useCommandPaletteShortcut()
  if (!isOpen) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </Suspense>
  )
}
export default App
