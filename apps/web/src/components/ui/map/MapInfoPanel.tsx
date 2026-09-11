import { m } from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  calculateApproximateCoverageAreaKm2,
  normalizeLongitude,
} from "~/lib/map-utils";
import type {
  GeographicRegionLevel,
  MapBounds,
  MapDisplayMode,
} from "~/types/map";

interface MapInfoPanelProps {
  displayMode: MapDisplayMode;
  regionsCount: number;
  cityCount: number;
  photosCount: number;
  regionLevel: GeographicRegionLevel;
  isGpsFallback?: boolean;
  bounds?: MapBounds | null;
  onDisplayModeChange: (mode: MapDisplayMode) => void;
}

export const MapInfoPanel = ({
  displayMode,
  regionsCount,
  cityCount,
  photosCount,
  regionLevel,
  isGpsFallback = false,
  bounds,
  onDisplayModeChange,
}: MapInfoPanelProps) => {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const primaryCountLabel = isGpsFallback
    ? t("explore.found.photos", { count: photosCount })
    : displayMode === "regions"
      ? t("explore.found.regions", {
          count: regionsCount,
          level: t(`explore.region.level.${regionLevel}`),
        })
      : t("explore.found.photos", { count: photosCount });
  const secondaryCountLabel = isGpsFallback
    ? t("explore.fallback.gpsOnly")
    : displayMode === "regions"
      ? t("explore.found.photosCompact", { count: photosCount })
      : t("explore.found.citiesCompact", { count: cityCount });
  const modes = [
    {
      value: "regions",
      label: t("explore.mode.regions"),
      icon: "i-mingcute-map-pin-fill",
    },
    {
      value: "photos",
      label: t("explore.mode.photos"),
      icon: "i-mingcute-camera-line",
    },
  ] satisfies Array<{ value: MapDisplayMode; label: string; icon: string }>;
  const areaLabel = useMemo(() => {
    if (!bounds) {
      return null;
    }

    return new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }).format(calculateApproximateCoverageAreaKm2(bounds));
  }, [bounds, i18n.language]);

  const formatLatitude = (latitude: number) =>
    `${Math.abs(latitude).toFixed(6)}° ${t(
      latitude >= 0 ? "explore.coordinates.north" : "explore.coordinates.south",
    )}`;
  const formatLongitude = (longitude: number) => {
    const normalizedLongitude = normalizeLongitude(longitude);

    return `${Math.abs(normalizedLongitude).toFixed(6)}° ${t(
      normalizedLongitude >= 0
        ? "explore.coordinates.east"
        : "explore.coordinates.west",
    )}`;
  };

  return (
    <m.div
      className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-40 w-[min(20rem,calc(100vw-5.5rem))]"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className="af-popover max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain rounded-2xl">
        {/* Header Section */}
        <div className="p-4">
          <m.div
            className="flex items-start gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            {/* Icon container with enhanced styling */}
            <div className="bg-accent/10 flex size-10 shrink-0 items-center justify-center rounded-xl max-sm:hidden">
              <i
                className="i-mingcute-map-line text-accent text-lg"
                aria-hidden="true"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-text text-base leading-snug font-semibold">
                  {t("explore.explore.map")}
                </h1>
                {/* Collapse/Expand Button */}
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="af-control flex size-11 shrink-0 items-center justify-center rounded-xl"
                  aria-expanded={isExpanded}
                  aria-controls="map-range-details"
                  aria-label={t(
                    isExpanded
                      ? "explore.panel.toggle.collapse"
                      : "explore.panel.toggle.expand",
                  )}
                  title={t(
                    isExpanded
                      ? "explore.panel.toggle.collapse"
                      : "explore.panel.toggle.expand",
                  )}
                >
                  <m.i
                    className="i-mingcute-down-line text-text-secondary text-base"
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  />
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-text text-sm font-medium">
                    {primaryCountLabel}
                  </span>
                </div>
              </div>
              <div className="text-text-secondary mt-1.5 text-xs leading-relaxed">
                {secondaryCountLabel}
              </div>
            </div>
          </m.div>

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1">
            {modes.map((mode) => {
              const isActive = displayMode === mode.value;

              return (
                <button
                  key={mode.value}
                  type="button"
                  className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-[background-color,box-shadow,color] ${
                    isActive
                      ? "text-text bg-white/10 shadow-sm"
                      : "text-text-secondary hover:bg-fill-tertiary/70"
                  }`}
                  aria-pressed={isActive}
                  title={mode.label}
                  onClick={() => onDisplayModeChange(mode.value)}
                >
                  <i className={`${mode.icon} text-sm`} aria-hidden="true" />
                  <span className="truncate">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Coordinates Section - Collapsible */}
        <m.div
          initial={false}
          animate={{
            height: isExpanded && bounds ? "auto" : 0,
            opacity: isExpanded && bounds ? 1 : 0,
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          id="map-range-details"
          aria-hidden={!isExpanded}
          className="overflow-hidden"
        >
          {bounds && (
            <div className="border-fill-secondary border-t px-4 pt-4 pb-4">
              {/* Section header */}
              <div className="mb-4 flex items-center gap-2.5">
                <i
                  className="i-mingcute-location-line text-text-secondary"
                  aria-hidden="true"
                />
                <span className="text-text text-sm font-medium tracking-tight">
                  {t("explore.region.range")}
                </span>
              </div>

              {/* Enhanced coordinate cards */}
              <div className="space-y-3">
                {/* Min coordinates */}
                <div className="rounded-lg bg-black/15 p-3">
                  <div className="text-text-secondary mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                    <i
                      className="i-mingcute-arrow-left-down-line text-sm"
                      aria-hidden="true"
                    />
                    {t("explore.bounds.southwest")}
                  </div>
                  <div className="space-y-1">
                    <div className="text-text flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {t("explore.coordinates.latitude")}
                      </span>
                      <span className="text-xs tabular-nums">
                        {formatLatitude(bounds.minLat)}
                      </span>
                    </div>
                    <div className="text-text flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {t("explore.coordinates.longitude")}
                      </span>
                      <span className="text-xs tabular-nums">
                        {formatLongitude(bounds.minLng)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Max coordinates */}
                <div className="rounded-lg bg-black/15 p-3">
                  <div className="text-text-secondary mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                    <i
                      className="i-mingcute-arrow-right-up-line text-sm"
                      aria-hidden="true"
                    />
                    {t("explore.bounds.northeast")}
                  </div>
                  <div className="space-y-1">
                    <div className="text-text flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {t("explore.coordinates.latitude")}
                      </span>
                      <span className="text-xs tabular-nums">
                        {formatLatitude(bounds.maxLat)}
                      </span>
                    </div>
                    <div className="text-text flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {t("explore.coordinates.longitude")}
                      </span>
                      <span className="text-xs tabular-nums">
                        {formatLongitude(bounds.maxLng)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coverage area calculation */}
              <div className="mt-3 rounded-lg bg-black/15 p-3">
                <div className="text-text-secondary flex items-center gap-2 text-xs">
                  <i className="i-mingcute-grid-line" aria-hidden="true" />
                  <span className="font-medium">
                    {t("explore.coverage.approx", { area: areaLabel })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </m.div>
      </div>
    </m.div>
  );
};
