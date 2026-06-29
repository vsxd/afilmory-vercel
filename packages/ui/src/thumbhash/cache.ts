import { decompressUint8Array } from "@afilmory/media";
import { thumbHashToDataURL } from "thumbhash";

const MAX_STRING_CACHE_ENTRIES = 512;

// 1x1 transparent PNG, used when a thumbHash is malformed/truncated so decoding
// never throws during render (which would crash the LazyImage subtree).
const FALLBACK_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const stringDataUrlCache = new Map<string, string>();
const objectDataUrlCache = new WeakMap<object, string>();

const safeThumbHashToDataUrl = (bytes: ArrayLike<number>): string => {
  try {
    return thumbHashToDataURL(bytes);
  } catch {
    return FALLBACK_DATA_URL;
  }
};

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

    let dataUrl: string;
    try {
      dataUrl = thumbHashToDataURL(decompressUint8Array(thumbHash));
    } catch {
      dataUrl = FALLBACK_DATA_URL;
    }
    return rememberStringDataUrl(thumbHash, dataUrl);
  }

  if (typeof thumbHash === "object" && thumbHash !== null) {
    const cachedDataUrl = objectDataUrlCache.get(thumbHash);
    if (cachedDataUrl) {
      return cachedDataUrl;
    }

    const dataUrl = safeThumbHashToDataUrl(thumbHash);
    objectDataUrlCache.set(thumbHash, dataUrl);
    return dataUrl;
  }

  return safeThumbHashToDataUrl(thumbHash);
};

export function resetThumbhashCache(): void {
  stringDataUrlCache.clear();
}
