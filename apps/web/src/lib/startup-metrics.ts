import type { StartupMetricDetail } from "~/runtime/browser-runtime";
import { getExistingBrowserRuntime } from "~/runtime/browser-runtime";

function getStartupReporter() {
  return getExistingBrowserRuntime()?.startup ?? null;
}

export function markStartup(name: string, detail?: StartupMetricDetail) {
  getStartupReporter()?.mark(name, detail);
}

export function markStartupOnce(
  name: string,
  detail?: StartupMetricDetail,
): boolean {
  const reporter = getStartupReporter();
  if (reporter) {
    const markedNames = (reporter.markedNames ??= []);
    if (markedNames.includes(name)) return false;
    markedNames.push(name);
  }
  markStartup(name, detail);
  return true;
}

export function flushStartupMetrics(reason: string) {
  return getStartupReporter()?.flush(reason);
}
