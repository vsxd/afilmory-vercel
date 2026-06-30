import "./styles/index.css";

import type { ReactNode } from "react";
import { startTransition } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { BootstrapError } from "./components/common/BootstrapError";
import { BootstrapReady } from "./components/common/BootstrapReady";
import { loadManifestRuntime } from "./data-runtime/manifest-runtime";
import { installCriticalRoutePreloads } from "./lib/critical-route-preload";
import { markStartup } from "./lib/startup-metrics";
import { createAppRouter } from "./router";
import { createAppRuntime } from "./runtime/app-runtime";

if (import.meta.env.DEV) {
  void import("./lib/dev-service-worker-cleanup").then(
    ({ cleanupStaleDevServiceWorker }) => cleanupStaleDevServiceWorker(),
  );
} else {
  void import("./lib/register-service-worker").then(
    ({ registerProductionServiceWorker }) => registerProductionServiceWorker(),
  );
}

markStartup("main-module-ready");

const rootElement = document.querySelector<HTMLElement>("#root");
if (!rootElement) {
  throw new Error("Root element #root was not found.");
}
const rootContainer: HTMLElement = rootElement;

let root: Root | undefined;

function getRoot(): Root {
  root ||= createRoot(rootContainer);
  return root;
}

function renderApp(node: ReactNode) {
  startTransition(() => {
    getRoot().render(<BootstrapReady>{node}</BootstrapReady>);
  });
}

const criticalRoutePreloadModules = import.meta.glob([
  "./pages/(main)/layout.tsx",
  "./pages/(main)/photos/[photoId]/index.tsx",
]);

const PHOTO_VIEWER_ROUTE_MODULE_KEY =
  "./pages/(main)/photos/[photoId]/index.tsx";

// 首屏渲染后、浏览器空闲时预热 viewer（照片详情）路由，把它的重依赖
// （WebGLImageViewer / maplibre / swiper / zoom）移出首屏关键路径，避免拖慢 LCP。
// 直接深链或点击进入 viewer 时，由 router 的懒加载兜底，体验不降。
function schedulePhotoViewerPreload(
  modules: Record<string, (() => Promise<unknown>) | undefined>,
): void {
  const preloadViewer = modules[PHOTO_VIEWER_ROUTE_MODULE_KEY];
  if (!preloadViewer) return;
  const run = () => {
    void preloadViewer();
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 200);
  }
}

async function bootstrap() {
  try {
    markStartup("manifest-start");
    markStartup("critical-routes-start");
    const criticalRoutePreload = installCriticalRoutePreloads(
      criticalRoutePreloadModules,
    );
    const criticalRoutesReady = criticalRoutePreload.ready.then(() => {
      markStartup("critical-routes-ready");
    });
    const startupTasks: Promise<unknown>[] = [
      loadManifestRuntime(),
      criticalRoutesReady,
    ];

    if (import.meta.env.DEV && import.meta.env.MODE === "development") {
      startupTasks.push(
        import("react-scan").then(({ start }) => {
          start();
        }),
      );
    }

    const [manifest] = await Promise.all(startupTasks);
    markStartup("manifest-ready", {
      photos: Array.isArray(
        (manifest as Awaited<ReturnType<typeof loadManifestRuntime>>).photos,
      )
        ? (manifest as Awaited<ReturnType<typeof loadManifestRuntime>>).photos
            .length
        : undefined,
    });
    const runtime = createAppRuntime({
      manifest: manifest as Awaited<ReturnType<typeof loadManifestRuntime>>,
    });
    runtime.criticalRoutePreloadCleanup = criticalRoutePreload.cleanup;
    markStartup("photo-repository-ready");
    markStartup("react-render-start");
    renderApp(<RouterProvider router={createAppRouter(runtime)} />);
    schedulePhotoViewerPreload(criticalRoutePreloadModules);
  } catch (error) {
    console.error("[bootstrap] Failed to initialize application:", error);
    renderApp(<BootstrapError error={error} />);
  }
}

await bootstrap();
