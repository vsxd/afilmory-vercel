import { clsxm } from "@afilmory/ui";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useGallerySettings } from "~/navigation/hooks";
import {
  usePhotoRepository,
  usePhotoRepositorySnapshot,
} from "~/runtime/app-runtime";

import {
  createGalleryFilterItems,
  createGalleryGeoRegions,
} from "../filter-options";

type FilterItem = {
  id: string;
  label: string;
};

const toggleValue = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];

const FilterSection = ({
  title,
  icon,
  items,
  selected,
  onToggle,
  headingLevel,
  layout = "chips",
}: {
  title: string;
  icon: string;
  items: FilterItem[];
  selected: string[];
  onToggle: (id: string) => void;
  headingLevel: 3 | 4;
  layout?: "chips" | "equipment";
}) => {
  const headingId = useId();
  if (items.length === 0) return null;

  const Heading = headingLevel === 3 ? "h3" : "h4";

  return (
    <section aria-labelledby={headingId}>
      <div className="text-text-secondary mb-2.5 flex items-center gap-2 px-1 text-xs font-medium">
        <i className={icon} aria-hidden="true" />
        <Heading id={headingId}>{title}</Heading>
        <span
          className="text-text-tertiary ml-auto tabular-nums"
          aria-hidden="true"
        >
          {items.length}
        </span>
      </div>
      <div
        className={
          layout === "equipment"
            ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
            : "flex flex-wrap gap-2"
        }
      >
        {items.map((item) => {
          const isActive = selected.includes(item.id);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              aria-pressed={isActive}
              className={clsxm(
                "af-control inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] leading-5 font-medium",
                isActive && "border-accent/45 bg-accent/10",
                layout === "equipment" && "w-full",
              )}
            >
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere] whitespace-normal">
                {item.label}
              </span>
              <span
                aria-hidden="true"
                className={clsxm(
                  "flex size-4 shrink-0 items-center justify-center rounded-full",
                  isActive
                    ? "bg-accent text-[var(--color-accent-content)]"
                    : "border-fill-tertiary border",
                )}
              >
                {isActive && <i className="i-mingcute-check-line text-xs" />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const FilterPanel = ({
  showHeader = true,
  className,
}: {
  showHeader?: boolean;
  className?: string;
}) => {
  const { t, i18n } = useTranslation();
  const [gallerySetting, setGallerySetting] = useGallerySettings();
  const photoRepository = usePhotoRepository();
  const allTags = useMemo(
    () => photoRepository.getAllTags(),
    [photoRepository],
  );
  const allCameras = useMemo(
    () => photoRepository.getAllCameras(),
    [photoRepository],
  );
  const allLenses = useMemo(
    () => photoRepository.getAllLenses(),
    [photoRepository],
  );
  const allPhotos = usePhotoRepositorySnapshot();

  const geoRegions = useMemo(
    () => createGalleryGeoRegions(allPhotos),
    [allPhotos],
  );
  const filterItems = useMemo(
    () =>
      createGalleryFilterItems({
        allTags,
        allCameras,
        allLenses,
        geoRegions,
        language: i18n.language,
      }),
    [allCameras, allLenses, allTags, geoRegions, i18n.language],
  );
  const sectionHeadingLevel = showHeader ? 4 : 3;

  const resetFilters = () => {
    setGallerySetting((prev) => ({
      ...prev,
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      selectedGeoCountries: [],
      selectedGeoRegions: [],
      selectedGeoCities: [],
      selectedGeoDistricts: [],
    }));
  };

  return (
    <div
      className={clsxm(
        "pb-safe lg:pb-safe-2 max-h-[min(70vh,42rem)] w-full overflow-y-auto px-4 pt-4 pb-5",
        className,
      )}
    >
      {showHeader && (
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="af-panel text-text-secondary flex size-10 shrink-0 items-center justify-center rounded-xl">
              <i
                className="i-mingcute-filter-3-line text-lg"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-text text-sm font-semibold">
                {t("action.filter.title")}
              </h3>
              <p className="text-text-secondary mt-0.5 text-xs">
                {t("action.filter.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="af-control min-h-11 shrink-0 rounded-xl px-3 text-xs font-medium"
          >
            {t("action.search.clear")}
          </button>
        </header>
      )}

      <div className={clsxm("space-y-6", showHeader && "mt-5")}>
        <FilterSection
          title={t("action.tag.filter")}
          icon="i-mingcute-tag-line"
          items={filterItems.tags}
          headingLevel={sectionHeadingLevel}
          selected={gallerySetting.selectedTags}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedTags: toggleValue(prev.selectedTags, id),
            }))
          }
        />
        <FilterSection
          title={t("action.camera.filter")}
          icon="i-mingcute-camera-line"
          items={filterItems.cameras}
          layout="equipment"
          headingLevel={sectionHeadingLevel}
          selected={gallerySetting.selectedCameras}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedCameras: toggleValue(prev.selectedCameras, id),
            }))
          }
        />
        <FilterSection
          title={t("action.lens.filter")}
          icon="i-mingcute-camera-2-line"
          items={filterItems.lenses}
          layout="equipment"
          headingLevel={sectionHeadingLevel}
          selected={gallerySetting.selectedLenses}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedLenses: toggleValue(prev.selectedLenses, id),
            }))
          }
        />
        <FilterSection
          title={t("action.geo.country.filter")}
          icon="i-mingcute-world-line"
          items={filterItems.countries}
          headingLevel={sectionHeadingLevel}
          selected={gallerySetting.selectedGeoCountries}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedGeoCountries: toggleValue(prev.selectedGeoCountries, id),
            }))
          }
        />
        <FilterSection
          title={t("action.geo.city.filter")}
          icon="i-mingcute-building-5-line"
          items={filterItems.cities}
          headingLevel={sectionHeadingLevel}
          selected={gallerySetting.selectedGeoCities}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedGeoCities: toggleValue(prev.selectedGeoCities, id),
            }))
          }
        />
      </div>
    </div>
  );
};
