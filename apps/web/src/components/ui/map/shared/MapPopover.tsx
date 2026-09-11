import { clsxm } from "@afilmory/ui";
import type {
  HTMLAttributes,
  MouseEventHandler,
  ReactElement,
  ReactNode,
} from "react";
import {
  cloneElement,
  createContext,
  isValidElement,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

interface MapPopoverContextValue {
  contentId: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  setOpen: (open: boolean, restoreFocus?: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const MapPopoverContext = createContext<MapPopoverContextValue | null>(null);

function useMapPopover(): MapPopoverContextValue {
  const context = use(MapPopoverContext);
  if (!context) throw new Error("MapPopover components must share a root");
  return context;
}

export function MapPopover({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const contentId = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (nextOpen: boolean, restoreFocus = false) => {
      if (controlledOpen === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
      if (!nextOpen && restoreFocus) {
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    },
    [controlledOpen, onOpenChange],
  );
  const contextValue = useMemo(
    () => ({ contentId, contentRef, open, setOpen, triggerRef }),
    [contentId, open, setOpen],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        contentRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false, false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, setOpen]);

  return (
    <MapPopoverContext value={contextValue}>
      <div className="relative">{children}</div>
    </MapPopoverContext>
  );
}

type TriggerProps = {
  children: ReactElement<{
    onClick?: MouseEventHandler<HTMLElement>;
    [key: string]: unknown;
  }>;
};

export function MapPopoverTrigger({ children }: TriggerProps) {
  const { contentId, open, setOpen, triggerRef } = useMapPopover();
  const child = children;
  if (!isValidElement(child)) return null;

  return cloneElement(child, {
    ref: triggerRef,
    "aria-controls": contentId,
    "aria-expanded": open,
    "aria-haspopup": "dialog",
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      child.props.onClick?.(event);
      if (!event.defaultPrevented) setOpen(true);
    },
  });
}

export function MapPopoverContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { contentId, contentRef, open, setOpen } = useMapPopover();

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const firstInteractive = contentRef.current?.querySelector<HTMLElement>(
        "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
      );
      (firstInteractive ?? contentRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [contentRef, open]);

  if (!open) return null;

  return (
    <div
      {...props}
      id={contentId}
      ref={contentRef}
      role="dialog"
      tabIndex={-1}
      className={clsxm(
        "af-popover absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl p-0 outline-none",
        "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2",
        className,
      )}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          setOpen(false, true);
        }
      }}
    >
      {children}
    </div>
  );
}
