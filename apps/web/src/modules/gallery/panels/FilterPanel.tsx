import { clsxm } from "@afilmory/ui";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { gallerySettingAtom } from "~/atoms/app";
import { usePhotoRepository } from "~/runtime/app-runtime";

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
}: {
  title: string;
  icon: string;
  items: FilterItem[];
  selected: string[];
  onToggle: (id: string) => void;
}) => {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="text-text-secondary mb-2 flex items-center gap-2 px-1 text-xs font-medium">
        <i className={icon} />
        <h4>{title}</h4>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const isActive = selected.includes(item.id);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              aria-pressed={isActive}
              className={clsxm(
                "focus-visible:ring-accent/45 inline-flex min-h-11 max-w-full items-center rounded-full border px-3 text-xs font-medium transition-[background-color,border-color,box-shadow,color] duration-200 focus-visible:ring-2 focus-visible:ring-inset",
                isActive
                  ? "bg-accent border-accent text-white shadow-sm"
                  : "bg-fill-vibrant-quinary border-fill-tertiary text-text-secondary hover:border-accent/25 hover:bg-fill-secondary hover:text-text",
              )}
              title={item.label}
            >
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const FilterPanel = () => {
  return <FilterPanelContent />;
};

export const FilterPanelContent = ({
  showHeader = true,
  className,
}: {
  showHeader?: boolean;
  className?: string;
}) => {
  const { t, i18n } = useTranslation();
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom);
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
  const allPhotos = photoRepository.getPhotos();

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
            <div className="bg-accent/10 border-accent/15 text-accent flex size-10 shrink-0 items-center justify-center rounded-xl border">
              <i className="i-mingcute-filter-3-line text-lg" />
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
            className="text-text-secondary hover:text-accent focus-visible:ring-accent/35 min-h-11 rounded-full px-3 text-xs font-medium transition-colors focus-visible:ring-2"
          >
            {t("action.search.clear")}
          </button>
        </header>
      )}

      <div className={clsxm("space-y-5", showHeader && "mt-5")}>
        <FilterSection
          title={t("action.tag.filter")}
          icon="i-mingcute-tag-line"
          items={filterItems.tags}
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
