import "./MapMarker.css";

import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { Marker } from "react-map-gl/maplibre";

import { ThumbnailImage } from "~/components/ui/ThumbnailImage";

import { ClusterPhotoGrid } from "../ClusterPhotoGrid";
import { MapPopover, MapPopoverContent, MapPopoverTrigger } from "./MapPopover";
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
  const size = Math.min(64, Math.max(44, 32 + Math.log(pointCount) * 8));
  return (
    <Marker longitude={longitude} latitude={latitude}>
      <MapPopover>
        <MapPopoverTrigger>
          <m.button
            type="button"
            className="af-map-marker group relative cursor-pointer rounded-full"
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
            aria-label={t(
              displayMode === "regions"
                ? "explore.cluster.regions"
                : "explore.cluster.photos",
              { count: pointCount },
            )}
          >
            {/* Cluster halo remains still while browsing the map. */}
            <div
              className="af-map-marker-halo opacity-60"
              style={{
                width: size + 12,
                height: size + 12,
                left: -6,
                top: -6,
              }}
            />

            {/* Main cluster container */}
            <div
              className="af-map-marker-surface"
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
                          alt=""
                          width={photoMarker.photo.width}
                          height={photoMarker.photo.height}
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

              {/* Count display */}
              <div className="relative z-10 flex flex-col items-center text-xs">
                <span className="text-ui font-bold">{pointCount}</span>
              </div>
            </div>
          </m.button>
        </MapPopoverTrigger>

        <MapPopoverContent
          aria-label={t(
            displayMode === "regions"
              ? "explore.cluster.regions"
              : "explore.cluster.photos",
            { count: pointCount },
          )}
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
        </MapPopoverContent>
      </MapPopover>
    </Marker>
  );
};
