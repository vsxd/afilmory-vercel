import { atom, useAtom, useAtomValue } from 'jotai'
import { use, useCallback, useEffect, useMemo } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { photoLoader } from '~/data-runtime/photo-loader'
import { jotaiStore } from '~/lib/jotai'
import { getPhotoDateString } from '~/lib/photo-date'
import { PhotosContext } from '~/providers/photos-provider'

const openAtom = atom(false)
const currentIndexAtom = atom(0)
const triggerElementAtom = atom<HTMLElement | null>(null)
const viewerSourceModeAtom = atom<ViewerSourceMode | null>(null)
let bodyScrollLockCount = 0
let bodyOverflowBeforeLock: string | null = null

type ViewerSourceMode = 'filtered' | 'all'

const getAllPhotos = () => photoLoader.getPhotos()
const sortPhotos = (photos: ReturnType<typeof getAllPhotos>, sortOrder: 'asc' | 'desc') => {
  return photos.toSorted((a, b) => {
    const aDateStr = getPhotoDateString(a)
    const bDateStr = getPhotoDateString(b)

    return sortOrder === 'asc' ? aDateStr.localeCompare(bDateStr) : bDateStr.localeCompare(aDateStr)
  })
}

// 抽取照片筛选和排序逻辑为独立函数
const filterAndSortPhotos = (
  selectedTags: string[],
  selectedCameras: string[],
  selectedLenses: string[],
  selectedRatings: number | null,
  sortOrder: 'asc' | 'desc',
  tagFilterMode: 'union' | 'intersection' = 'union',
) => {
  // 每次都动态获取最新的照片数据，而不是使用模块级别的缓存
  // 这样可以确保在静态部署时，即使模块加载时 manifest 还未完全初始化，
  // 后续调用时也能获取到正确的数据
  const data = photoLoader.getPhotos()

  // 根据 tags、cameras、lenses 和 ratings 筛选
  let filteredPhotos = data

  // Tags 筛选：根据模式进行并集或交集筛选
  if (selectedTags.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (tagFilterMode === 'intersection') {
        // 交集模式：照片必须包含所有选中的标签
        return selectedTags.every((tag) => photo.tags.includes(tag))
      } else {
        // 并集模式：照片必须包含至少一个选中的标签
        return selectedTags.some((tag) => photo.tags.includes(tag))
      }
    })
  }

  // Cameras 筛选：照片的相机必须匹配选中的相机之一
  if (selectedCameras.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.Make || !photo.exif?.Model) return false
      const cameraDisplayName = `${photo.exif.Make.trim()} ${photo.exif.Model.trim()}`
      return selectedCameras.includes(cameraDisplayName)
    })
  }

  // Lenses 筛选：照片的镜头必须匹配选中的镜头之一
  if (selectedLenses.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.LensModel) return false
      const lensModel = photo.exif.LensModel.trim()
      const lensMake = photo.exif.LensMake?.trim()
      const lensDisplayName = lensMake ? `${lensMake} ${lensModel}` : lensModel
      return selectedLenses.includes(lensDisplayName)
    })
  }

  // Ratings 筛选：照片的评分必须大于等于选中的最小阈值
  if (selectedRatings !== null) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.Rating) return false
      return photo.exif.Rating >= selectedRatings
    })
  }

  // 然后排序
  const sortedPhotos = sortPhotos(filteredPhotos, sortOrder)

  return sortedPhotos
}

const getAllPhotosForViewer = (sortOrder: 'asc' | 'desc') => {
  return sortPhotos(getAllPhotos(), sortOrder)
}

const resolveViewerSourceMode = (
  photoId: string | null | undefined,
  filteredPhotos: ReturnType<typeof getFilteredPhotos>,
): ViewerSourceMode => {
  if (!photoId) {
    return 'filtered'
  }

  return filteredPhotos.some((photo) => photo.id === photoId) ? 'filtered' : 'all'
}

const resolveViewerPhotos = (
  photoId: string | null | undefined,
  filteredPhotos: ReturnType<typeof getFilteredPhotos>,
  sortOrder: 'asc' | 'desc',
  viewerSourceMode?: ViewerSourceMode | null,
) => {
  const sourceMode =
    viewerSourceMode === 'filtered' && photoId && !filteredPhotos.some((photo) => photo.id === photoId)
      ? 'all'
      : (viewerSourceMode ?? resolveViewerSourceMode(photoId, filteredPhotos))

  return sourceMode === 'all' ? getAllPhotosForViewer(sortOrder) : filteredPhotos
}

