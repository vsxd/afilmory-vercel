type StartupMetricDetail = Record<string, unknown>

const marked = new Set<string>()

function getStartupReporter() {
  if (typeof window === 'undefined') return null
  return window.__AFILMORY_STARTUP__ ?? null
}

export function markStartup(name: string, detail?: StartupMetricDetail) {
  getStartupReporter()?.mark(name, detail)
}

export function markStartupOnce(name: string, detail?: StartupMetricDetail): boolean {
  if (marked.has(name)) return false
  marked.add(name)
  markStartup(name, detail)
  return true
}

export function flushStartupMetrics(reason: string) {
  return getStartupReporter()?.flush(reason)
}
