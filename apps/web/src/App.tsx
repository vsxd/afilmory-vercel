import { lazy, Suspense } from "react";
import { Outlet } from "react-router";

import { useCommandPaletteSession } from "./hooks/useCommandPaletteSession";
import { RootProviders } from "./providers/root-providers";
import type { AppRuntime } from "./runtime/app-runtime";

const CommandPalette = lazy(() =>
  import("./modules/gallery/command-palette/CommandPalette").then((m) => ({
    default: m.CommandPalette,
  })),
);

function App({ runtime }: { runtime: AppRuntime }) {
  return (
    <RootProviders runtime={runtime}>
      <div className="overflow-hidden lg:h-svh">
        <Outlet />
        <CommandPaletteContainer />
      </div>
    </RootProviders>
  );
}

const CommandPaletteContainer = () => {
  const { shouldMount, ...paletteProps } = useCommandPaletteSession();
  if (!shouldMount) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <CommandPalette {...paletteProps} />
    </Suspense>
  );
};
export default App;
