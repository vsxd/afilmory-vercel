import type { DeepReadonly } from "~/types/readonly";

/** Freeze owned JSON nodes. Already published subtrees can be shared as-is. */
export function freezeSnapshot<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeSnapshot(child);
  }
  return value;
}

/** Detach untrusted mutable inputs once, at the repository boundary, never on query. */
export function ownSnapshot<T>(value: T): DeepReadonly<T> {
  return freezeSnapshot(structuredClone(value)) as DeepReadonly<T>;
}
