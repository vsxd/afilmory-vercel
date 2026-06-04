import {
  GlassButton,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@afilmory/ui";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { Marker } from "react-map-gl/maplibre";

import type { ShootingLocation } from "~/types/map";

import { ClusterPhotoGrid } from "../ClusterPhotoGrid";

interface LocationMarkerPinProps {
  location: ShootingLocation;
  isSelected?: boolean;
  onClick?: (location: ShootingLocation) => void;
  onClose?: () => void;
}

export const LocationMarkerPin = ({
  location,
  isSelected = false,
  onClick,
  onClose,
}: LocationMarkerPinProps) => {
  const { t } = useTranslation();

  const handleClick = () => {
    onClick?.(location);
  };

  const handleClose = (event: React.MouseEvent) => {
    event.stopPropagation();
    onClose?.();
  };

  const handleMarkerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <Marker longitude={location.longitude} latitude={location.latitude}>
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
            aria-label={t("explore.location.photos", {
              count: location.photoCount,
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
                {location.photoCount}
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
          <div className="relative p-4">
            {isSelected && (
              <GlassButton
                className="absolute top-3 right-3 z-10 size-9"
                onClick={handleClose}
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                <i className="i-mingcute-close-line text-lg" />
              </GlassButton>
            )}
            <ClusterPhotoGrid photos={location.markers} />
          </div>
        </HoverCardContent>
      </HoverCard>
    </Marker>
  );
};
