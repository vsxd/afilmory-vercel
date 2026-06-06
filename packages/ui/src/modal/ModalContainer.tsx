import { AnimatePresence } from "motion/react";
import type { PropsWithChildren } from "react";
import {
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useEventCallback } from "usehooks-ts";

import { clsxm } from "../utils/cn";
import { Spring } from "../utils/spring";
import { Dialog, DialogContent } from "./Dialog";
import type { ModalItem, ModalManager } from "./ModalManager";
import { createModalManager, ModalManagerContext } from "./ModalManager";
import type { ModalComponent } from "./types";

export function ModalProvider({ children }: PropsWithChildren) {
  const manager = useMemo(() => createModalManager(), []);

  return (
    <ModalManagerContext value={manager}>
      {children}
      <ModalContainer manager={manager} />
    </ModalManagerContext>
  );
}

export function ModalContainer({ manager }: { manager?: ModalManager }) {
  const contextManager = use(ModalManagerContext);
  const modalManager = manager ?? contextManager;
  if (!modalManager) {
    throw new Error("ModalManager is not initialized. Render ModalProvider first.");
  }
  const items = useSyncExternalStore(
    modalManager.subscribe,
    modalManager.getSnapshot,
    modalManager.getSnapshot,
  );

  return (
    <div id="modal-container">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <ModalWrapper key={item.id} item={item} manager={modalManager} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ModalWrapper({
  item,
  manager,
}: {
  item: ModalItem;
  manager: ModalManager;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    return manager.registerCloser(item.id, () => setOpen(false));
  }, [item.id, manager]);

  const dismiss = useMemo(
    () => () => {
      setOpen(false);
    },
    [],
  );

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
  };

  // After exit animation, remove from store
  const handleAnimationComplete = useEventCallback(() => {
    if (!open) {
      manager.remove(item.id);
    }
  });

  const Component = item.component as ModalComponent<any>;

  const { contentProps, contentClassName } = Component;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={clsxm("w-full max-w-md", contentClassName)}
        transition={Spring.presets.smooth}
        onAnimationComplete={handleAnimationComplete}
        {...contentProps}
        {...item.modalContent}
      >
        <Component
          modalId={item.id}
          dismiss={dismiss}
          {...(item.props as any)}
        />
      </DialogContent>
    </Dialog>
  );
}
