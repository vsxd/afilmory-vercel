export const isDebugLogEnabled =
  import.meta.env.DEV && import.meta.env.VITE_AFILMORY_DEBUG === "true";

export function debugLog(...args: unknown[]): void {
  if (!isDebugLogEnabled) {
    return;
  }

  // eslint-disable-next-line no-console -- centralize development-only logging in one place.
  console.info(...args);
}
