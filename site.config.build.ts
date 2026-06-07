/**
 * 🛠 BUILD-TIME CONFIGURATION
 *
 * This file is used ONLY during the build process (Vite config, plugins).
 * It is responsible for injecting environment variables into the site configuration.
 *
 * - Imports 'env.ts' to access process.env safely.
 * - Merges defaults from 'site.config.ts' with environment overrides.
 * - The result is injected into the client via 'window.__AFILMORY__.config'.
 */

import { env } from "./env";
import type { SiteConfig } from "./site.config";
import { siteConfig as baseSiteConfig } from "./site.config";

const envConfig: Partial<SiteConfig> = {
  name: env.SITE_NAME || baseSiteConfig.name,
  title: env.SITE_TITLE || baseSiteConfig.title,
  description: env.SITE_DESCRIPTION || baseSiteConfig.description,
  url: env.SITE_URL || baseSiteConfig.url,
  accentColor: env.SITE_ACCENT_COLOR || baseSiteConfig.accentColor,
  language: env.SITE_LANGUAGE || baseSiteConfig.language,
  author: {
    name: env.AUTHOR_NAME || baseSiteConfig.author.name,
    url: env.AUTHOR_URL || baseSiteConfig.author.url,
    avatar: env.AUTHOR_AVATAR || baseSiteConfig.author.avatar,
  },
  social: {
    github: env.SOCIAL_GITHUB || baseSiteConfig.social?.github,
    twitter: env.SOCIAL_TWITTER || baseSiteConfig.social?.twitter,
    rss: env.SOCIAL_RSS
      ? env.SOCIAL_RSS === "true"
      : baseSiteConfig.social?.rss,
  },
  feed: {
    folo: {
      challenge: {
        feedId:
          env.FEED_FOLO_FEED_ID ||
          baseSiteConfig.feed?.folo?.challenge?.feedId ||
          "",
        userId:
          env.FEED_FOLO_USER_ID ||
          baseSiteConfig.feed?.folo?.challenge?.userId ||
          "",
      },
    },
  },
  mapStyle: env.MAP_STYLE || baseSiteConfig.mapStyle,
  mapProjection: env.MAP_PROJECTION || baseSiteConfig.mapProjection,
};

function mergeSiteConfig(
  base: SiteConfig,
  overrides: Partial<SiteConfig>,
): SiteConfig {
  return {
    ...base,
    ...overrides,
    author: {
      ...base.author,
      ...overrides.author,
    },
    social: {
      ...base.social,
      ...overrides.social,
    },
    feed: {
      ...base.feed,
      ...overrides.feed,
      folo: {
        ...base.feed?.folo,
        ...overrides.feed?.folo,
        challenge: {
          ...base.feed?.folo?.challenge,
          ...overrides.feed?.folo?.challenge,
        },
      },
    },
  };
}

export const siteConfig: SiteConfig = mergeSiteConfig(
  baseSiteConfig,
  envConfig,
);

export default siteConfig;
