import { useTranslation } from 'react-i18next'

import { ExifFieldRow } from './ExifFieldRow'

interface ExifFieldGroupProps {
  title: string
  translationKey: string
  fields: Array<[string, string | number | boolean | null]>
}

export const ExifFieldGroup = ({ title, translationKey, fields }: ExifFieldGroupProps) => {
  const { t } = useTranslation()

  if (fields.length === 0) return null

  return (
    <div>
      <h4 className="mb-3 border-b border-white/25 pb-2 text-sm font-semibold text-white/90">
        {t(translationKey, { defaultValue: title })}
      </h4>
      <div className="space-y-2">
        {fields.map(([key, value]) => (
          <ExifFieldRow key={key} label={key} value={String(value)} />
        ))}
      </div>
    </div>
  )
}
