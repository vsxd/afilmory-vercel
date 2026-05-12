const CRITICAL_GALLERY_ROUTE_MODULE_KEYS = [
  "./pages/(main)/layout.tsx",
  "./pages/(main)/photos/[photoId]/index.tsx",
] as const;

type CriticalRoutePreloadModules = Record<
  string,
  (() => Promise<unknown>) | undefined
>;

export type CriticalRoutePreload = {
  cleanup: () => void;
  ready: Promise<void>;
};

async function waitForCriticalRouteModules(
  preloadPromises: Promise<unknown>[],
): Promise<void> {
  await Promise.all(preloadPromises);
}

export function installCriticalRoutePreloads(
  preloadModules: CriticalRoutePreloadModules,
): CriticalRoutePreload {
  const preloadPromises = CRITICAL_GALLERY_ROUTE_MODULE_KEYS.map(
    (moduleKey) => {
      const preloadModule = preloadModules[moduleKey];
      if (!preloadModule) {
        throw new Error(`Missing critical route module: ${moduleKey}`);
      }

      return preloadModule();
    },
  );

  return {
    cleanup() {},
    ready: waitForCriticalRouteModules(preloadPromises),
  };
}
