import { GlassButton } from '@afilmory/ui'
import { startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'

export const MapBackButton = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  const handleBack = () => {
    startTransition(() => {
      const fallbackSearchParams = new URLSearchParams(location.search)
      fallbackSearchParams.delete('photoId')
      fallbackSearchParams.delete('returnTo')

      navigate(
        {
          pathname: '/',
          search: fallbackSearchParams.toString() ? `?${fallbackSearchParams.toString()}` : '',
        },
        { replace: true },
      )
    })
  }

  return (
    <GlassButton className="absolute top-4 left-4 z-50" onClick={handleBack} title={t('explore.back.to.gallery')}>
      <i className="i-mingcute-arrow-left-line text-base text-white" />
    </GlassButton>
  )
}
