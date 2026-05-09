import { clsxm } from '@afilmory/ui'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { gallerySettingAtom } from '~/atoms/app'
import { siteConfig } from '~/config'
import { photoLoader } from '~/data-runtime/photo-loader'
import { useContextPhotos } from '~/hooks/usePhotoViewer'
import { convertExifGPSToDecimal } from '~/lib/map-utils'
import type { PhotoManifest } from '~/types/photo'

import { ActionGroup } from './ActionGroup'

const getPhotoCameraName = (photo: PhotoManifest) => {
  const make = photo.exif?.Make?.trim()
  const model = photo.exif?.Model?.trim()
  if (!make || !model) return null
  return `${make} ${model}`
}

const getPhotoLensName = (photo: PhotoManifest) => {
  const model = photo.exif?.LensModel?.trim()
  if (!model) return null
  const make = photo.exif?.LensMake?.trim()
  return make ? `${make} ${model}` : model
}

const getPhotoLocationKey = (photo: PhotoManifest) => {
  const gpsData = convertExifGPSToDecimal(photo.exif)
  if (!gpsData) return null

  return `${gpsData.latitude.toFixed(4)},${gpsData.longitude.toFixed(4)}`
}

const getGitHubUrl = (github: string | undefined) => {
  const value = github?.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('github.com/')) return `https://${value}`
  return `https://github.com/${value.replace(/^@/, '')}`
}

export const MasonryHeaderMasonryItem = ({ style, className }: { style?: React.CSSProperties; className?: string }) => {
  const { t } = useTranslation()
  const gallerySetting = useAtomValue(gallerySettingAtom)
  const visiblePhotos = useContextPhotos()
  const visiblePhotoCount = visiblePhotos.length
  const githubUrl = getGitHubUrl(siteConfig.social?.github)

  const hasFilters =
    gallerySetting.selectedTags.length > 0 ||
    gallerySetting.selectedCameras.length > 0 ||
    gallerySetting.selectedLenses.length > 0

  const libraryStats = useMemo(() => {
    const photos = photoLoader.getPhotos()
    const cameraSet = new Set<string>()
    const lensSet = new Set<string>()
    const locationSet = new Set<string>()

    for (const photo of photos) {
      const camera = getPhotoCameraName(photo)
      if (camera) cameraSet.add(camera)

      const lens = getPhotoLensName(photo)
      if (lens) lensSet.add(lens)

      const location = getPhotoLocationKey(photo)
      if (location) locationSet.add(location)
    }

    return [
      {
        id: 'photos',
        value: photos.length,
        label: t('gallery.library.stats.photos'),
      },
      {
        id: 'cameras',
        value: cameraSet.size,
        label: t('gallery.library.stats.cameras'),
      },
      {
        id: 'lenses',
        value: lensSet.size,
        label: t('gallery.library.stats.lenses'),
      },
      {
        id: 'locations',
        value: locationSet.size,
        label: t('gallery.library.stats.locations'),
      },
    ]
  }, [t])

  const filterChips = useMemo(
    () => [
      ...gallerySetting.selectedTags.map((tag) => ({
        id: `tag-${tag}`,
        label: tag,
      })),
      ...gallerySetting.selectedCameras.map((camera) => ({
        id: `camera-${camera}`,
        label: camera,
      })),
      ...gallerySetting.selectedLenses.map((lens) => ({
        id: `lens-${lens}`,
        label: lens,
      })),
      ...(gallerySetting.selectedTags.length > 1
        ? [
            {
              id: `tag-mode-${gallerySetting.tagFilterMode}`,
              label:
                gallerySetting.tagFilterMode === 'intersection' ? t('action.tag.match.all') : t('action.tag.match.any'),
            },
          ]
        : []),
    ],
    [
      gallerySetting.selectedCameras,
      gallerySetting.selectedLenses,
      gallerySetting.selectedTags,
      gallerySetting.tagFilterMode,
      t,
    ],
  )

  return (
    <div
      className={clsxm(
        'overflow-hidden border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900',
        className,
      )}
      style={style}
    >
      <div className="px-6 pt-8 pb-6 text-center">
        <div className="mb-4 flex justify-center">
          <div className="relative inline-flex">
            {siteConfig.author.avatar && (
              <AvatarPrimitive.Root className="inline-flex size-16 items-center justify-center overflow-hidden rounded-full">
                <AvatarPrimitive.Image
                  src={siteConfig.author.avatar}
                  className="size-full object-cover"
                  alt={siteConfig.author.name || siteConfig.name}
                />
                <AvatarPrimitive.Fallback className="size-full">
                  <div className="bg-material-medium size-full" />
                </AvatarPrimitive.Fallback>
              </AvatarPrimitive.Root>
            )}
            {!siteConfig.author.avatar && (
              <div className="from-accent to-accent/80 inline-flex size-16 items-center justify-center rounded-full bg-gradient-to-br shadow-sm">
                <i className="i-mingcute-camera-2-line text-2xl text-white" />
              </div>
            )}
          </div>
        </div>

        <h2 className="text-text mb-2 truncate text-xl leading-tight font-semibold">{siteConfig.name}</h2>

        {siteConfig.social && (
          <div className="flex items-center justify-center gap-2">
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-text-secondary hover:bg-fill-secondary hover:text-text inline-flex size-8 items-center justify-center rounded-full transition-colors"
                title="GitHub"
                aria-label="GitHub"
              >
                <i className="i-mingcute-github-fill text-base" />
              </a>
            )}
            {siteConfig.social.twitter && (
              <a
                href={`https://twitter.com/${siteConfig.social.twitter.replace('@', '')}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-text-secondary hover:bg-fill-secondary inline-flex size-8 items-center justify-center rounded-full transition-colors hover:text-[#1da1f2]"
                title="Twitter"
                aria-label="Twitter"
              >
                <i className="i-mingcute-twitter-fill text-base" />
              </a>
            )}
            {siteConfig.social.rss && (
              <a
                href="/feed.xml"
                target="_blank"
                rel="noreferrer noopener"
                className="text-text-secondary hover:bg-fill-secondary inline-flex size-8 items-center justify-center rounded-full transition-colors hover:text-[#ec672c]"
                title="RSS"
                aria-label="RSS"
              >
                <i className="i-mingcute-rss-2-fill text-base" />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="px-6 pb-6">
        <ActionGroup />
      </div>

      <div className="border-fill-secondary border-t px-6 pt-4 pb-5">
        {hasFilters ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-text-secondary text-xs font-medium">{t('gallery.library.filters.title')}</span>
              <span className="text-text text-xs font-medium tabular-nums">
                {t('gallery.library.filters.subtitle', { count: visiblePhotoCount })}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <span
                  key={chip.id}
                  className="bg-fill-secondary/50 text-text-secondary max-w-full min-w-0 truncate rounded-full px-2.5 py-1 text-[11px] leading-5"
                  title={chip.label}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-fill-secondary grid grid-cols-4 divide-x text-center">
            {libraryStats.map((stat) => (
              <div key={stat.id} className="min-w-0 px-2.5 first:pl-0 last:pr-0">
                <span className="text-text block text-base leading-none font-semibold tabular-nums">{stat.value}</span>
                <span className="text-text-tertiary mt-1.5 block truncate text-[10px] leading-none font-medium">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
