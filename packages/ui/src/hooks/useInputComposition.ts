import type {
  CompositionEventHandler,
  KeyboardEventHandler,
  MutableRefObject,
} from "react";
import { useCallback, useEffect, useRef } from "react";

type CompositionInputElement = HTMLInputElement | HTMLTextAreaElement;

type InputCompositionProps<E extends CompositionInputElement> = Pick<
  React.HTMLAttributes<E>,
  "onCompositionEnd" | "onCompositionStart" | "onKeyDown" | "onKeyDownCapture"
>;

export const useInputComposition = <
  E extends CompositionInputElement = HTMLInputElement,
>(
  props: InputCompositionProps<E>,
): {
  isCompositionRef: MutableRefObject<boolean>;
  onCompositionEnd: CompositionEventHandler<E>;
  onCompositionStart: CompositionEventHandler<E>;
  onKeyDown: KeyboardEventHandler<E>;
} => {
  const { onKeyDown, onCompositionStart, onCompositionEnd } = props;

  const isCompositionRef = useRef(false);

  const currentInputTargetRef = useRef<E | null>(null);

  const handleCompositionStart: CompositionEventHandler<E> = useCallback(
    (e) => {
      currentInputTargetRef.current = e.target as E;

      isCompositionRef.current = true;
      onCompositionStart?.(e);
    },
    [onCompositionStart],
  );

  const handleCompositionEnd: CompositionEventHandler<E> = useCallback(
    (e) => {
      currentInputTargetRef.current = null;
      isCompositionRef.current = false;
      onCompositionEnd?.(e);
    },
    [onCompositionEnd],
  );

  const handleKeyDown: KeyboardEventHandler<E> = useCallback(
    (e) => {
      // The keydown event stop emit when the composition is being entered
      if (isCompositionRef.current) {
        e.stopPropagation();
        return;
      }
      onKeyDown?.(e);

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();

        if (!isCompositionRef.current) {
          e.currentTarget.blur();
        }
      }
    },
    [onKeyDown],
  );

  // Register a global capture keydown listener to prevent the radix `useEscapeKeydown` from working
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && currentInputTargetRef.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown, {
      capture: true,
    });

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown, {
        capture: true,
      });
    };
  }, []);

  const ret = {
    onCompositionEnd: handleCompositionEnd,
    onCompositionStart: handleCompositionStart,
    onKeyDown: handleKeyDown,
    isCompositionRef,
  };
  return ret;
};
