import { createContext, use, useMemo } from "react";

import type { ModalComponent, ModalContentConfig, ModalItem } from "./types";

type ModalListener = () => void;

export class ModalManager {
  private items: ModalItem[] = [];
  private listeners = new Set<ModalListener>();
  private closeRegistry = new Map<string, () => void>();

  present<P = unknown>(
    Component: ModalComponent<P>,
    props?: P,
    modalContent?: ModalContentConfig,
  ): string {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.items = [
      ...this.items,
      { id, component: Component as ModalComponent<any>, props, modalContent },
    ];
    this.emit();
    return id;
  }

  dismiss(id: string): void {
    const closer = this.closeRegistry.get(id);
    if (closer) {
      closer();
      return;
    }
    this.remove(id);
  }

  getSnapshot = (): ModalItem[] => this.items;

  remove(id: string): void {
    const nextItems = this.items.filter((item) => item.id !== id);
    if (nextItems === this.items || nextItems.length === this.items.length) {
      return;
    }
    this.items = nextItems;
    this.emit();
  }

  registerCloser(id: string, fn: () => void): () => void {
    this.closeRegistry.set(id, fn);
    return () => this.closeRegistry.delete(id);
  }

  subscribe = (listener: ModalListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function createModalManager(): ModalManager {
  return new ModalManager();
}

export const ModalManagerContext = createContext<ModalManager | null>(null);

export function useModalManager(): ModalManager {
  const manager = use(ModalManagerContext);
  if (!manager) {
    throw new Error("ModalManager is not initialized. Render ModalProvider first.");
  }
  return manager;
}

export function useModal() {
  const manager = useModalManager();
  return useMemo(
    () => ({
      dismiss: manager.dismiss.bind(manager),
      present: manager.present.bind(manager),
    }),
    [manager],
  );
}

export { type ModalItem } from "./types";
