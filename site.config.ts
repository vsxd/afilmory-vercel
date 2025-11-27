/**
 * ⚠️ CLIENT-SIDE CONFIGURATION - READ CAREFULLY ⚠️
 *
 * This file is imported by the client-side code (browser).
 * It MUST NOT import 'env.ts' or use 'process.env' directly.
 *
 * - This file defines the static default configuration.
 * - Environment variable overrides are handled in 'site.config.build.ts'.
 * - Client-side code accesses the final config via 'window.__SITE_CONFIG__' injection.
 */

export interface SiteConfig {
  name: string
  title: string
  description: string
  url: string
  accentColor: string
  author: Author
  social?: Social
  feed?: Feed
  map?: MapConfig
  mapStyle?: string
  mapProjection?: 'globe' | 'mercator'
}

/**
 * Map configuration - can be either:
 * - A string for a single provider: 'maplibre'
 * - An array for multiple providers in priority order: ['maplibre']
 */
type MapConfig = 'maplibre'[]

interface Feed {
  folo?: {
    challenge?: {
      feedId: string
      userId: string
    }
  }
}
interface Author {
  name: string
  url: string
  avatar?: string
}
interface Social {
  twitter?: string
  github?: string
  rss?: boolean
}

export const siteConfig: SiteConfig = {
  name: 'Afilmory Vercel',
  title: 'Afilmory Vercel',
  description: 'A personal photography website',
  url: 'https://afilmory.your.domain/',
  accentColor: '#007bff',
  author: {
    name: 'Author',
    url: 'https://your.domain',
    avatar: 'https://github.com/vsxd/afilmory-vercel/blob/main/logo.png',
  },
  social: {
    github: '',
    twitter: '',
    rss: false,
  },
  feed: {
    folo: {
      challenge: {
        feedId: '',
        userId: '',
      },
    },
  },
  map: ['maplibre'],
  mapStyle: 'builtin',
  mapProjection: 'mercator',
}

export default siteConfig
