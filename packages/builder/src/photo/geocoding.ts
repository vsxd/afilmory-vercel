import {
  createLocationInfo,
  normalizeCountryCode,
  normalizeGeoValue,
  normalizeLocalizedAdminValue,
} from "@afilmory/schema";

import type {
  LocationAdminInfo,
  LocationInfo,
  PickedExif,
} from "../types/photo.js";
import { sleep } from "../utils/backoff.js";
import type { SequentialRateLimiter } from "./geocoding-rate-limiter.js";
import {
  applyInterprocessRateLimit,
  getRateLimiter,
} from "./geocoding-rate-limiter.js";
import { getPhotoProcessingLoggers } from "./logger-adapter.js";

const getBackoffDelay = (attempt: number, baseDelay: number): number => {
  const exponential = baseDelay * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelay;
  return exponential + jitter;
};

/**
 * 地理编码提供者接口
 */
export interface GeocodingProvider {
  reverseGeocode: (lat: number, lon: number) => Promise<LocationInfo | null>;
}

const cleanString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  return normalizeGeoValue(value);
};

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const normalized = cleanString(value);
    if (normalized) return normalized;
  }
  return undefined;
};

const firstLocalizedAdminString = (
  language: string | null,
  ...values: unknown[]
): string | undefined => {
  for (const value of values) {
    const normalized = normalizeLocalizedAdminValue(value, language);
    if (normalized) return normalized;
  }
  return undefined;
};

/**
 * Mapbox 地理编码提供者
 * 高精度商业地理编码服务，支持全球范围和多语言
 */
export class MapboxGeocodingProvider implements GeocodingProvider {
  private readonly accessToken: string;
  private readonly language: string | null;
  private readonly baseUrl = "https://api.mapbox.com";
  private readonly rateLimitMs = 100; // Mapbox 速率限制：1000次/分钟
  private readonly rateLimiter: SequentialRateLimiter;
  private readonly interprocessKey: string;
  private readonly maxRetries = 3;
  private readonly retryBaseDelayMs = 500;

  constructor(accessToken: string, language?: string | null) {
    this.accessToken = accessToken;
    this.language = language ?? null;
    this.rateLimiter = getRateLimiter(
      `mapbox:${accessToken}`,
      this.rateLimitMs,
    );
    this.interprocessKey = `mapbox:${accessToken}`;
  }

  async reverseGeocode(lat: number, lon: number): Promise<LocationInfo | null> {
    const log = getPhotoProcessingLoggers().location;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.applyRateLimit();

        const url = new URL("/search/geocode/v6/reverse", this.baseUrl);
        url.searchParams.set("access_token", this.accessToken);
        url.searchParams.set("longitude", lon.toString());
        url.searchParams.set("latitude", lat.toString());
        if (this.language) {
          url.searchParams.set("language", this.language);
        }

        log.info(`调用 Mapbox API: ${lat}, ${lon}`);

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(
            `Mapbox API 错误: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();

        if (!data || !data.features || data.features.length === 0) {
          log.warn("Mapbox API 未返回结果");
          return null;
        }

        // 取第一个最相关的结果
        const feature = data.features[0];
        const properties = feature.properties || {};
        const context = properties.context || {};

        const admin: LocationAdminInfo = {
          country: cleanString(context.country?.name),
          countryCode: normalizeCountryCode(
            context.country?.country_code ??
              context.country?.country_code_alpha_2,
          ),
          region: cleanString(context.region?.name),
          city: firstString(context.place?.name, context.locality?.name),
          district: firstString(
            context.district?.name,
            context.neighborhood?.name,
          ),
        };

        const locationName = firstString(
          properties.full_address,
          properties.place_formatted,
          properties.name,
        );

        log.success(`成功获取位置: ${admin.city}, ${admin.country}`);

        return createLocationInfo({
          latitude: lat,
          longitude: lon,
          admin,
          locationName,
        });
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        if (isLastAttempt) {
          log.error("Mapbox 反向地理编码失败:", error);
          break;
        }

        const delay = getBackoffDelay(attempt, this.retryBaseDelayMs);
        log.warn(
          `Mapbox API 调用失败，${Math.round(delay)}ms 后重试 (${attempt}/${this.maxRetries})`,
          error,
        );
        await sleep(delay);
      }
    }

    return null;
  }

  private async applyRateLimit(): Promise<void> {
    await this.rateLimiter.wait();
    await applyInterprocessRateLimit(this.interprocessKey, this.rateLimitMs);
  }
}

/**
 * OpenStreetMap Nominatim API 地理编码提供者
 * 免费的地理编码服务，适合开发和小规模使用
 */
export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly baseUrl: string;
  private readonly language: string | null;
  private readonly userAgent: string;
  private readonly rateLimitMs = 1000; // Nominatim 要求至少1秒间隔
  private readonly rateLimiter: SequentialRateLimiter;
  private readonly interprocessKey: string;
  private readonly maxRetries = 3;
  private readonly retryBaseDelayMs = 1000;

  constructor(
    baseUrl?: string,
    language?: string | null,
    userAgent?: string | null,
  ) {
    this.baseUrl = baseUrl || "https://nominatim.openstreetmap.org";
    this.language = language ?? null;
    this.userAgent = cleanString(userAgent) ?? "afilmory/1.0";
    this.rateLimiter = getRateLimiter(
      `nominatim:${this.baseUrl}`,
      this.rateLimitMs,
    );
    this.interprocessKey = `nominatim:${this.baseUrl}`;
  }

  async reverseGeocode(lat: number, lon: number): Promise<LocationInfo | null> {
    const log = getPhotoProcessingLoggers().location;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.applyRateLimit();

        const url = new URL("/reverse", this.baseUrl);
        url.searchParams.set("lat", lat.toString());
        url.searchParams.set("lon", lon.toString());
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        if (this.language) {
          url.searchParams.set("accept-language", this.language);
        }

        log.info(`调用 Nominatim API: ${lat}, ${lon}`);

        const response = await fetch(url.toString(), {
          headers: {
            "User-Agent": this.userAgent,
            ...(this.language ? { "Accept-Language": this.language } : {}),
          },
        });

        if (!response.ok) {
          throw new Error(
            `Nominatim API 错误: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();

        if (!data || data.error) {
          throw new Error(`Nominatim API 返回错误: ${data?.error}`);
        }

        const address = data.address || {};

        const admin: LocationAdminInfo = {
          country: firstLocalizedAdminString(
            this.language,
            address.country,
            address.country_code,
          ),
          countryCode: normalizeCountryCode(address.country_code),
          region: firstLocalizedAdminString(
            this.language,
            address.state,
            address.province,
            address.region,
          ),
          city: firstLocalizedAdminString(
            this.language,
            address.city,
            address.town,
            address.village,
            address.municipality,
          ),
          district: firstLocalizedAdminString(
            this.language,
            address.city_district,
            address.district,
            address.county,
            address.borough,
            address.suburb,
            address.neighbourhood,
          ),
        };

        const locationName = cleanString(data.display_name);

        log.success(`成功获取位置: ${admin.city}, ${admin.country}`);

        return createLocationInfo({
          latitude: lat,
          longitude: lon,
          admin,
          locationName,
        });
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        if (isLastAttempt) {
          log.error("Nominatim 反向地理编码失败:", error);
          break;
        }

        const delay = getBackoffDelay(attempt, this.retryBaseDelayMs);
        log.warn(
          `Nominatim API 调用失败，${Math.round(delay)}ms 后重试 (${attempt}/${this.maxRetries})`,
          error,
        );
        await sleep(delay);
      }
    }

