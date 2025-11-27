/**
 * 🛠 BUILD-TIME CONFIGURATION
 *
 * This file is used ONLY during the build process (Vite config, plugins).
 * It is responsible for injecting environment variables into the site configuration.
 *
 * - Imports 'env.ts' to access process.env safely.
 * - Merges defaults from 'site.config.ts' with environment overrides.
 * - The result is injected into the client via 'window.__SITE_CONFIG__'.
 */

import { merge } from 'es-toolkit/compat'

import { env } from './env'
import type { SiteConfig } from './site.config'
import { siteConfig as baseSiteConfig } from './site.config'

const envConfig: Partial<SiteConfig> = {
  name: env.SITE_NAME,
  title: env.SITE_TITLE,
  description: env.SITE_DESCRIPTION,
  url: env.SITE_URL,
  accentColor: env.SITE_ACCENT_COLOR,
  author: {
    name: env.AUTHOR_NAME || baseSiteConfig.author.name,
    url: env.AUTHOR_URL || baseSiteConfig.author.url,
    avatar: env.AUTHOR_AVATAR || baseSiteConfig.author.avatar,
  },
  social: {
    github: env.SOCIAL_GITHUB || baseSiteConfig.social?.github,
    twitter: env.SOCIAL_TWITTER || baseSiteConfig.social?.twitter,
    rss: env.SOCIAL_RSS ? env.SOCIAL_RSS === 'true' : baseSiteConfig.social?.rss,
  },
  feed: {
    folo: {
      challenge: {
        feedId: env.FEED_FOLO_FEED_ID || baseSiteConfig.feed?.folo?.challenge?.feedId || '',
        userId: env.FEED_FOLO_USER_ID || baseSiteConfig.feed?.folo?.challenge?.userId || '',
      },
    },
  },
  mapStyle: env.MAP_STYLE,
  mapProjection: env.MAP_PROJECTION,
}

export const siteConfig: SiteConfig = merge(baseSiteConfig, envConfig) as any

export default siteConfig
