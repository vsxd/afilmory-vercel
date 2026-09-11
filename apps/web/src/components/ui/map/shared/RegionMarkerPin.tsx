import "./MapMarker.css";

import { buildGeoRegionId } from "@afilmory/schema/geo";
import { GlassButton } from "@afilmory/ui";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { Marker } from "react-map-gl/maplibre";

import { getRegionDisplayName } from "~/lib/geo-regions";
import { useAppNavigation, useGallerySettings } from "~/navigation/hooks";
import type { GeographicRegion } from "~/types/map";

import { ClusterPhotoGrid } from "../ClusterPhotoGrid";
import { MapPopover, MapPopoverContent, MapPopoverTrigger } from "./MapPopover";

interface RegionMarkerPinProps {
  region: GeographicRegion;
  isSelected?: boolean;
  onClick?: (region: GeographicRegion) => void;
  onClose?: () => void;
}

const getGalleryFilterTarget = (region: GeographicRegion) => {
  if (region.level === "country") {
    return {
      key: "selectedGeoCountries",
      id: region.id,
    } as const;
  }

  if (region.level === "city") {
    return {
      key: "selectedGeoCities",
      id: region.id,
    } as const;
  }

  if (region.level === "district") {
    const cityId = buildGeoRegionId(region.adminPath, "city");
    if (cityId) {
      return {
        key: "selectedGeoCities",
        id: cityId,
      } as const;
    }
  }

  return null;
};

export const RegionMarkerPin = ({
  region,
  isSelected = false,
  onClick,
  onClose,
}: RegionMarkerPinProps) => {
  const { t, i18n } = useTranslation();
  const [gallerySetting] = useGallerySettings();
  const navigation = useAppNavigation();
  const displayName = getRegionDisplayName(region, i18n.language);
  const filterTarget = getGalleryFilterTarget(region);

  const handleClick = () => {
    onClick?.(region);
  };

  const handleClose = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.currentTarget
      .closest('[role="dialog"]')
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
  };

  const handleFilterRegion = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!filterTarget) return;

    const nextGallerySetting = {
      ...gallerySetting,
      [filterTarget.key]: Array.from(
        new Set([...gallerySetting[filterTarget.key], filterTarget.id]),
      ),
    };
    navigation.showGallery(nextGallerySetting);
  };

  return (
    <Marker longitude={region.longitude} latitude={region.latitude}>
      <MapPopover
        open={isSelected}
        onOpenChange={(open) => {
          if (!open) onClose?.();
        }}
      >
        <MapPopoverTrigger>
          <m.button
            type="button"
            className="af-map-marker group relative cursor-pointer rounded-full"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 360,
              damping: 28,
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleClick}
            aria-label={t("explore.region.photos", {
              name: displayName,
              count: region.photoCount,
            })}
          >
            {isSelected && <div className="af-map-marker-halo -m-2" />}

            <div
              className="af-map-marker-surface size-11"
              data-selected={isSelected}
            >
              <i
                className="i-mingcute-map-pin-fill relative z-10 text-lg"
                aria-hidden="true"
              />
              <div className="af-map-marker-count absolute -right-1 -bottom-1 z-20 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                {region.photoCount}
              </div>
            </div>
          </m.button>
        </MapPopoverTrigger>

        <MapPopoverContent aria-label={displayName}>
          <div className="relative space-y-3 p-4">
            {isSelected && (
              <GlassButton
                className="absolute top-3 right-3 z-10 size-11"
                onClick={handleClose}
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                <i
                  className="i-mingcute-close-line text-lg"
                  aria-hidden="true"
                />
              </GlassButton>
            )}
            <div className="pr-14">
              <div className="text-ui text-sm font-semibold">{displayName}</div>
              <div className="text-ui-secondary mt-1 text-xs">
                {t("explore.region.summary", {
                  count: region.photoCount,
                })}
              </div>
            </div>
            <ClusterPhotoGrid photos={region.markers} />
            {filterTarget && (
              <button
                type="button"
                onClick={handleFilterRegion}
                className="bg-accent text-accent-content h-11 w-full rounded-lg px-3 text-xs font-semibold transition-opacity hover:opacity-90"
              >
                {t("explore.region.filter")}
              </button>
            )}
          </div>
        </MapPopoverContent>
      </MapPopover>
    </Marker>
  );
};
