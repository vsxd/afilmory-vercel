import { atom, useAtomValue } from 'jotai'
import { selectAtom } from 'jotai/utils'
import type * as React from 'react'
import { useMemo } from 'react'
import type { Location, NavigateFunction, Params } from 'react-router'

import { createAtomHooks } from '~/lib/jotai'

interface RouteAtom {
  params: Readonly<Params<string>>
  searchParams: URLSearchParams
  location: Location
}

export const [routeAtom, , , , getReadonlyRoute, setRoute] = createAtomHooks(
  atom<RouteAtom>({
    params: {},
    searchParams: new URLSearchParams(),
    location: {
      pathname: '',
      search: '',
      hash: '',
      state: null,
      key: '',
    },
  }),
)

const noop: React.DependencyList = []
export const useReadonlyRouteSelector = <T>(selector: (route: RouteAtom) => T, deps: React.DependencyList = noop): T =>
  useAtomValue(useMemo(() => selectAtom(routeAtom, (route) => selector(route)), deps))

// Vite HMR will create new router instance, but RouterProvider always stable

const [, , , , navigate, setNavigate] = createAtomHooks(atom<{ fn: NavigateFunction | null }>({ fn() {} }))
const getStableRouterNavigate = () => navigate().fn
export { getStableRouterNavigate, setNavigate }
