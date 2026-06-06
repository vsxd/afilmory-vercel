import type { Atom, PrimitiveAtom } from "jotai";
import { atom as createAtom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";

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

const EMPTY_SELECTION = Symbol("empty-selection");

export const createSelectAtom = <Value, Selection>(
  atom: Atom<Value>,
  selector: (value: Value) => Selection,
  equalityFn: (previous: Selection, next: Selection) => boolean = Object.is,
) => {
  let previous: Selection | typeof EMPTY_SELECTION = EMPTY_SELECTION;

  return createAtom((get) => {
    const next = selector(get(atom));
    if (
      previous !== EMPTY_SELECTION &&
      equalityFn(previous as Selection, next)
    ) {
      return previous as Selection;
    }
    previous = next;
    return next;
  });
};

export const useAtomSelector = <Value, Selection>(
  atom: Atom<Value>,
  selector: (value: Value) => Selection,
  equalityFn?: (previous: Selection, next: Selection) => boolean,
) => {
  const selectedAtom = useMemo(
    () => createSelectAtom(atom, selector, equalityFn),
    [atom, selector, equalityFn],
  );
  return useAtomValue(selectedAtom);
};

export const createAtomSelector = <T>(atom: Atom<T>) => {
  const useHook = <R>(selector: (a: T) => R) =>
    useAtomSelector(
      atom,
      useCallback((a) => selector(a), [selector]),
    );

  useHook.__atom = atom;
  return useHook;
};
