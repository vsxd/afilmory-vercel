import { createContext, use } from 'react'

import { siteConfig } from '~/config'
import type { BaseMapProps } from '~/types/map'

/**
 * Defines the interface for a map adapter.
 * This allows for different map providers to be used interchangeably.
 */
export interface MapAdapter {
  name: string
  isAvailable: boolean
  initialize: () => Promise<void>
  cleanup?: () => void

  MapComponent: React.FC<BaseMapProps>
}

interface MapContextType {
  adapter: MapAdapter | null
}

export const MapContext = createContext<MapContextType | null>(null)

export const useMapAdapter = () => {
  const context = use(MapContext)
  if (!context) {
    throw new Error('useMapAdapter must be used within a MapProvider')
  }
  return context.adapter
}

export const getMapConfig = () => siteConfig.map
