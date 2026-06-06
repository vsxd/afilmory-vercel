import { atom, useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback } from "react";
import type { Location, NavigateFunction, Params } from "react-router";

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
  useAtomValue(
    selectAtom(
      routeAtom,
      useCallback((route) => selector(route), [selector]),
    ),
  );

// Vite HMR will create new router instance, but RouterProvider always stable

export const navigateAtom = atom<{ fn: NavigateFunction | null }>({
  fn() {},
});
