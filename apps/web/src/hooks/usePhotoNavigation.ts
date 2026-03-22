import { useCallback } from 'react'

interface UsePhotoNavigationProps {
  currentIndex: number
  totalPhotos: number
  onIndexChange: (index: number) => void
  swiperRef?: React.RefObject<any>
}

export const usePhotoNavigation = ({
  currentIndex,
  totalPhotos,
  onIndexChange,
  swiperRef,
}: UsePhotoNavigationProps) => {
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1)
      swiperRef?.current?.slidePrev()
    }
  }, [currentIndex, onIndexChange, swiperRef])

  const handleNext = useCallback(() => {
    if (currentIndex < totalPhotos - 1) {
      onIndexChange(currentIndex + 1)
      swiperRef?.current?.slideNext()
    }
  }, [currentIndex, totalPhotos, onIndexChange, swiperRef])

  const canGoPrevious = currentIndex > 0
  const canGoNext = currentIndex < totalPhotos - 1

  return {
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
  }
}
