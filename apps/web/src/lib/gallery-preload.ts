/** Warm common destinations after the gallery commits and initial resources load.
 * Imports only prepare code; mounting viewers/maps remains a user action.
 */
export function scheduleGalleryPreload(preload: () => Promise<unknown>) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;

  const ready = () =>
    document.readyState === "complete" &&
    document.visibilityState !== "hidden" &&
    navigator.onLine !== false;

  const cleanup = () => {
    stopped = true;
    clearTimeout(timer);
    if (idle !== undefined && typeof cancelIdleCallback === "function")
      cancelIdleCallback(idle);
    window.removeEventListener("load", schedule);
    window.removeEventListener("online", schedule);
    document.removeEventListener("visibilitychange", schedule);
  };

  const run = () => {
    idle = undefined;
    if (stopped || !ready()) return;
    cleanup();
    // A speculative failure must not break the current gallery. Navigation
    // retains its normal error/reload path if that resource is still unavailable.
    void Promise.resolve()
      .then(preload)
      .catch(() => {});
  };

  function schedule() {
    if (stopped || timer !== undefined || idle !== undefined || !ready())
      return;
    // Let the committed gallery paint, even on browsers without idle callbacks.
    timer = setTimeout(() => {
      timer = undefined;
      if (stopped || !ready()) return;
      if (typeof requestIdleCallback === "function") {
        idle = requestIdleCallback(run, { timeout: 2_000 });
      } else {
        run();
      }
    }, 300);
  }

  window.addEventListener("load", schedule);
  window.addEventListener("online", schedule);
  document.addEventListener("visibilitychange", schedule);
  schedule();
  return cleanup;
}
