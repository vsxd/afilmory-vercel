import { createBrowserRouter } from "react-router";

import App from "./App";
import { ErrorElement } from "./components/common/ErrorElement";
import { NotFound } from "./components/common/NotFound";
import { buildGlobRoutes } from "./lib/route-builder";
import type { AppRuntime } from "./runtime/app-runtime";

const globTree = import.meta.env.DEV
  ? import.meta.glob("./pages/**/*.tsx")
  : import.meta.glob([
      "./pages/**/*.tsx",
      "!./pages/(debug)/**/*.tsx",
      "!./pages/(data)/**/*.tsx",
    ]);
const tree = buildGlobRoutes(globTree);

export const createAppRouter = (runtime: AppRuntime) =>
  createBrowserRouter([
  {
    path: "/",
    element: <App runtime={runtime} />,
    children: tree,
    errorElement: <ErrorElement />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);
