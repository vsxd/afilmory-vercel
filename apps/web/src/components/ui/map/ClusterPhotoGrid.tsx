import { Spring } from "@afilmory/ui";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { ThumbnailImage } from "~/components/ui/ThumbnailImage";
import { getPhotoAccessibleLabel } from "~/lib/photo-accessibility";
import { PhotoLink } from "~/navigation/links";
import type { PhotoMarker } from "~/types/map";

interface ClusterPhotoGridProps {
  photos: PhotoMarker[];
  onPhotoClick?: (photo: PhotoMarker) => void;
}

export const ClusterPhotoGrid = ({
  photos,
  onPhotoClick,
}: ClusterPhotoGridProps) => {
  // 最多显示 6 张照片
  const displayPhotos = photos.slice(0, 6);
  const remainingCount = Math.max(0, photos.length - 6);
  const primaryPhoto = photos[0];
  const firstRemainingPhoto = photos[displayPhotos.length];
  const { t, i18n } = useTranslation();
  const latitudeDirection =
    primaryPhoto?.latitudeRef === "S"
      ? t("explore.coordinates.south")
      : t("explore.coordinates.north");
  const longitudeDirection =
    primaryPhoto?.longitudeRef === "W"
      ? t("explore.coordinates.west")
      : t("explore.coordinates.east");
  const locationLabel = primaryPhoto
    ? `${Math.abs(primaryPhoto.latitude).toFixed(4)}°${latitudeDirection}, ${Math.abs(primaryPhoto.longitude).toFixed(4)}°${longitudeDirection}`
    : null;
  const dateRangeLabel = (() => {
    const dates = photos
      .map((p) => p.photo.exif?.DateTimeOriginal)
      .filter(Boolean)
      .map((d) => new Date(d!))
      .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length === 0) return null;

    const earliest = dates[0];
    const latest = dates.at(-1);
    const isSameDay = earliest.toDateString() === latest?.toDateString();

    if (isSameDay) {
      return earliest.toLocaleDateString(i18n.language, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }

    return `${earliest.toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} - ${latest?.toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  })();

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-text text-sm font-semibold">
          {t("explore.cluster.photos", { count: photos.length })}
        </h3>
        <div className="text-text-secondary text-xs">
          {t("explore.cluster.click.details")}
        </div>
      </div>

      {/* 照片网格 */}
      <div className="grid grid-cols-3 gap-2">
        {displayPhotos.map((photoMarker, index) => (
          <m.div
            key={photoMarker.photo.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              ...Spring.presets.smooth,
              delay: index * 0.05,
            }}
            className="group relative aspect-square overflow-hidden rounded-lg"
          >
            <PhotoLink
              photoId={photoMarker.photo.id}
              photoIds={photos.map((marker) => marker.photo.id)}
              onClick={(e) => {
                e.stopPropagation();
                onPhotoClick?.(photoMarker);
              }}
              className="block h-full w-full [--af-focus-offset:-2px]"
              aria-label={getPhotoAccessibleLabel(
                photoMarker.photo,
                t,
                i18n.language,
              )}
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
                imageClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loadPolicy="in-view"
                rootMargin="200px"
                threshold={0.1}
              />

              {/* 悬停遮罩 */}
              <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />

              {/* 悬停图标 */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 group-hover:opacity-100">
                <div className="rounded-full bg-black/50 p-2 backdrop-blur-sm">
                  <i
                    className="i-mingcute-fullscreen-line size-4 text-white"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </PhotoLink>
          </m.div>
        ))}

        {/* 更多照片指示器 */}
        {firstRemainingPhoto && (
          <m.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              ...Spring.presets.smooth,
              delay: displayPhotos.length * 0.05,
            }}
            className="aspect-square"
          >
            <PhotoLink
              photoId={firstRemainingPhoto.photo.id}
              photoIds={photos.map((marker) => marker.photo.id)}
              onClick={(event) => {
                event.stopPropagation();
                onPhotoClick?.(firstRemainingPhoto);
              }}
              className="af-control flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg text-center"
              aria-label={t("explore.cluster.viewMore", {
                count: remainingCount,
              })}
            >
              <span className="text-lg font-semibold tabular-nums">
                +{remainingCount}
              </span>
              <span className="text-text-secondary text-xs">
                {t("explore.cluster.more")}
              </span>
            </PhotoLink>
          </m.div>
        )}
      </div>

      {/* 位置信息 */}
      {primaryPhoto && (
        <div className="border-border space-y-2 border-t pt-3">
          <div className="text-text-secondary flex items-center gap-2 text-xs">
            <i
              className="i-mingcute-location-line text-sm"
              aria-hidden="true"
            />
            <span className="font-mono">{locationLabel}</span>
          </div>

          {/* 拍摄时间范围 */}
          {dateRangeLabel && (
            <div className="text-text-secondary flex items-center gap-2 text-xs">
              <i
                className="i-mingcute-calendar-line text-sm"
                aria-hidden="true"
              />
              <span>{dateRangeLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
