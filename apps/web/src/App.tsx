import { lazy, Suspense } from "react";
import { Outlet } from "react-router";

import { useCommandPaletteShortcut } from "./hooks/useCommandPaletteShortcut";
import { installPhotoPagePrefetch } from "./lib/photo-page-prefetch";
import { RootProviders } from "./providers/root-providers";

declare global {
  interface Window {
    __AFILMORY_PHOTO_PAGE_PREFETCH_CLEANUP__?: () => void;
  }
}

const CommandPalette = lazy(() =>
  import("./components/gallery/CommandPalette").then((m) => ({
    default: m.CommandPalette,
  })),
);

const photoPagePrefetch = import.meta.glob(
  "./pages/(main)/photos/[photoId]/index.tsx",
  { eager: false },
);

if (typeof window !== "undefined") {
  window.__AFILMORY_PHOTO_PAGE_PREFETCH_CLEANUP__?.();
  window.__AFILMORY_PHOTO_PAGE_PREFETCH_CLEANUP__ =
    installPhotoPagePrefetch(photoPagePrefetch);
}

function App() {
  return (
    <RootProviders>
      <div className="overflow-hidden lg:h-svh">
        <Outlet />
        <CommandPaletteContainer />
      </div>
    </RootProviders>
  );
}

const CommandPaletteContainer = () => {
  const { isOpen, setIsOpen } = useCommandPaletteShortcut();
  if (!isOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </Suspense>
  );
};
export default App;
