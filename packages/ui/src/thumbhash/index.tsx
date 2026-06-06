import { memo } from "react";

import { clsxm } from "../utils/cn";
import { getThumbhashDataUrl } from "./cache";

export const Thumbhash = memo(function Thumbhash({
  thumbHash,
  className,
}: {
  thumbHash: ArrayLike<number> | string;
  className?: string;
}) {
  const dataURL = getThumbhashDataUrl(thumbHash);

  return (
    <img
      src={dataURL}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={clsxm("h-full w-full", className)}
    />
  );
});
