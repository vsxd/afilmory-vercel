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
      className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-40 max-w-xs"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className="bg-material-thick border-fill-tertiary rounded-2xl border shadow-xl backdrop-blur-2xl">
        {/* Header Section */}
        <div className="p-5">
          <m.div
            className="flex items-center gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            {/* Icon container with enhanced styling */}
            <div className="bg-blue/10 ring-blue/20 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ring-1 ring-inset">
              <i className="i-mingcute-map-line text-blue text-lg" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <h1 className="text-text text-lg leading-tight font-semibold tracking-tight">
                  {t("explore.explore.map")}
                </h1>
                {/* Collapse/Expand Button */}
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="bg-fill-secondary/50 ring-fill-tertiary/20 hover:bg-fill-tertiary focus-visible:ring-accent/45 relative -top-2 -mb-2 flex size-11 flex-shrink-0 items-center justify-center rounded-xl ring-1 transition-[background-color,box-shadow,color,transform] duration-200 ring-inset focus-visible:ring-2"
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
                <div className="bg-green/10 ring-green/20 flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset">
                  <div className="bg-green h-1.5 w-1.5 rounded-full" />
                  <span className="text-text-secondary text-xs font-medium">
                    {primaryCountLabel}
                  </span>
                </div>
              </div>
              <div className="text-text-tertiary mt-2 text-xs font-medium">
                {secondaryCountLabel}
              </div>
            </div>
          </m.div>

          <div className="bg-fill-secondary/45 ring-fill-tertiary/25 mt-4 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 ring-inset">
            {modes.map((mode) => {
              const isActive = displayMode === mode.value;

              return (
                <button
                  key={mode.value}
                  type="button"
                  className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-[background-color,box-shadow,color] ${
                    isActive
                      ? "bg-fill-vibrant-secondary text-text shadow-sm"
                      : "text-text-secondary hover:bg-fill-tertiary/70"
                  }`}
                  aria-pressed={isActive}
                  title={mode.label}
                  onClick={() => onDisplayModeChange(mode.value)}
                >
                  <i className={`${mode.icon} text-sm`} />
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
          className="overflow-hidden"
        >
          {bounds && (
            <div className="border-fill-secondary border-t px-5 pt-4 pb-5">
              {/* Section header */}
              <div className="mb-4 flex items-center gap-2.5">
                <i className="i-mingcute-location-line text-text-secondary" />
                <span className="text-text text-sm font-medium tracking-tight">
                  {t("explore.region.range")}
                </span>
              </div>

              {/* Enhanced coordinate cards */}
              <div className="space-y-3">
                {/* Min coordinates */}
                <div className="bg-fill-vibrant-quinary border-fill-tertiary rounded-xl border p-4">
                  <div className="text-text-secondary mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                    <i className="i-mingcute-arrow-left-down-line text-sm" />
                    {t("explore.bounds.southwest")}
                  </div>
                  <div className="space-y-1">
                    <div className="text-text flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {t("explore.coordinates.latitude")}
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {formatLatitude(bounds.minLat)}
                      </span>
                    </div>
                    <div className="text-text flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {t("explore.coordinates.longitude")}
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {formatLongitude(bounds.minLng)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Max coordinates */}
                <div className="bg-fill-vibrant-quinary border-fill-tertiary rounded-xl border p-4">
                  <div className="text-text-secondary mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                    <i className="i-mingcute-arrow-right-up-line text-sm" />
                    {t("explore.bounds.northeast")}
                  </div>
                  <div className="space-y-1">
                    <div className="text-text flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {t("explore.coordinates.latitude")}
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {formatLatitude(bounds.maxLat)}
                      </span>
                    </div>
                    <div className="text-text flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {t("explore.coordinates.longitude")}
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {formatLongitude(bounds.maxLng)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coverage area calculation */}
              <div className="bg-fill-vibrant-quinary border-fill-tertiary mt-4 rounded-xl border p-3">
                <div className="text-text-secondary flex items-center gap-2 text-xs">
                  <i className="i-mingcute-grid-line" />
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
