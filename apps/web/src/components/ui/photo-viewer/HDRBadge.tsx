import { clsxm } from "@afilmory/ui";
import type { FC } from "react";

export const HDRBadge: FC = () => {
  return (
    <div
      className={clsxm(
        "af-glass absolute z-20 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-white",
        import.meta.env.DEV ? "top-24 right-4" : "top-20 lg:top-8 left-4",
      )}
    >
      <i className="i-mingcute-sun-line size-4" aria-hidden="true" />
      <span className="mr-1">HDR</span>
    </div>
  );
};

export default HDRBadge;
