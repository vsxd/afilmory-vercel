import type { ComponentPropsWithoutRef } from "react";

import { clsxm } from "../utils/cn";

export const LinearDivider = ({
  className,
}: Pick<ComponentPropsWithoutRef<"div">, "className">) => {
  return (
    <div
      className={clsxm(
        "via-text/20 h-[0.5px] bg-linear-to-r from-transparent to-transparent",
        className,
      )}
    />
  );
};
