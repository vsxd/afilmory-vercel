import { useEffect, useLayoutEffect } from 'react'
import type { NavigateFunction } from 'react-router'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'

import { setNavigate, setRoute } from '~/atoms/route'

declare global {
  interface Window {
    router?: {
      navigate: NavigateFunction
    }
  }
}

const useSafeLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function getWindowRouter(): Window['router'] | null {
  if (typeof window === 'undefined') {
    return null
  }

  window.router ??= {
    navigate() {},
  }

  return window.router
}

/**
 * Why this.
 * Remix router always update immutable object when the router has any changes, lead to the component which uses router hooks re-render.
 * This provider is hold a empty component, to store the router hooks value.
 * And use our router hooks will not re-render the component when the router has any changes.
 * Also it can access values outside of the component and provide a value selector
 */
export const StableRouterProvider = () => {
  const [searchParams] = useSearchParams()
  const params = useParams()
  const nav = useNavigate()
  const location = useLocation()

  // NOTE: This is a hack to expose the navigate function to the window object, avoid to import `router` circular issue.
  useSafeLayoutEffect(() => {
    const browserRouter = getWindowRouter()
    if (browserRouter) {
      browserRouter.navigate = nav
    }

    setRoute({
      params,
      searchParams,
      location,
    })
    setNavigate({ fn: nav })
  }, [searchParams, params, location, nav])

  return null
}
