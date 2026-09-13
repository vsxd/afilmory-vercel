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
  ).filter((element) => {
    if (element.closest("[inert]")) return false;

    // Responsive rules can hide a whole heading while its child button still
    // matches the focus selector. Walk ancestors without relying on layout
    // rectangles, which are also empty in non-layout DOM environments.
    for (
      let ancestor: HTMLElement | null = element;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (ancestor.hidden || ancestor.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = window.getComputedStyle(ancestor);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      ) {
        return false;
      }
      if (ancestor === container) break;
    }
    return true;
  });

interface DialogFocusManagementOptions {
  dialogRef: RefObject<HTMLElement | null>;
  focusContainerOnOpen?: boolean;
  initialFocusSelector?: string;
  isOpen: boolean;
  retainReturnFocusOnSuspend?: boolean;
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
  retainReturnFocusOnSuspend = false,
  restoreFocusOnClose = true,
  returnFocusElement,
}: DialogFocusManagementOptions): void {
  const returnFocusRef = useRef<HTMLElement | null>(returnFocusElement ?? null);
  const restoreFocusFrameRef = useRef<number | null>(null);
  const restoreFocusOnCloseRef = useRef(restoreFocusOnClose);
  const retainReturnFocusOnSuspendRef = useRef(retainReturnFocusOnSuspend);
  const suspendedReturnFocusRef = useRef<HTMLElement | null>(null);
  const openingFocusRef = useRef({
    focusContainerOnOpen,
    initialFocusSelector,
  });
  returnFocusRef.current = returnFocusElement ?? null;
  restoreFocusOnCloseRef.current = restoreFocusOnClose;
  retainReturnFocusOnSuspendRef.current = retainReturnFocusOnSuspend;
  openingFocusRef.current = { focusContainerOnOpen, initialFocusSelector };

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
    const retainedTarget =
      retainReturnFocusOnSuspendRef.current &&
      suspendedReturnFocusRef.current?.isConnected
        ? suspendedReturnFocusRef.current
        : null;
    const focusTarget =
      returnFocusRef.current ?? retainedTarget ?? activeElement;
    suspendedReturnFocusRef.current = null;
    // These options select the opening focus once per modal session. Changing
    // search results or responsive policy must not steal focus during typing,
    // nor recapture an internal control as the original opener.
    const openingFocus = openingFocusRef.current;

    const focusInitialElement = () => {
      if (openingFocus.focusContainerOnOpen) {
        dialog.focus({ preventScroll: true });
        return;
      }
      const preferred = openingFocus.initialFocusSelector
        ? dialog.querySelector<HTMLElement>(openingFocus.initialFocusSelector)
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
      // A photo handoff can disable restoration in the same render that closes
      // this dialog. Read the current policy rather than the opening render.
      if (!restoreFocusOnCloseRef.current) {
        // Search can suspend for a photo viewer and resume after that viewer's
        // controls disappear. Keep the original external opener for that trip.
        suspendedReturnFocusRef.current = retainReturnFocusOnSuspendRef.current
          ? focusTarget
          : null;
        return;
      }
      suspendedReturnFocusRef.current = null;
      // Ancestor/sibling modal-isolation effects may release inert after this
      // cleanup. Browsers silently ignore focus while the opener is inert.
      restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
        restoreFocusFrameRef.current = null;
        if (
          restoreFocusOnCloseRef.current &&
          focusTarget?.isConnected &&
          !focusTarget.closest("[inert]")
        ) {
          focusTarget.focus({ preventScroll: true });
        }
      });
    };
  }, [dialogRef, isOpen]);
}
