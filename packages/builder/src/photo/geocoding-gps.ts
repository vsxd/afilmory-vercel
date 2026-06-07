import type { LocationInfo, PickedExif } from "../types/photo.js";
import type { GeocodingProvider } from "./geocoding-providers.js";
import { getPhotoProcessingLoggers } from "./logger-adapter.js";

interface GPSLogger {
  error?: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  success?: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
}

export function parseGPSCoordinates(exif: PickedExif): {
  latitude?: number;
  longitude?: number;
} {
  try {
    let latitude: number | undefined;
    let longitude: number | undefined;

    if (exif.GPSLatitude !== undefined && exif.GPSLongitude !== undefined) {
      latitude = Number(exif.GPSLatitude);
      longitude = Number(exif.GPSLongitude);
    }

    if (latitude === undefined || longitude === undefined) {
      return {};
    }

    if (exif.GPSLatitudeRef === "S" || exif.GPSLatitudeRef === "South") {
      latitude = -Math.abs(latitude);
    }
    if (exif.GPSLongitudeRef === "W" || exif.GPSLongitudeRef === "West") {
      longitude = -Math.abs(longitude);
    }

    return { latitude, longitude };
  } catch {
    return {};
  }
}

export async function extractLocationFromGPS(
  latitude: number,
  longitude: number,
  provider: GeocodingProvider,
  logger?: GPSLogger,
): Promise<LocationInfo | null> {
  const log = logger ?? getPhotoProcessingLoggers().location;

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    log.warn(`无效的 GPS 坐标: ${latitude}, ${longitude}`);
    return null;
  }

  log.info(`反向地理编码坐标: ${latitude}, ${longitude}`);

  try {
    const locationInfo = await provider.reverseGeocode(latitude, longitude);

    if (locationInfo) {
      log.success?.(
        `位置已找到: ${locationInfo.city}, ${locationInfo.country}`,
      );
    } else {
      log.warn("未找到位置信息");
    }

    return locationInfo;
  } catch (error) {
    log.error?.("位置提取失败:", error);
    return null;
  }
}
