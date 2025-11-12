import { Outlet } from 'react-router'

import { CommandPalette } from './components/gallery/CommandPalette'
import { useCommandPaletteShortcut } from './hooks/useCommandPaletteShortcut'
import { RootProviders } from './providers/root-providers'

// prefetch preview page route - 使用 import.meta.glob 让 Vite 在构建时正确处理
// 这样 Vite 可以在构建时正确解析包含方括号的路径
const photoPagePrefetch = import.meta.glob('./pages/(main)/photos/[photoId]/index.tsx', { eager: false })
// 在浏览器环境中延迟 prefetch，避免阻塞初始渲染
if (typeof window !== 'undefined') {
  const moduleKey = './pages/(main)/photos/[photoId]/index.tsx'
  setTimeout(() => {
    if (photoPagePrefetch[moduleKey]) {
      photoPagePrefetch[moduleKey]()
    }
  }, 100)
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
  return <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />
}
export default App
