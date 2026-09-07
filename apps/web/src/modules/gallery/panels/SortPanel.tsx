import { clsxm } from "@afilmory/ui";
import { useTranslation } from "react-i18next";

import { useGallerySettings } from "~/navigation/hooks";

export const SortPanel = () => {
  const { t } = useTranslation();
  const [gallerySetting, setGallerySetting] = useGallerySettings();

  const setSortOrder = (order: "asc" | "desc") => {
    setGallerySetting({
      ...gallerySetting,
      sortOrder: order,
    });
  };

  const options = [
    {
      order: "desc" as const,
      icon: "i-mingcute-sort-descending-line",
      label: t("action.sort.newest.first"),
    },
    {
      order: "asc" as const,
      icon: "i-mingcute-sort-ascending-line",
      label: t("action.sort.oldest.first"),
    },
  ];

  return (
    <div className="grid gap-2 text-sm">
      {options.map((option) => {
        const active = gallerySetting.sortOrder === option.order;

        return (
          <button
            key={option.order}
            type="button"
            aria-pressed={active}
            className={clsxm(
              "focus-visible:ring-accent/45 group flex h-12 w-full items-center gap-3 rounded-xl border px-3 text-left transition-[background-color,border-color,box-shadow,color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-inset",
              active
                ? "border-accent/35 bg-accent/10 text-accent"
                : "border-fill-tertiary bg-fill-vibrant-quinary text-text hover:bg-fill-secondary",
            )}
            onClick={() => setSortOrder(option.order)}
          >
            <span
              className={clsxm(
                "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-accent text-white shadow-sm"
                  : "bg-material-thin text-text-secondary group-hover:text-text",
              )}
            >
              <i className={option.icon} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {option.label}
            </span>
            {active && (
              <i
                className="i-mingcute-check-line shrink-0 text-base"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