    return null;
  }

  private async applyRateLimit(): Promise<void> {
    await this.rateLimiter.wait();
    await applyInterprocessRateLimit(this.interprocessKey, this.rateLimitMs);
  }
}

/**
 * 创建地理编码提供者实例
 * @param provider 提供者类型
 * @param mapboxToken Mapbox access token（可选）
 * @param nominatimBaseUrl Nominatim 基础 URL（可选）
 * @param language 首选语言（可选，逗号分隔的 BCP47 列表）
 */
export function createGeocodingProvider(
  provider: "mapbox" | "nominatim" | "auto",
  mapboxToken?: string,
  nominatimBaseUrl?: string,
  language?: string | null,
  userAgent?: string | null,
): GeocodingProvider | null {
  // 如果指定了 Mapbox 或自动模式且有 token，使用 Mapbox
  if ((provider === "mapbox" || provider === "auto") && mapboxToken) {
    return new MapboxGeocodingProvider(mapboxToken, language);
  }

  // 使用 Nominatim
  if (provider === "nominatim" || provider === "auto") {
    return new NominatimGeocodingProvider(
      nominatimBaseUrl,
      language,
      userAgent,
    );
  }

  return null;
}

/**
 * 从 EXIF GPS 数据中提取坐标
 * @param exif EXIF 数据
 * @returns 十进制坐标（latitude, longitude）
 */
export function parseGPSCoordinates(exif: PickedExif): {
  latitude?: number;
  longitude?: number;
} {
  const log = getPhotoProcessingLoggers().location;

  try {
    let latitude: number | undefined;
    let longitude: number | undefined;

    // 从 GPSLatitude 和 GPSLongitude 提取
    if (exif.GPSLatitude !== undefined && exif.GPSLongitude !== undefined) {
      latitude = Number(exif.GPSLatitude);
      longitude = Number(exif.GPSLongitude);
    }

    if (latitude === undefined || longitude === undefined) {
      return {};
    }

    // 应用 GPS 参考（南纬为负，西经为负）
    if (exif.GPSLatitudeRef === "S" || exif.GPSLatitudeRef === "South") {
      latitude = -Math.abs(latitude);
    }
    if (exif.GPSLongitudeRef === "W" || exif.GPSLongitudeRef === "West") {
      longitude = -Math.abs(longitude);
    }

    return { latitude, longitude };
  } catch (error) {
    log.error("解析 GPS 坐标失败:", error);
    return {};
  }
}

/**
 * 从 GPS 坐标提取位置信息（反向地理编码）
 * @param latitude 纬度
 * @param longitude 经度
 * @param provider 地理编码提供者
 * @returns 位置信息
 */
export async function extractLocationFromGPS(
  latitude: number,
  longitude: number,
  provider: GeocodingProvider,
): Promise<LocationInfo | null> {
  const log = getPhotoProcessingLoggers().location;

  // 验证坐标范围
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    log.warn(`无效的 GPS 坐标: ${latitude}, ${longitude}`);
    return null;
  }

  log.info(`反向地理编码坐标: ${latitude}, ${longitude}`);

  try {
    const locationInfo = await provider.reverseGeocode(latitude, longitude);

    if (locationInfo) {
      log.success(`位置已找到: ${locationInfo.city}, ${locationInfo.country}`);
    } else {
      log.warn("未找到位置信息");
    }

    return locationInfo;
  } catch (error) {
    log.error("位置提取失败:", error);
    return null;
  }
}

export { resetGeocodingRateLimitersForTests } from "./geocoding-rate-limiter.js";
