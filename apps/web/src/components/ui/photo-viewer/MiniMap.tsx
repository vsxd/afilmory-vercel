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
    <div className="relative h-40 w-full overflow-hidden rounded-lg border border-white/10">
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
          <div className="relative">
            <div className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-blue-400 opacity-75" />
            <div className="relative h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white/80" />
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {canUseWebGL2 && !isLoaded && (
        <div className="bg-material-ultra-thin absolute inset-0 flex items-center justify-center backdrop-blur-sm">
          <div className="text-xs text-white/60">{t("minimap.loading")}</div>
        </div>
      )}

      {!canUseWebGL2 && (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-white/60">
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
        className="absolute inset-0 cursor-pointer transition-opacity duration-200 hover:bg-black/10"
        aria-label={t("minimap.view.in.map")}
      />
    </div>
  );
};
