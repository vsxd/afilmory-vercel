import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, m } from "motion/react";
import * as React from "react";

import { useControlledState } from "../hooks/useControlledState";
import { useRootPortal } from "../portal/provider";
import { clsxm } from "../utils/cn";
import { Spring } from "../utils/spring";

const DialogContext = React.createContext<{ open: boolean }>({ open: false });

const Dialog = ({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) => {
  const [open, setOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  });

  return (
    <DialogContext value={React.useMemo(() => ({ open }), [open])}>
      <DialogPrimitive.Root {...props} open={open} onOpenChange={setOpen}>
        {children}
      </DialogPrimitive.Root>
    </DialogContext>
  );
};

const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogPortal = ({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) => {
  const { open } = React.use(DialogContext);
  const to = useRootPortal();

  return (
    <DialogPrimitive.Portal container={to} forceMount {...props}>
      <AnimatePresence>{open && children}</AnimatePresence>
    </DialogPrimitive.Portal>
  );
};

const DialogOverlay = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
  ref?: React.RefObject<React.ElementRef<
    typeof DialogPrimitive.Overlay
  > | null>;
}) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={clsxm("fixed inset-0 z-100000000", className)}
    asChild
    {...props}
  >
    <m.div
      className="bg-black/50 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={Spring.presets.smooth}
    />
  </DialogPrimitive.Overlay>
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = ({
  ref,
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  ref?: React.RefObject<React.ElementRef<
    typeof DialogPrimitive.Content
  > | null>;
}) => (
  <DialogPortal>
    <DialogOverlay key="dialog-overlay" />
    <DialogPrimitive.Content
      key="dialog-content"
      ref={ref}
      className={clsxm(
        "fixed left-[50%] top-[50%] z-100000000 w-full max-w-lg",
        className,
      )}
      asChild
      {...props}
    >
      <m.div
        className="af-popover rounded-panel flex flex-col gap-4 overflow-hidden p-6"
        initial={{
          opacity: 0,
          scale: 0.95,
          y: 8,
          x: "-50%",
          translateY: "-50%",
        }}
        animate={{ opacity: 1, scale: 1, y: 0, x: "-50%", translateY: "-50%" }}
        exit={{ opacity: 0, scale: 0.95, y: 8, x: "-50%", translateY: "-50%" }}
        transition={Spring.presets.smooth}
      >
        {/* Content */}
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </m.div>
    </DialogPrimitive.Content>
  </DialogPortal>
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={clsxm(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={clsxm(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
  ref?: React.RefObject<React.ElementRef<typeof DialogPrimitive.Title> | null>;
}) => (
  <DialogPrimitive.Title
    ref={ref}
    className={clsxm(
      "text-ui text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = ({
  ref,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
  ref?: React.RefObject<React.ElementRef<
    typeof DialogPrimitive.Description
  > | null>;
}) => (
  <DialogPrimitive.Description
    ref={ref}
    className={clsxm("text-ui-secondary text-sm", className)}
    {...props}
  />
);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
