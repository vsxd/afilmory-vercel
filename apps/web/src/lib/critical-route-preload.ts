// 仅首屏图库布局属于关键预热——它会阻塞首屏渲染（bootstrap 的 Promise.all）。
// viewer（照片详情）路由改由 main 在首屏渲染后空闲时预热，避免把它的重依赖
// （WebGLImageViewer / maplibre / swiper / zoom）拉进首屏关键路径而拖慢 LCP。
const CRITICAL_GALLERY_ROUTE_MODULE_KEYS = [
  "./pages/(main)/layout.tsx",
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
