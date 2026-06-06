import { decompressUint8Array } from "@afilmory/data";
import { memo } from "react";
import { thumbHashToDataURL } from "thumbhash";

import { clsxm } from "../utils/cn";

const MAX_STRING_CACHE_ENTRIES = 512;

const stringDataUrlCache = new Map<string, string>();
const objectDataUrlCache = new WeakMap<object, string>();

const rememberStringDataUrl = (thumbHash: string, dataUrl: string) => {
  if (stringDataUrlCache.size >= MAX_STRING_CACHE_ENTRIES) {
    const oldestKey = stringDataUrlCache.keys().next().value;
    if (oldestKey !== undefined) {
      stringDataUrlCache.delete(oldestKey);
    }
  }

  stringDataUrlCache.set(thumbHash, dataUrl);
  return dataUrl;
};

const getThumbhashDataUrl = (thumbHash: ArrayLike<number> | string) => {
  if (typeof thumbHash === "string") {
    const cachedDataUrl = stringDataUrlCache.get(thumbHash);
    if (cachedDataUrl) {
      return cachedDataUrl;
    }

    return rememberStringDataUrl(
      thumbHash,
      thumbHashToDataURL(decompressUint8Array(thumbHash)),
    );
  }

  if (typeof thumbHash === "object" && thumbHash !== null) {
    const cachedDataUrl = objectDataUrlCache.get(thumbHash);
    if (cachedDataUrl) {
      return cachedDataUrl;
    }

    const dataUrl = thumbHashToDataURL(thumbHash);
    objectDataUrlCache.set(thumbHash, dataUrl);
    return dataUrl;
  }

  return thumbHashToDataURL(thumbHash);
};

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
