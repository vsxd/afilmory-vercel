import type { RefObject } from "react";
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[inert]"),
  );

interface DialogFocusManagementOptions {
  dialogRef: RefObject<HTMLElement | null>;
  focusContainerOnOpen?: boolean;
  initialFocusSelector?: string;
  isOpen: boolean;
  restoreFocusOnClose?: boolean;
  returnFocusElement?: HTMLElement | null;
}

/**
 * Keeps keyboard focus inside a custom modal and returns it to the opener.
 * Portalled child dialogs are intentionally left to their own focus scope:
 * the trap listens on the viewer element rather than on `document`.
 */
export function useDialogFocusManagement({
  dialogRef,
  focusContainerOnOpen = false,
  initialFocusSelector,
  isOpen,
  restoreFocusOnClose = true,
  returnFocusElement,
}: DialogFocusManagementOptions): void {
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusElement ?? null);
  const restoreFocusFrameRef = useRef<number | null>(null);
  returnFocusRef.current = returnFocusElement ?? null;

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    if (restoreFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFocusFrameRef.current);
      restoreFocusFrameRef.current = null;
    }

    const dialog = dialogRef.current;
    if (!dialog) return;

    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusTarget = returnFocusRef.current ?? activeElement;

    const focusInitialElement = () => {
      if (focusContainerOnOpen) {
        dialog.focus({ preventScroll: true });
        return;
      }
      const preferred = initialFocusSelector
        ? dialog.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      (preferred ?? getFocusableElements(dialog)[0] ?? dialog).focus({
        preventScroll: true,
      });
    };

    const frame = window.requestAnimationFrame(focusInitialElement);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1)!;
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === dialog || active === first || !dialog.contains(active))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      dialog.removeEventListener("keydown", handleKeyDown);
      if (!restoreFocusOnClose) return;
      // Ancestor/sibling modal-isolation effects may release inert after this
      // cleanup. Browsers silently ignore focus while the opener is inert.
      restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
        restoreFocusFrameRef.current = null;
        if (focusTarget?.isConnected && !focusTarget.closest("[inert]")) {
          focusTarget.focus({ preventScroll: true });
        }
      });
    };
  }, [
    dialogRef,
    focusContainerOnOpen,
    initialFocusSelector,
    isOpen,
    restoreFocusOnClose,
  ]);
}
