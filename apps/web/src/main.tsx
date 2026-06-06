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

    if (import.meta.env.DEV) {
      startupTasks.push(
        import("react-scan").then(({ start }) => {
          start();
        }),
      );
    }

    const [manifest] = await Promise.all(startupTasks);
    markStartup("manifest-ready", {
      photos: Array.isArray(
        (manifest as Awaited<ReturnType<typeof loadManifestRuntime>>).data,
      )
        ? (manifest as Awaited<ReturnType<typeof loadManifestRuntime>>).data
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
  } catch (error) {
    console.error("[bootstrap] Failed to initialize application:", error);
    renderApp(<BootstrapError error={error} />);
  }
}

await bootstrap();
