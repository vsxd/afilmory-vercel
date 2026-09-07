import { createBrowserRouter } from "react-router";
import { globTree } from "virtual:afilmory-routes";

import App from "./App";
import { ErrorElement } from "./components/common/ErrorElement";
import { NotFound } from "./components/common/NotFound";
import { buildGlobRoutes } from "./lib/route-builder";
import type { AppRuntime } from "./runtime/app-runtime";

const tree = buildGlobRoutes(globTree);

export const createAppRouter = (runtime: AppRuntime) => {
  const router = createBrowserRouter([
    {
      path: "/",
      element: <App runtime={runtime} />,
      children: tree,
      errorElement: <ErrorElement />,
      hydrateFallbackElement: <></>,
    },
    {
      path: "*",
      element: <NotFound />,
    },
  ]);

  runtime.navigation.bind(router);
  return router;
};
