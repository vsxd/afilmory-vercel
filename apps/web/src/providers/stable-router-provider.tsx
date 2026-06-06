import { useSetAtom } from "jotai";
import { useEffect, useLayoutEffect } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";

import { navigateAtom, routeAtom } from "~/atoms/route";

const useSafeLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Why this.
 * Remix router always update immutable object when the router has any changes, lead to the component which uses router hooks re-render.
 * This provider is hold a empty component, to store the router hooks value.
 * And use our router hooks will not re-render the component when the router has any changes.
 * Also it can access values outside of the component and provide a value selector
 */
export const StableRouterProvider = () => {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const setRoute = useSetAtom(routeAtom);
  const setNavigate = useSetAtom(navigateAtom);

  useSafeLayoutEffect(() => {
    setRoute({
      params,
      searchParams,
      location,
    });
    setNavigate({ fn: nav });
  }, [searchParams, params, location, nav]);

  return null;
};
