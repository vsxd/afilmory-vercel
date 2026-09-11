import type { HTMLMotionProps } from "motion/react";
import { m, useReducedMotion } from "motion/react";
import type { FC, PropsWithChildren } from "react";

import { clsxm } from "../utils/cn";

export const GlassButton: FC<HTMLMotionProps<"button"> & PropsWithChildren> = (
  props,
) => {
  const reduceMotion = useReducedMotion();

  return (
    <m.button
      type="button"
      {...props}
      className={clsxm(
        "af-glass pointer-events-auto relative flex size-11 items-center justify-center rounded-full text-lg transition-colors hover:bg-white/15 disabled:opacity-45",
        props.className,
      )}
      whileHover={reduceMotion ? undefined : { scale: 1.04 }}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.16 }}
    >
      <span className="center relative flex">{props.children}</span>
    </m.button>
  );
};
