const PHOTO_PAGE_MODULE_KEY = './pages/(main)/photos/[photoId]/index.tsx'
const STARTUP_PREFETCH_DELAY_MS = 1500
const STARTUP_PREFETCH_IDLE_TIMEOUT_MS = 3000

type PhotoPagePrefetchModules = Record<string, (() => Promise<unknown>) | undefined>
type PhotoPagePrefetchOptions = {
  startupDelayMs?: number
  startupIdleTimeoutMs?: number
}
type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

export function isPhotoPageIntentTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  const href = target.closest('a[href]')?.getAttribute('href')
  return Boolean(href?.startsWith('/photos/'))
}

export function installPhotoPagePrefetch(
  prefetchModules: PhotoPagePrefetchModules,
  browserWindow: Window = window,
  options: PhotoPagePrefetchOptions = {},
): () => void {
  const loadPhotoPageModuleCandidate = prefetchModules[PHOTO_PAGE_MODULE_KEY]
  if (!loadPhotoPageModuleCandidate) {
    return () => {}
  }
  const loadPhotoPageModule: () => Promise<unknown> = loadPhotoPageModuleCandidate

  let isPrefetched = false
  let startupDelayId: number | undefined
  let idleCallbackId: number | undefined

  function clearStartupPrefetch(): void {
    if (startupDelayId !== undefined) {
      browserWindow.clearTimeout(startupDelayId)
      startupDelayId = undefined
    }

    if (idleCallbackId !== undefined) {
      ;(browserWindow as IdleWindow).cancelIdleCallback?.(idleCallbackId)
      idleCallbackId = undefined
    }
  }

  function cleanup(): void {
    clearStartupPrefetch()
    browserWindow.removeEventListener('pointerover', handleIntent, true)
    browserWindow.removeEventListener('pointerdown', handleIntent, true)
    browserWindow.removeEventListener('focusin', handleIntent, true)
  }

  function prefetchPhotoPage(): void {
    if (isPrefetched) {
      return
    }

    isPrefetched = true
    cleanup()
    void loadPhotoPageModule()
  }

  function scheduleStartupPrefetch(): void {
    const startupDelayMs = options.startupDelayMs ?? STARTUP_PREFETCH_DELAY_MS
    const startupIdleTimeoutMs = options.startupIdleTimeoutMs ?? STARTUP_PREFETCH_IDLE_TIMEOUT_MS

    startupDelayId = browserWindow.setTimeout(() => {
      startupDelayId = undefined
      const idleWindow = browserWindow as IdleWindow
      if (idleWindow.requestIdleCallback) {
        idleCallbackId = idleWindow.requestIdleCallback(
          () => {
            idleCallbackId = undefined
            prefetchPhotoPage()
          },
          { timeout: startupIdleTimeoutMs },
        )
        return
      }

      prefetchPhotoPage()
    }, startupDelayMs)
  }

  function handleIntent(event: Event): void {
    if (!isPhotoPageIntentTarget(event.target)) {
      return
    }

    prefetchPhotoPage()
  }

  browserWindow.addEventListener('pointerover', handleIntent, { capture: true, passive: true })
  browserWindow.addEventListener('pointerdown', handleIntent, { capture: true, passive: true })
  browserWindow.addEventListener('focusin', handleIntent, true)
  scheduleStartupPrefetch()

  return cleanup
}
