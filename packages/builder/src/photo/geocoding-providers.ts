import {
  createLocationInfo,
  normalizeCountryCode,
  normalizeGeoValue,
  normalizeLocalizedAdminValue,
} from "@afilmory/schema";

import type { LocationAdminInfo, LocationInfo } from "../types/photo.js";
import { sleep } from "../utils/backoff.js";
import type { SequentialRateLimiter } from "./geocoding-rate-limiter.js";
import {
  applyInterprocessRateLimit,
  getRateLimiter,
} from "./geocoding-rate-limiter.js";
import { getPhotoProcessingLoggers } from "./logger-adapter.js";

export type GeocodingProviderName = "mapbox" | "nominatim" | "auto";

export interface GeocodingProvider {
  reverseGeocode: (lat: number, lon: number) => Promise<LocationInfo | null>;
}

const getBackoffDelay = (attempt: number, baseDelay: number): number => {
  const exponential = baseDelay * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelay;
  return exponential + jitter;
};

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

export class MapboxGeocodingProvider implements GeocodingProvider {
  private readonly accessToken: string;
  private readonly language: string | null;
  private readonly baseUrl = "https://api.mapbox.com";
  private readonly rateLimitMs = 100;
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

export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly baseUrl: string;
  private readonly language: string | null;
  private readonly userAgent: string;
  private readonly rateLimitMs = 1000;
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

export function createGeocodingProvider(
  provider: GeocodingProviderName,
  mapboxToken?: string,
  nominatimBaseUrl?: string,
  language?: string | null,
  userAgent?: string | null,
): GeocodingProvider | null {
  if ((provider === "mapbox" || provider === "auto") && mapboxToken) {
    return new MapboxGeocodingProvider(mapboxToken, language);
  }

  if (provider === "nominatim" || provider === "auto") {
    return new NominatimGeocodingProvider(
      nominatimBaseUrl,
      language,
      userAgent,
    );
  }

  return null;
}
