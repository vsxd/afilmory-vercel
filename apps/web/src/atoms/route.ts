import { atom } from "jotai";
import { useCallback } from "react";
import type { Location, NavigateFunction, Params } from "react-router";

import { useAtomSelector } from "~/lib/jotai";

interface RouteAtom {
  params: Readonly<Params<string>>;
  searchParams: URLSearchParams;
  location: Location;
}

export const routeAtom = atom<RouteAtom>({
  params: {},
  searchParams: new URLSearchParams(),
  location: {
    pathname: "",
    search: "",
    hash: "",
    state: null,
    key: "",
  },
});

export const useReadonlyRouteSelector = <T>(
  selector: (route: RouteAtom) => T,
): T =>
  useAtomSelector(
    routeAtom,
    useCallback((route) => selector(route), [selector]),
  );

// Vite HMR will create new router instance, but RouterProvider always stable

export const navigateAtom = atom<{ fn: NavigateFunction | null }>({
  fn() {},
});
