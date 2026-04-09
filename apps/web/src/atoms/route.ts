import { atom, useAtomValue } from 'jotai'
import { selectAtom } from 'jotai/utils'
import { useCallback } from 'react'
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
      unstable_mask: undefined,
    },
  }),
)

export const useReadonlyRouteSelector = <T>(selector: (route: RouteAtom) => T): T =>
  useAtomValue(
    selectAtom(
      routeAtom,
      useCallback((route) => selector(route), [selector]),
    ),
  )

// Vite HMR will create new router instance, but RouterProvider always stable

const [, , , , navigate, setNavigate] = createAtomHooks(atom<{ fn: NavigateFunction | null }>({ fn() {} }))
const getStableRouterNavigate = () => navigate().fn
export { getStableRouterNavigate, setNavigate }
