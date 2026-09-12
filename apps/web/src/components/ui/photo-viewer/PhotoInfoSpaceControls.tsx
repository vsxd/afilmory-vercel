import { useTranslation } from "react-i18next";

import type { PhotoInfoSpace } from "./photo-info-layout";

const spaces: PhotoInfoSpace[] = ["photo", "balanced", "info"];

export const PhotoInfoSpaceControls = ({
  value,
  onChange,
}: {
  value: PhotoInfoSpace;
  onChange: (value: PhotoInfoSpace) => void;
}) => {
  const { t } = useTranslation();
  const index = spaces.indexOf(value);

  return (
    <div
      className="af-viewer-space-controls"
      role="group"
      aria-label={t("photo.viewer.layout.adjust")}
    >
      <button
        type="button"
        className="af-control"
        disabled={index === 0}
        onClick={() => onChange(spaces[index - 1]!)}
      >
        <i className="i-mingcute-pic-line" aria-hidden="true" />
        {t("photo.viewer.layout.more-photo")}
      </button>
      <button
        type="button"
        className="af-control"
        disabled={index === spaces.length - 1}
        onClick={() => onChange(spaces[index + 1]!)}
      >
        <i className="i-mingcute-information-line" aria-hidden="true" />
        {t("photo.viewer.layout.more-info")}
      </button>
      <span className="sr-only" role="status">
        {value === "photo"
          ? t("photo.viewer.layout.photo")
          : value === "info"
            ? t("photo.viewer.layout.info")
            : t("photo.viewer.layout.balanced")}
      </span>
    </div>
  );
};
