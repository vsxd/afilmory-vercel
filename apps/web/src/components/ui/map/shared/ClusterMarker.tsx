import { HoverCard, HoverCardContent, HoverCardTrigger } from "@afilmory/ui";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { Marker } from "react-map-gl/maplibre";

import { ThumbnailImage } from "~/components/ui/ThumbnailImage";

import { ClusterPhotoGrid } from "../ClusterPhotoGrid";
import type { ClusterMarkerProps } from "./types";

const DEFAULT_CLUSTERED_PHOTOS: ClusterMarkerProps["clusteredPhotos"] = [];

export const ClusterMarker = ({
  longitude,
  latitude,
  pointCount,
  displayMode = "photos",
  representativeMarker: _representativeMarker,
  clusteredPhotos = DEFAULT_CLUSTERED_PHOTOS,
  onClusterClick,
}: ClusterMarkerProps) => {
  const { t } = useTranslation();
  const size = Math.min(64, Math.max(40, 32 + Math.log(pointCount) * 8));
  const handleClusterKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClusterClick?.(longitude, latitude);
    }
  };

  return (
    <Marker longitude={longitude} latitude={latitude}>
      <HoverCard openDelay={300} closeDelay={150}>
        <HoverCardTrigger asChild>
          <m.div
            className="focus-visible:ring-accent/45 group focus-visible:ring-offset-background relative cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-offset-2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 25,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onClusterClick?.(longitude, latitude)}
            onKeyDown={handleClusterKeyDown}
            role="button"
            tabIndex={0}
            aria-label={t(
              displayMode === "regions"
                ? "explore.cluster.regions"
                : "explore.cluster.photos",
              { count: pointCount },
            )}
          >
            {/* Subtle pulse ring for attention */}
            <div
              className="bg-blue/20 absolute inset-0 animate-pulse rounded-full opacity-60"
              style={{
                width: size + 12,
                height: size + 12,
                left: -6,
                top: -6,
              }}
            />

            {/* Main cluster container */}
            <div
              className="relative flex items-center justify-center rounded-full border border-white/40 bg-white/95 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-white hover:shadow-xl dark:border-white/10 dark:bg-black/80 dark:hover:bg-black/90"
              style={{
                width: size,
                height: size,
              }}
            >
              {/* Background mosaic of photos */}
              {clusteredPhotos.length > 0 && (
                <div className="absolute inset-1 overflow-hidden rounded-full">
                  {/* Show up to 4 photos in a mosaic pattern */}
                  {clusteredPhotos.slice(0, 4).map((photoMarker, index) => {
                    const positions = [
                      { left: "0%", top: "0%", width: "50%", height: "50%" },
                      { left: "50%", top: "0%", width: "50%", height: "50%" },
                      { left: "0%", top: "50%", width: "50%", height: "50%" },
                      { left: "50%", top: "50%", width: "50%", height: "50%" },
                    ];
                    const position = positions[index];

                    return (
                      <div
                        key={photoMarker.photo.id}
                        className="absolute opacity-30"
                        style={position}
                      >
                        <ThumbnailImage
                          photoId={photoMarker.photo.id}
                          src={
                            photoMarker.photo.thumbnailUrl ||
                            photoMarker.photo.originalUrl
                          }
                          alt={photoMarker.photo.title || photoMarker.photo.id}
                          thumbHash={photoMarker.photo.thumbHash}
                          containerClassName="h-full w-full"
                          imageClassName="h-full w-full object-cover"
                          loadPolicy="in-view"
                          rootMargin="100px"
                          threshold={0.1}
                        />
                      </div>
                    );
                  })}

                  {/* Overlay for mosaic effect */}
                  <div className="from-blue/40 to-indigo/60 absolute inset-0 bg-gradient-to-br" />
                </div>
              )}

              {/* Glass morphism overlay */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-white/10 dark:from-white/20 dark:to-white/5" />

              {/* Count display */}
              <div className="relative z-10 flex flex-col items-center text-xs">
                <span className="text-text font-bold">{pointCount}</span>
              </div>

              {/* Subtle inner shadow for depth */}
              <div className="absolute inset-0 rounded-full shadow-inner shadow-black/5" />
            </div>
          </m.div>
        </HoverCardTrigger>

        <HoverCardContent
          className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden border-white/20 bg-white/95 p-0 shadow-xl backdrop-blur-2xl dark:bg-black/95"
          side="top"
          align="center"
          portal={false}
          sideOffset={8}
        >
          <div className="p-4">
            <ClusterPhotoGrid
              photos={clusteredPhotos}
              onPhotoClick={(_photo) => {
                // Optional: handle individual photo clicks
                // Photo click handling can be implemented here if needed
              }}
            />
          </div>
        </HoverCardContent>
      </HoverCard>
    </Marker>
  );
};
