import type { MutableRefObject } from "react";
import { useLayoutEffect, useRef } from "react";

export const useRefValue = <S>(value: S): Readonly<MutableRefObject<S>> => {
  const ref = useRef<S>(value);

  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};
