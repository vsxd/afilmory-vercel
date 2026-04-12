import { ScrollArea, ScrollElementContext } from '@afilmory/ui'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'
import { siteConfig } from '~/config'
import { useMobile } from '~/hooks/useMobile'
import { getViewerPhotos, getViewerSourceMode, usePhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import { MasonryRoot } from '~/modules/gallery/MasonryRoot'
import { PhotosProvider } from '~/providers/photos-provider'

export const Component = () => {
  useStateRestoreFromUrl()
  useSyncStateToUrl()

  // const location = useLocation()
  const isMobile = useMobile()

  const photos = usePhotos()
  const mobileScrollElement = typeof document === 'undefined' ? null : document.body

  return (
    <>
      <PhotosProvider photos={photos}>
        {siteConfig.accentColor && (
          <style>{`
          :root:has(input.theme-controller[value=dark]:checked), [data-theme="dark"] {
            --color-primary: ${siteConfig.accentColor};
            --color-accent: ${siteConfig.accentColor};
            --color-secondary: ${siteConfig.accentColor};
          }
          `}</style>
        )}

        {isMobile ? (
          <ScrollElementContext value={mobileScrollElement}>
            <MasonryRoot />
          </ScrollElementContext>
        ) : (
          <ScrollArea rootClassName={'h-svh w-full'} viewportClassName="size-full">
            <MasonryRoot />
          </ScrollArea>
        )}

        <Outlet />
      </PhotosProvider>
    </>
  )
}

let isRestored = false
const useStateRestoreFromUrl = () => {
  const triggerOnceRef = useRef(false)

  const { openViewer } = usePhotoViewer()
  const { photoId } = useParams()
  const setGallerySetting = useSetAtom(gallerySettingAtom)

  const [searchParams] = useSearchParams()
  useEffect(() => {
    if (triggerOnceRef.current) return
    triggerOnceRef.current = true
    isRestored = true

    // 恢复筛选设置
    const tagsFromSearchParams = searchParams.get('tags')?.split(',')
    const camerasFromSearchParams = searchParams.get('cameras')?.split(',')
    const lensesFromSearchParams = searchParams.get('lenses')?.split(',')
    const ratingsFromSearchParams = searchParams.get('rating') ? Number(searchParams.get('rating')) : null
    const tagModeFromSearchParams = searchParams.get('tag_mode') as 'union' | 'intersection' | null

    if (
      tagsFromSearchParams ||
      camerasFromSearchParams ||
      lensesFromSearchParams ||
      ratingsFromSearchParams !== null ||
      tagModeFromSearchParams
    ) {
      setGallerySetting((prev) => ({
        ...prev,
        selectedTags: tagsFromSearchParams || prev.selectedTags,
        selectedCameras: camerasFromSearchParams || prev.selectedCameras,
        selectedLenses: lensesFromSearchParams || prev.selectedLenses,
        selectedRatings: ratingsFromSearchParams ?? prev.selectedRatings,
        tagFilterMode: tagModeFromSearchParams || prev.tagFilterMode,
      }))
    }

    // 如果 URL 中有 photoId，打开查看器
    // 找到对应的照片索引，确保 currentIndex 和 URL 保持一致
    if (photoId) {
      const photos = getViewerPhotos(photoId)
      const index = photos.findIndex((photo) => photo.id === photoId)
      if (index !== -1) {
        openViewer(index, { sourceMode: getViewerSourceMode(photoId) })
      }
    }
  }, [openViewer, photoId, searchParams, setGallerySetting])
}

const useSyncStateToUrl = () => {
  const wasOpenRef = useRef(false)
  const { selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode } =
    useAtomValue(gallerySettingAtom)
  const [_, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const location = useLocation()
  const { photoId } = useParams()
  const { isOpen, currentIndex } = usePhotoViewer()

  useEffect(() => {
    if (!isRestored) return

    const isExplorePath = location.pathname === '/explore'
    const isPhotoDetailPath = /^\/photos\/[^/]+$/.test(location.pathname)

    if (isOpen) {
      wasOpenRef.current = true
      const photos = getViewerPhotos(photoId)
      // 确保 currentIndex 在有效范围内，避免筛选条件变化时数组越界
      if (currentIndex >= 0 && currentIndex < photos.length) {
        const targetPathname = `/photos/${photos[currentIndex].id}`
        if (location.pathname !== targetPathname) {
          // 使用 replace 避免在浏览器历史中堆积过多记录
          navigate(targetPathname, { replace: true })
        }
      }
      return
    }

    const justClosedViewer = wasOpenRef.current
    wasOpenRef.current = false

    if (justClosedViewer && isPhotoDetailPath && !isExplorePath) {
      const timer = setTimeout(() => {
        navigate('/', { replace: true })
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [currentIndex, isOpen, location.pathname, navigate, photoId])

  useEffect(() => {
    if (!isRestored) return

    const tags = selectedTags.join(',')
    const cameras = selectedCameras.join(',')
    const lenses = selectedLenses.join(',')
    const rating = selectedRatings?.toString() ?? ''
    const tagMode = tagFilterMode === 'union' ? '' : tagFilterMode

    setSearchParams((search) => {
      const currentTags = search.get('tags')
      const currentCameras = search.get('cameras')
      const currentLenses = search.get('lenses')
      const currentRating = search.get('rating')
      const currentTagMode = search.get('tag_mode')

      // Check if anything has changed
      if (
        currentTags === tags &&
        currentCameras === cameras &&
        currentLenses === lenses &&
        currentRating === rating &&
        currentTagMode === tagMode
      ) {
        return search
      }

      const newer = new URLSearchParams(search)

      // Update tags
      if (tags) {
        newer.set('tags', tags)
      } else {
        newer.delete('tags')
      }

      // Update cameras
      if (cameras) {
        newer.set('cameras', cameras)
      } else {
        newer.delete('cameras')
      }

      // Update lenses
      if (lenses) {
        newer.set('lenses', lenses)
      } else {
        newer.delete('lenses')
      }

      // Update rating
      if (rating) {
        newer.set('rating', rating)
      } else {
        newer.delete('rating')
      }

      // Update tag filter mode
      if (tagMode) {
        newer.set('tag_mode', tagMode)
      } else {
        newer.delete('tag_mode')
      }

      return newer
    })
  }, [selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode, setSearchParams])
}
