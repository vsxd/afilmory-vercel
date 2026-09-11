import { useTranslation } from "react-i18next";

import { useGallerySettings } from "~/navigation/hooks";

import {
  applyGalleryCommandAction,
  getActiveFilterCount,
} from "./command-palette/model";

export const GalleryEmptyState = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useGallerySettings();
  if (getActiveFilterCount(settings) === 0) return null;

  return (
    <div className="af-panel mx-auto mt-4 flex max-w-lg flex-col items-center gap-3 rounded-2xl px-5 py-6 text-center">
      <p role="status" className="text-ui-secondary text-sm leading-relaxed">
        {t("gallery.empty.filtered")}
      </p>
      <button
        type="button"
        className="af-control min-h-11 rounded-xl px-4 py-2 text-sm font-medium"
        onClick={(event) => {
          const gallery = event.currentTarget.closest("[data-gallery-root]");
          setSettings((previous) =>
            applyGalleryCommandAction(previous, { type: "clear-filters" }),
          );
          requestAnimationFrame(() => {
            gallery
              ?.querySelector<HTMLButtonElement>(
                "[data-gallery-header] [data-gallery-search]",
              )
              ?.focus({ preventScroll: true });
          });
        }}
      >
        {t("gallery.empty.clear")}
      </button>
    </div>
  );
};
