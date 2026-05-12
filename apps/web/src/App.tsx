import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router'

import { useCommandPaletteShortcut } from './hooks/useCommandPaletteShortcut'
import { RootProviders } from './providers/root-providers'

const CommandPalette = lazy(() =>
  import('./components/gallery/CommandPalette').then((m) => ({ default: m.CommandPalette })),
)

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
