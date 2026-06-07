import { m } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMap } from "react-map-gl/maplibre";
import { toast } from "sonner";

import type { MapControlsProps } from "./types";

const controlShellClassName =
  "bg-material-thick border-fill-tertiary overflow-hidden rounded-xl border shadow-xl backdrop-blur-2xl";

const controlButtonClassName =
  "group hover:bg-fill-secondary active:bg-fill-tertiary focus-visible:ring-accent/45 focus-visible:ring-offset-background flex h-12 w-12 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-offset-0";

export const MapControls = ({ onGeolocate }: MapControlsProps) => {
  const { current: map } = useMap();
  const { t } = useTranslation();
  const [isLocating, setIsLocating] = useState(false);

  const handleZoomIn = () => {
    if (map) {
      const currentZoom = map.getZoom();
      map.easeTo({ zoom: currentZoom + 1, duration: 300 });
    }
  };

  const handleZoomOut = () => {
    if (map) {
      const currentZoom = map.getZoom();
      map.easeTo({ zoom: currentZoom - 1, duration: 300 });
    }
  };

  const handleCompass = () => {
    if (map) {
      map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
    }
  };

  const handleGeolocate = () => {
    if (isLocating) return;

    if (!navigator.geolocation) {
      toast.error(t("explore.controls.locateUnsupported"));
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;
        setIsLocating(false);
        if (map) {
          map.flyTo({
            center: [longitude, latitude],
            zoom: 14,
            duration: 1000,
          });
        }
        onGeolocate?.(longitude, latitude);
      },
      (error) => {
        setIsLocating(false);
        console.warn("Geolocation error:", error);
        toast.error(t("explore.controls.locateFailed"));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  };

  return (
    <m.div
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-[calc(env(safe-area-inset-left)+1rem)] z-40 flex flex-col gap-3"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      {/* Control Group Container */}
      <div className={`${controlShellClassName} flex flex-col`}>
        {/* Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          className={controlButtonClassName}
          aria-label={t("explore.controls.zoom.in")}
          title={t("explore.controls.zoom.in")}
        >
          <i className="i-mingcute-add-line text-text size-5 transition-transform group-hover:scale-110 group-active:scale-95" />
        </button>

        {/* Divider */}
        <div className="bg-fill-secondary h-px w-full" />

        {/* Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          className={controlButtonClassName}
          aria-label={t("explore.controls.zoom.out")}
          title={t("explore.controls.zoom.out")}
        >
          <i className="i-mingcute-minimize-line text-text size-5 transition-transform group-hover:scale-110 group-active:scale-95" />
        </button>
      </div>

      {/* Compass Button */}
      <div className={controlShellClassName}>
        <button
          type="button"
          onClick={handleCompass}
          className={controlButtonClassName}
          aria-label={t("explore.controls.compass")}
          title={t("explore.controls.compass")}
        >
          <i className="i-mingcute-navigation-line text-text size-5 transition-transform group-hover:scale-110 group-active:scale-95" />
        </button>
      </div>

      {/* Geolocate Button */}
      <div className={controlShellClassName}>
        <button
          type="button"
          onClick={handleGeolocate}
          disabled={isLocating}
          aria-busy={isLocating}
          className={controlButtonClassName}
          aria-label={t("explore.controls.locate")}
          title={t("explore.controls.locate")}
        >
          <i
            className={`i-mingcute-location-fill text-text size-5 transition-transform group-hover:scale-110 group-active:scale-95 ${
              isLocating ? "animate-pulse" : ""
            }`}
          />
        </button>
      </div>
    </m.div>
  );
};
