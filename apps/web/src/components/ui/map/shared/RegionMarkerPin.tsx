import { buildGeoRegionId } from "@afilmory/schema";
import {
  GlassButton,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@afilmory/ui";
import { useSetAtom } from "jotai";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { Marker } from "react-map-gl/maplibre";
import { useNavigate } from "react-router";

import { gallerySettingAtom } from "~/atoms/app";
import { getRegionDisplayName } from "~/lib/geo-regions";
import type { GeographicRegion } from "~/types/map";

import { ClusterPhotoGrid } from "../ClusterPhotoGrid";

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
  const setGallerySetting = useSetAtom(gallerySettingAtom);
  const navigate = useNavigate();
  const displayName = getRegionDisplayName(region, i18n.language);
  const filterTarget = getGalleryFilterTarget(region);

  const handleClick = () => {
    onClick?.(region);
  };

  const handleClose = (event: React.MouseEvent) => {
    event.stopPropagation();
    onClose?.();
  };

  const handleFilterRegion = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!filterTarget) return;

    setGallerySetting((prev) => ({
      ...prev,
      [filterTarget.key]: Array.from(
        new Set([...prev[filterTarget.key], filterTarget.id]),
      ),
    }));
    navigate("/");
  };

  const handleMarkerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <Marker longitude={region.longitude} latitude={region.latitude}>
      <HoverCard
        open={isSelected ? true : undefined}
        openDelay={isSelected ? 0 : 300}
        closeDelay={isSelected ? 0 : 120}
      >
        <HoverCardTrigger asChild>
          <m.div
            className="focus-visible:ring-accent/45 group focus-visible:ring-offset-background relative cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-offset-2"
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
            onKeyDown={handleMarkerKeyDown}
            role="button"
            tabIndex={0}
            aria-label={t("explore.region.photos", {
              name: displayName,
              count: region.photoCount,
            })}
          >
            {isSelected && (
              <div className="bg-accent/30 absolute inset-0 -m-2 animate-pulse rounded-full" />
            )}

            <div
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl ${
                isSelected
                  ? "border-accent/40 bg-accent/90 shadow-accent/50"
                  : "border-white/40 bg-white/95 hover:bg-white dark:border-white/20 dark:bg-black/80 dark:hover:bg-black/90"
              }`}
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-white/10 dark:from-white/20 dark:to-white/5" />
              <i
                className={`i-mingcute-map-pin-fill relative z-10 text-lg drop-shadow-sm ${
                  isSelected ? "text-white" : "text-gray-700 dark:text-white"
                }`}
              />
              <div className="absolute -right-1 -bottom-1 z-20 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/75 px-1 text-[10px] font-semibold text-white ring-1 ring-white/30">
                {region.photoCount}
              </div>
            </div>
          </m.div>
        </HoverCardTrigger>

        <HoverCardContent
          className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden border-white/20 bg-white/95 p-0 shadow-xl backdrop-blur-2xl dark:bg-black/95"
          side="top"
          align="center"
          portal={false}
          sideOffset={8}
          onPointerDownOutside={
            isSelected ? (event) => event.preventDefault() : undefined
          }
          onEscapeKeyDown={
            isSelected ? (event) => event.preventDefault() : undefined
          }
        >
          <div className="relative space-y-3 p-4">
            {isSelected && (
              <GlassButton
                className="absolute top-3 right-3 z-10 size-11"
                onClick={handleClose}
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                <i className="i-mingcute-close-line text-lg" />
              </GlassButton>
            )}
            <div className="pr-14">
              <div className="text-text text-sm font-semibold">
                {displayName}
              </div>
              <div className="text-text-secondary mt-1 text-xs">
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
                className="focus-visible:ring-accent/45 bg-accent text-accent-foreground focus-visible:ring-offset-background h-11 w-full rounded-lg px-3 text-xs font-semibold transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {t("explore.region.filter")}
              </button>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>
    </Marker>
  );
};
