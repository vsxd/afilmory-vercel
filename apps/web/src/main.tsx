import "./styles/index.css";

import type { ReactNode } from "react";
import { startTransition } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { BootstrapError } from "./components/common/BootstrapError";
import { BootstrapReady } from "./components/common/BootstrapReady";
import { loadManifestRuntime } from "./data-runtime/manifest-runtime";
import { initialLanguageReady } from "./i18n";
import { installCriticalRoutePreloads } from "./lib/critical-route-preload";
import { markStartup } from "./lib/startup-metrics";
import { loadCommandPalette } from "./modules/gallery/command-palette/load";
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

// Explicit loaders keep the photo route's literal brackets out of glob syntax.
const criticalRoutePreloadModules = {
  "./pages/(main)/layout.tsx": () => import("./pages/(main)/layout"),
  "./pages/(main)/photos/[photoId]/index.tsx": () =>
    import("./pages/(main)/photos/[photoId]/index"),
  "./pages/explore/index.tsx": () => import("./pages/explore/index"),
};

async function bootstrap() {
  try {
    markStartup("manifest-start");
    markStartup("critical-routes-start");
    const criticalRoutesReady = installCriticalRoutePreloads(
      criticalRoutePreloadModules,
      window.location.pathname,
    ).then(() => {
      markStartup("critical-routes-ready");
    });
    const startupTasks: Promise<unknown>[] = [
      loadManifestRuntime(),
      criticalRoutesReady,
      // Search is a core gallery action: prepare its code before the first
      // click, in parallel with the gallery rather than serializing bootstrap.
      loadCommandPalette(),
      // 检测语言的翻译包与 manifest / 关键路由并行加载（en 为同步空操作），
      // 首次渲染前就绪，非英文用户不会闪现英文兜底文案。
      initialLanguageReady,
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
    markStartup("photo-repository-ready");
    markStartup("react-render-start");
    renderApp(<RouterProvider router={createAppRouter(runtime)} />);
  } catch (error) {
    console.error("[bootstrap] Failed to initialize application:", error);
    renderApp(<BootstrapError error={error} />);
  }
}

await bootstrap();
