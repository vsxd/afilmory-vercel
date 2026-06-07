import { decompressUint8Array } from "@afilmory/media";
import { thumbHashToDataURL } from "thumbhash";

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

export const getThumbhashDataUrl = (thumbHash: ArrayLike<number> | string) => {
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

export function resetThumbhashCache(): void {
  stringDataUrlCache.clear();
}
