import type { FC } from "react";

export const HDRBadge: FC = () => {
  return (
    <div className="af-glass flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs">
      <i className="i-mingcute-sun-line size-4" aria-hidden="true" />
      <span className="mr-1">HDR</span>
    </div>
  );
};

export default HDRBadge;
