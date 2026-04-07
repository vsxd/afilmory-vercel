export function debugLog(...args: unknown[]): void {
  if (!import.meta.env.DEV) {
    return
  }

  // eslint-disable-next-line no-console -- centralize development-only logging in one place.
  console.info(...args)
}
