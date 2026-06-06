import type { Atom, PrimitiveAtom } from "jotai";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback } from "react";

/**
 * @param atom - jotai
 * @returns - [atom, useAtom, useAtomValue, useSetAtom]
 */
export const createAtomHooks = <T>(atom: PrimitiveAtom<T>) =>
  [
    atom,
    () => useAtom(atom),
    () => useAtomValue(atom),
    () => useSetAtom(atom),
  ] as const;

export const createAtomSelector = <T>(atom: Atom<T>) => {
  const useHook = <R>(selector: (a: T) => R) =>
    useAtomValue(
      selectAtom(
        atom,
        useCallback((a) => selector(a as T), [selector]),
      ),
    );

  useHook.__atom = atom;
  return useHook;
};
