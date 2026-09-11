import "./MapMarker.css";

import { GlassButton } from "@afilmory/ui";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { Marker } from "react-map-gl/maplibre";

import { ThumbnailImage } from "~/components/ui/ThumbnailImage";
import { getPhotoAccessibleLabel } from "~/lib/photo-accessibility";
import { getPhotoDate } from "~/lib/photo-date";
import { PhotoLink } from "~/navigation/links";

import { MapPopover, MapPopoverContent, MapPopoverTrigger } from "./MapPopover";
import type { PhotoMarkerPinProps } from "./types";

export const PhotoMarkerPin = ({
  marker,
  isSelected = false,
  onClick,
  onClose,
}: PhotoMarkerPinProps) => {
  const { t, i18n } = useTranslation();
  const photoLabel = getPhotoAccessibleLabel(marker.photo, t, i18n.language);
  const latitudeDirection =
    marker.latitudeRef === "S"
      ? t("explore.coordinates.south")
      : t("explore.coordinates.north");
  const longitudeDirection =
    marker.longitudeRef === "W"
      ? t("explore.coordinates.west")
      : t("explore.coordinates.east");

  const handleClick = () => {
    onClick?.(marker);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.currentTarget
      .closest('[role="dialog"]')
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
  };

  return (
    <Marker
      key={marker.id}
      longitude={marker.longitude}
      latitude={marker.latitude}
    >
      <MapPopover
        open={isSelected}
        onOpenChange={(open) => {
          if (!open) onClose?.();
        }}
      >
        <MapPopoverTrigger>
          <m.button
            type="button"
            className="af-map-marker group relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleClick}
            aria-label={photoLabel}
          >
            {/* Selection ring - 只有选中时显示 */}
            {isSelected && <div className="af-map-marker-halo -m-2" />}

            {/* Photo background preview */}
            <div className="absolute inset-0.5 overflow-hidden rounded-full">
              <ThumbnailImage
                photoId={marker.photo.id}
                src={marker.photo.thumbnailUrl || marker.photo.originalUrl}
                alt=""
                width={marker.photo.width}
                height={marker.photo.height}
                thumbHash={marker.photo.thumbHash}
                containerClassName="h-full w-full opacity-40"
                imageClassName="h-full w-full object-cover"
                loadPolicy="in-view"
                rootMargin="100px"
                threshold={0.1}
              />
              {/* Overlay */}
              <div className="from-green/60 to-emerald/80 dark:from-green/70 dark:to-emerald/90 absolute inset-0 bg-gradient-to-br" />
            </div>

            {/* Main marker container */}
            <div
              className="af-map-marker-surface size-10"
              data-selected={isSelected}
            >
              {/* Camera icon */}
              <i
                className="i-mingcute-camera-line relative z-10 text-lg"
                aria-hidden="true"
              />
            </div>
          </m.button>
        </MapPopoverTrigger>

        <MapPopoverContent aria-label={photoLabel}>
          <div className="relative">
            {/* 选中时显示关闭按钮 */}
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

            {/* Photo header */}
            <div className="relative h-32 overflow-hidden">
              <ThumbnailImage
                photoId={marker.photo.id}
                src={marker.photo.thumbnailUrl || marker.photo.originalUrl}
                alt=""
                width={marker.photo.width}
                height={marker.photo.height}
                thumbHash={marker.photo.thumbHash}
                containerClassName="h-full w-full"
                imageClassName="h-full w-full object-cover"
                loadPolicy="in-view"
                rootMargin="200px"
                threshold={0.1}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>

            {/* Content */}
            <div className="space-y-3 p-4">
              {/* Title with link */}
              <PhotoLink
                photoId={marker.photo.id}
                className="group/link hover:text-accent flex items-center gap-2 transition-colors"
              >
                <h3
                  className="text-ui flex-1 truncate text-sm font-semibold"
                  title={photoLabel}
                >
                  {photoLabel}
                </h3>
                <i
                  className="i-mingcute-arrow-right-line text-ui-secondary transition-transform group-hover/link:translate-x-0.5"
                  aria-hidden="true"
                />
              </PhotoLink>

              {/* Metadata */}
              <div className="space-y-2">
                {marker.photo.exif?.DateTimeOriginal && (
                  <div className="text-ui-secondary flex items-center gap-2 text-xs">
                    <i
                      className="i-mingcute-calendar-line text-sm"
                      aria-hidden="true"
                    />
                    <span>
                      {getPhotoDate(marker.photo).toLocaleDateString(
                        i18n.language,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </span>
                  </div>
                )}

                {marker.photo.exif?.Make && marker.photo.exif?.Model && (
                  <div className="text-ui-secondary flex items-center gap-2 text-xs">
                    <i
                      className="i-mingcute-camera-line text-sm"
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {marker.photo.exif.Make} {marker.photo.exif.Model}
                    </span>
                  </div>
                )}

                <div className="text-ui-secondary space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <i
                      className="i-mingcute-location-line text-sm"
                      aria-hidden="true"
                    />
                    <span className="font-mono">
                      <span>{Math.abs(marker.latitude).toFixed(4)}°</span>
                      <span>{latitudeDirection}</span>
                      <span>, </span>
                      <span>{Math.abs(marker.longitude).toFixed(4)}°</span>
                      <span>{longitudeDirection}</span>
                    </span>
                  </div>
                  {marker.altitude !== undefined && (
                    <div className="flex items-center gap-2">
                      <i
                        className="i-mingcute-mountain-2-line text-sm"
                        aria-hidden="true"
                      />
                      <span className="font-mono">
                        <span>
                          {marker.altitudeRef === "Below Sea Level" ? "-" : ""}
                        </span>
                        <span>{Math.abs(marker.altitude).toFixed(1)}m</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </MapPopoverContent>
      </MapPopover>
    </Marker>
  );
};