// 提供一个 getter 函数供非 UI 组件使用
export const getFilteredPhotos = () => {
  // 直接从 jotaiStore 中读取当前状态
  const currentGallerySetting = jotaiStore.get(gallerySettingAtom)
  return filterAndSortPhotos(
    currentGallerySetting.selectedTags,
    currentGallerySetting.selectedCameras,
    currentGallerySetting.selectedLenses,
    currentGallerySetting.selectedRatings,
    currentGallerySetting.sortOrder,
    currentGallerySetting.tagFilterMode,
  )
}

export const getViewerPhotos = (photoId?: string | null) => {
  const { sortOrder } = jotaiStore.get(gallerySettingAtom)
  const filteredPhotos = getFilteredPhotos()
  const viewerSourceMode = jotaiStore.get(openAtom) ? jotaiStore.get(viewerSourceModeAtom) : null

  return resolveViewerPhotos(photoId, filteredPhotos, sortOrder, viewerSourceMode)
}

export const getViewerSourceMode = (photoId?: string | null) => {
  return resolveViewerSourceMode(photoId, getFilteredPhotos())
}

export const usePhotos = () => {
  const { sortOrder, selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode } =
    useAtomValue(gallerySettingAtom)

  const masonryItems = useMemo(() => {
    return filterAndSortPhotos(selectedTags, selectedCameras, selectedLenses, selectedRatings, sortOrder, tagFilterMode)
  }, [sortOrder, selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode])

  return masonryItems
}

export const useViewerPhotos = (photoId?: string | null) => {
  const { sortOrder } = useAtomValue(gallerySettingAtom)
  const isOpen = useAtomValue(openAtom)
  const viewerSourceMode = useAtomValue(viewerSourceModeAtom)
  const filteredPhotos = usePhotos()

  return useMemo(
    () => resolveViewerPhotos(photoId, filteredPhotos, sortOrder, isOpen ? viewerSourceMode : null),
    [filteredPhotos, isOpen, photoId, sortOrder, viewerSourceMode],
  )
}

export const useContextPhotos = () => {
  const photos = use(PhotosContext)
  if (!photos) {
    throw new Error('PhotosContext is not initialized')
  }
  return photos
}

export const usePhotoViewer = (photoCount?: number) => {
  const [isOpen, setIsOpen] = useAtom(openAtom)
  const [currentIndex, setCurrentIndex] = useAtom(currentIndexAtom)
  const [triggerElement, setTriggerElement] = useAtom(triggerElementAtom)
  const [viewerSourceMode, setViewerSourceMode] = useAtom(viewerSourceModeAtom)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (bodyScrollLockCount === 0) {
      bodyOverflowBeforeLock = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    bodyScrollLockCount += 1

    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = bodyOverflowBeforeLock ?? ''
        bodyOverflowBeforeLock = null
      }
    }
  }, [isOpen])

  const openViewer = useCallback(
    (index: number, options?: { element?: HTMLElement | null; sourceMode?: ViewerSourceMode }) => {
      setCurrentIndex(index)
      setTriggerElement(options?.element || null)
      setViewerSourceMode(options?.sourceMode ?? null)
      setIsOpen(true)
    },
    [setCurrentIndex, setIsOpen, setTriggerElement, setViewerSourceMode],
  )

  const closeViewer = useCallback(() => {
    setIsOpen(false)
    setTriggerElement(null)
    setViewerSourceMode(null)
  }, [setIsOpen, setTriggerElement, setViewerSourceMode])

  const goToIndex = useCallback(
    (index: number) => {
      const maxPhotoCount =
        photoCount ?? (viewerSourceMode === 'all' ? getAllPhotos().length : getFilteredPhotos().length)
      if (index >= 0 && index < maxPhotoCount) {
        setCurrentIndex(index)
      }
    },
    [photoCount, setCurrentIndex, viewerSourceMode],
  )

  return {
    isOpen,
    currentIndex,
    triggerElement,
    viewerSourceMode,
    openViewer,
    closeViewer,

    goToIndex,
  }
}
