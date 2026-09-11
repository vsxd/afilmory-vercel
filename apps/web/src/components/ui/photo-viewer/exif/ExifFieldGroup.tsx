import { useTranslation } from "react-i18next";

import { ExifFieldRow } from "./ExifFieldRow";

interface ExifFieldGroupProps {
  title: string;
  translationKey: string;
  fields: Array<[string, string | number | boolean | null]>;
}

export const ExifFieldGroup = ({
  title,
  translationKey,
  fields,
}: ExifFieldGroupProps) => {
  const { t } = useTranslation();

  if (fields.length === 0) return null;

  return (
    <div>
      <h4 className="af-exif-section-title">
        {t(translationKey, { defaultValue: title })}
      </h4>
      <div>
        {fields.map(([key, value]) => (
          <ExifFieldRow key={key} label={key} value={String(value)} />
        ))}
      </div>
    </div>
  );
};
