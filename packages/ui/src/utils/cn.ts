// Tremor Raw cx [v0.0.0]

import type { ClassValue } from "clsx";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export const clsxm = (...args: ClassValue[]) => {
  return twMerge(clsx(args));
};

// One outline boundary, shared with the app's native-control focus rule.
export const focusRing = [
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
];
