import type { ExtractAtomValue, getDefaultStore } from "jotai";
import { useCallback } from "react";

import { viewportAtom } from "../atoms/viewport";
import { useAtomSelector } from "../lib/jotai";

const shallowEqual = <T,>(a: T, b: T): boolean => {
  if (Object.is(a, b)) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }

  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);
  if (aEntries.length !== bEntries.length) return false;

  return aEntries.every(([key, value]) =>
    Object.is(value, (b as Record<string, unknown>)[key]),
  );
};

export const useViewport = <T>(
  selector: (value: ExtractAtomValue<typeof viewportAtom>) => T,
): T =>
  useAtomSelector(
    viewportAtom,
    useCallback((atomValue) => selector(atomValue), [selector]),
    shallowEqual,
  );

type JotaiStore = ReturnType<typeof getDefaultStore>;
export const getViewport = (store: JotaiStore) => store.get(viewportAtom);
