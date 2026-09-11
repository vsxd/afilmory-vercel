import "./Exif.css";

import type { FC } from "react";

export const ExifRow: FC<{
  label: string;
  value: string | number | null | undefined | number[];
}> = ({ label, value }) => {
  return (
    <dl className="af-exif-row">
      <dt className="af-exif-label">{label}</dt>
      <dd className="af-exif-value">
        {Array.isArray(value) ? value.join(" ") : value}
      </dd>
    </dl>
  );
};
