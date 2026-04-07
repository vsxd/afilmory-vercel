import { useMemo } from 'react'

import { siteConfig } from '~/config'
import { debugLog } from '~/lib/debug-log'

import { MapContext } from './map-context'
import { createMapLibreAdapter } from './MapLibreAdapter'

const maplibreAdapter = createMapLibreAdapter()

const ADAPTERS = [
  {
    name: 'maplibre',
    adapter: maplibreAdapter,
    component: maplibreAdapter.MapComponent,
  },
]

/**
 * Get the preferred map adapter based on configuration
 */
const getPreferredAdapter = () => {
  const mapConfig = siteConfig.map

  // If no map configuration is provided, use the first available adapter
  if (!mapConfig) {
    const adapter = ADAPTERS.find((a) => a.adapter.isAvailable) || null
    if (adapter) debugLog(`Map: Selected default adapter: ${adapter.name}`)
    return adapter
  }

  // If mapConfig is a string (single provider)
  if (typeof mapConfig === 'string') {
    const adapter = ADAPTERS.find((a) => a.name === mapConfig && a.adapter.isAvailable)
    if (adapter) {
      debugLog(`Map: Selected specified adapter: ${adapter.name}`)
      return adapter
    }
    // If specified provider is not available, fall back to first available
    const fallbackAdapter = ADAPTERS.find((a) => a.adapter.isAvailable) || null
    if (fallbackAdapter) {
      debugLog(`Map: Specified adapter '${mapConfig}' not available, using fallback: ${fallbackAdapter.name}`)
    }
    return fallbackAdapter
  }

  // If mapConfig is an array (priority list)
  if (Array.isArray(mapConfig)) {
    for (const providerName of mapConfig) {
      const adapter = ADAPTERS.find((a) => a.name === providerName && a.adapter.isAvailable)
      if (adapter) {
        debugLog(`Map: Selected adapter from priority list: ${adapter.name}`)
        return adapter
      }
    }
    // If none of the priority providers are available, use first available
    const fallbackAdapter = ADAPTERS.find((a) => a.adapter.isAvailable) || null
    if (fallbackAdapter) {
      debugLog(`Map: None of the priority providers available, using fallback: ${fallbackAdapter.name}`)
    }
    return fallbackAdapter
  }

  // Default to first available adapter
  const adapter = ADAPTERS.find((a) => a.adapter.isAvailable) || null
  if (adapter) {
    debugLog(`Map: Selected default adapter: ${adapter.name}`)
  } else {
    console.warn('Map: No adapters are available')
  }
  return adapter
}

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const adapter = useMemo(() => {
    const preferredAdapter = getPreferredAdapter()
    if (preferredAdapter) {
      return {
        ...preferredAdapter.adapter,
        MapComponent: preferredAdapter.component,
      }
    }
    return null
  }, [])

  const value = useMemo(() => ({ adapter }), [adapter])

  return <MapContext value={value}>{children}</MapContext>
}
