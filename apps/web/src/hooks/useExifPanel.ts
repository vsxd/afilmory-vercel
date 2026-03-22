import { useCallback, useState } from 'react'

export const useExifPanel = () => {
  const [showExifPanel, setShowExifPanel] = useState(false)

  const toggleExifPanel = useCallback(() => {
    setShowExifPanel((prev) => !prev)
  }, [])

  const closeExifPanel = useCallback(() => {
    setShowExifPanel(false)
  }, [])

  const openExifPanel = useCallback(() => {
    setShowExifPanel(true)
  }, [])

  return {
    showExifPanel,
    toggleExifPanel,
    closeExifPanel,
    openExifPanel,
  }
}
