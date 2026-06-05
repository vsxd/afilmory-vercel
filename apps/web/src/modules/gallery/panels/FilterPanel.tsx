import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { gallerySettingAtom } from "~/atoms/app";
import { photoLoader } from "~/data-runtime/photo-loader";
import {
  createGeographicRegions,
  getRegionDisplayName,
} from "~/lib/geo-regions";
import { convertPhotosToMarkersFromEXIF } from "~/lib/map-utils";

const allTags = photoLoader.getAllTags();
const allCameras = photoLoader.getAllCameras();
const allLenses = photoLoader.getAllLenses();

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
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
        {items.map((item) => {
          const isActive = selected.includes(item.id);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={
                isActive
                  ? "bg-accent text-accent-foreground rounded-full px-3 py-1.5 text-xs font-medium"
                  : "bg-fill-secondary/60 text-text-secondary hover:bg-fill-tertiary rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              }
              title={item.label}
            >
              <span className="line-clamp-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const FilterPanel = () => {
  const { t } = useTranslation();
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom);

  const geoItems = useMemo(() => {
    const markers = convertPhotosToMarkersFromEXIF(photoLoader.getPhotos());
    const toItems = (level: Parameters<typeof createGeographicRegions>[1]) =>
      createGeographicRegions(markers, level).map((region) => ({
        id: region.id,
        label: getRegionDisplayName(region),
      }));

    return {
      countries: toItems("country"),
      regions: toItems("region"),
      cities: toItems("city"),
      districts: toItems("district"),
    };
  }, []);

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
      tagFilterMode: "union",
    }));
  };

  return (
    <div className="pb-safe lg:pb-safe-2 max-h-[min(70vh,42rem)] w-full overflow-y-auto px-4 pt-4 pb-5">
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
          className="text-text-secondary hover:text-accent focus-visible:ring-accent/35 rounded-full px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2"
        >
          {t("action.search.clear")}
        </button>
      </header>

      <div className="mt-5 space-y-5">
        <FilterSection
          title={t("action.tag.filter")}
          icon="i-mingcute-tag-line"
          items={allTags.map((tag) => ({ id: tag, label: tag }))}
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
          items={allCameras.map((camera) => ({
            id: camera.displayName,
            label: camera.displayName,
          }))}
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
          items={allLenses.map((lens) => ({
            id: lens.displayName,
            label: lens.displayName,
          }))}
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
          items={geoItems.countries}
          selected={gallerySetting.selectedGeoCountries}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedGeoCountries: toggleValue(prev.selectedGeoCountries, id),
            }))
          }
        />
        <FilterSection
          title={t("action.geo.region.filter")}
          icon="i-mingcute-map-line"
          items={geoItems.regions}
          selected={gallerySetting.selectedGeoRegions}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedGeoRegions: toggleValue(prev.selectedGeoRegions, id),
            }))
          }
        />
        <FilterSection
          title={t("action.geo.city.filter")}
          icon="i-mingcute-building-5-line"
          items={geoItems.cities}
          selected={gallerySetting.selectedGeoCities}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedGeoCities: toggleValue(prev.selectedGeoCities, id),
            }))
          }
        />
        <FilterSection
          title={t("action.geo.district.filter")}
          icon="i-mingcute-location-line"
          items={geoItems.districts}
          selected={gallerySetting.selectedGeoDistricts}
          onToggle={(id) =>
            setGallerySetting((prev) => ({
              ...prev,
              selectedGeoDistricts: toggleValue(prev.selectedGeoDistricts, id),
            }))
          }
        />
      </div>
    </div>
  );
};

