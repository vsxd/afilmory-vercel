import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigation } from "react-router";

import { siteConfig } from "./config";
import { useCommandPaletteSession } from "./hooks/useCommandPaletteSession";
import { scheduleGalleryPreload } from "./lib/gallery-preload";
import { getPreparedCommandPalette } from "./modules/gallery/command-palette/load";
import { RootProviders } from "./providers/root-providers";
import type { AppRuntime } from "./runtime/app-runtime";

function App({ runtime }: { runtime: AppRuntime }) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname !== "/") return;
    return scheduleGalleryPreload(() =>
      Promise.allSettled([
        import("./pages/(main)/photos/[photoId]/index"),
        ...(siteConfig.map?.length
          ? [
              import("./pages/explore/index"),
              runtime.photoRepository.ensureMapDetails(),
            ]
          : []),
      ]),
    );
  }, [pathname, runtime]);

  return (
    <RootProviders runtime={runtime}>
      <NavigationPending />
      <div className="overflow-hidden lg:h-svh">
        <Outlet />
        <CommandPaletteContainer />
      </div>
    </RootProviders>
  );
}

function NavigationPending() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  if (navigation.state !== "loading") return null;
  return (
    <div
      role="status"
      data-navigation-pending
      className="af-panel text-ui pointer-events-none fixed top-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg"
    >
      <i
        className="i-mingcute-loading-line motion-safe:animate-spin"
        aria-hidden="true"
      />
      {t("loading.default")}
    </div>
  );
}

const CommandPaletteContainer = () => {
  const { shouldMount, ...paletteProps } = useCommandPaletteSession();
  if (!shouldMount) {
    return null;
  }

  // Bootstrap has resolved the module. Render it directly: React.lazy would
  // still suspend on first use and delay the commit even with a warm import.
  const CommandPalette = getPreparedCommandPalette();
  return <CommandPalette {...paletteProps} />;
};
export default App;
