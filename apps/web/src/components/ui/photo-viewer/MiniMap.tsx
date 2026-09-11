import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import Map from "react-map-gl/maplibre";

import { canUseWebGL2 } from "~/lib/feature";
import { maplibre } from "~/lib/map/maplibre";
import { getMapStyle } from "~/lib/map/style";
import { isValidGPSCoordinates } from "~/lib/map-utils";
import { useAppNavigation } from "~/navigation/hooks";
import { isPlainLinkClick } from "~/navigation/link-click";

interface MiniMapProps {
  latitude: number;
  longitude: number;
  photoId: string;
}

export const MiniMap = ({ latitude, longitude, photoId }: MiniMapProps) => {
  const navigation = useAppNavigation();
  const [isLoaded, setIsLoaded] = useState(false);
  const { t } = useTranslation();
  const exploreHref = `/explore?${new URLSearchParams({ photoId }).toString()}`;

  const handleMapLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  // 检查是否有有效的GPS坐标
  const hasValidCoordinates = isValidGPSCoordinates({ latitude, longitude });

  if (!hasValidCoordinates) {
    return null;
  }

  return (
    <div className="border-fill-tertiary bg-fill-quaternary relative h-40 w-full overflow-hidden rounded-xl border">
      {canUseWebGL2 && (
        <Map
          mapLib={maplibre}
          key={`${latitude}-${longitude}`}
          longitude={longitude}
          latitude={latitude}
          zoom={15}
          style={{ width: "100%", height: "100%" }}
          mapStyle={getMapStyle()}
          attributionControl={false}
          onLoad={handleMapLoad}
          interactive={false}
        />
      )}

      {/* 中心标记 */}
      {canUseWebGL2 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            aria-hidden="true"
            className="bg-accent size-2.5 rounded-full shadow-sm ring-2 shadow-black/50 ring-white"
          />
        </div>
      )}

      {/* 加载状态 */}
      {canUseWebGL2 && !isLoaded && (
        <div
          role="status"
          className="af-glass absolute inset-0 flex items-center justify-center"
        >
          <div className="text-text-secondary text-xs">
            {t("minimap.loading")}
          </div>
        </div>
      )}

      {!canUseWebGL2 && (
        <div className="text-text-secondary flex h-full flex-col items-center justify-center gap-2 text-[13px] tabular-nums">
          <span>{t("minimap.view.in.map")}</span>
          <span>
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        </div>
      )}

      {/* 点击跳转到explore页面的遮罩 */}
      <a
        href={exploreHref}
        onClick={(event) => {
          if (isPlainLinkClick(event)) {
            event.preventDefault();
            navigation.showMap(photoId);
          }
        }}
        className="absolute inset-0 cursor-pointer rounded-xl transition-colors duration-200 [--af-focus-offset:-3px] hover:bg-black/10"
        aria-label={t("minimap.view.in.map")}
      />
    </div>
  );
};
