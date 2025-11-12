import { RootPortal, RootPortalProvider } from '@afilmory/ui'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { RemoveScroll } from 'react-remove-scroll'
import { useParams } from 'react-router'

import { NotFound } from '~/components/common/NotFound'
import { PhotoViewer } from '~/components/ui/photo-viewer'
import { useContextPhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import { useTitle } from '~/hooks/useTitle'
import { deriveAccentFromSources } from '~/lib/color'

export const Component = () => {
  const { photoId } = useParams()
  const photoViewer = usePhotoViewer()
  const photos = useContextPhotos()

  // 直接根据 photoId 从 Context 的照片列表中查找照片和索引
  const photoIndex = useMemo(() => {
    if (!photoId) {
      console.warn('[PhotoDetail] photoId is missing from URL params')
      return -1
    }
    if (!photos || photos.length === 0) {
      console.warn('[PhotoDetail] Photos array is empty or not loaded yet', {
        photosLength: photos?.length || 0,
        photoId,
        hasManifest: typeof window !== 'undefined' && (window as any).__MANIFEST__ !== undefined,
      })
      return -1
    }
    const index = photos.findIndex((photo) => photo?.id === photoId)
    console.info('[PhotoDetail] 查找照片:', {
      photoId,
      photosLength: photos.length,
      foundIndex: index,
      firstFewIds: photos.slice(0, 3).map((p) => p?.id),
    })
    return index
  }, [photos, photoId])

  const currentPhoto = useMemo(() => {
    const photo = photoIndex !== -1 && photos[photoIndex] ? photos[photoIndex] : null
    console.info('[PhotoDetail] 当前照片:', {
      photoIndex,
      hasPhoto: !!photo,
      photoId: photo?.id,
      requestedPhotoId: photoId,
    })
    return photo
  }, [photos, photoIndex, photoId])

  const [ref, setRef] = useState<HTMLElement | null>(null)
  const rootPortalValue = useMemo(
    () => ({
      to: ref as HTMLElement,
    }),
    [ref],
  )
  useTitle(currentPhoto?.title || 'Not Found')

  const [accentColor, setAccentColor] = useState<string | null>(null)

  useEffect(() => {
    if (!currentPhoto) return

    let isCancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    ;(async () => {
      try {
        const color = await deriveAccentFromSources({
          thumbHash: currentPhoto.thumbHash,
          thumbnailUrl: currentPhoto.thumbnailUrl,
        })
        if (!isCancelled) {
          const $css = document.createElement('style')
          $css.textContent = `
         * {
             transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out;
            }
          `
          document.head.append($css)

          timeoutId = setTimeout(() => {
            $css.remove()
          }, 100)

          setAccentColor(color ?? null)
        }
      } catch {
        if (!isCancelled) setAccentColor(null)
      }
    })()

    return () => {
      isCancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [currentPhoto])

  // 同步 photoViewer 的 currentIndex 和实际的 photoIndex
  // 当 URL 中的 photoId 对应的索引和 photoViewer.currentIndex 不一致时，更新它
  useEffect(() => {
    if (photoIndex !== -1 && photoViewer.currentIndex !== photoIndex) {
      console.info('[PhotoDetail] 同步索引:', { currentIndex: photoViewer.currentIndex, photoIndex })
      photoViewer.goToIndex(photoIndex)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIndex, photoViewer.currentIndex, photoViewer.goToIndex])

  // 如果照片不存在，显示 NotFound
  if (!currentPhoto || photoIndex === -1) {
    // 添加详细的调试信息
    if (typeof window !== 'undefined') {
      console.error('[PhotoDetail] Photo not found:', {
        requestedPhotoId: photoId,
        photosLength: photos?.length || 0,
        hasManifest: (window as any).__MANIFEST__ !== undefined,
        manifestData: (window as any).__MANIFEST__ !== undefined ? (window as any).__MANIFEST__ : null,
        photoIds: photos?.slice(0, 10).map((p) => p?.id) || [],
      })
    }
    return <NotFound />
  }

  return (
    <RootPortal>
      <RootPortalProvider value={rootPortalValue}>
        <RemoveScroll
          style={
            {
              ...(accentColor ? { '--color-accent': accentColor } : {}),
            } as React.CSSProperties
          }
          ref={setRef}
          className={clsx(photoViewer.isOpen ? 'fixed inset-0 z-9999' : 'pointer-events-none fixed inset-0 z-40')}
        >
          <PhotoViewer
            photos={photos}
            currentIndex={photoIndex}
            isOpen={photoViewer.isOpen}
            triggerElement={photoViewer.triggerElement}
            onClose={photoViewer.closeViewer}
            onIndexChange={photoViewer.goToIndex}
          />
        </RemoveScroll>
      </RootPortalProvider>
    </RootPortal>
  )
}
