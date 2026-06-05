import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  LocationAdminInfo,
  LocationInfo,
  PickedExif,
} from "../types/photo.js";
import { sleep } from "../utils/backoff.js";
import { getGlobalLoggers } from "./logger-adapter.js";

const getBackoffDelay = (attempt: number, baseDelay: number): number => {
  const exponential = baseDelay * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelay;
  return exponential + jitter;
};

const INTERPROCESS_RATE_LIMIT_DIR = path.join(
  os.tmpdir(),
  "afilmory-geocoding-rate-limit",
);
const LOCK_RETRY_DELAY_MS = 50;
const LOCK_STALE_TIMEOUT_MS = 5 * 60_000;
let rateLimitDirReady: Promise<void> | null = null;

const ensureRateLimitDir = async (): Promise<void> => {
  if (!rateLimitDirReady) {
    rateLimitDirReady = fs
      .mkdir(INTERPROCESS_RATE_LIMIT_DIR, { recursive: true })
      .then(() => {});
  }
  await rateLimitDirReady;
};

const hashKey = (key: string): string =>
  createHash("sha1").update(key).digest("hex");

const getRateLimitPaths = (
  key: string,
): { lockPath: string; timestampPath: string } => {
  const hashedKey = hashKey(key);
  return {
    lockPath: path.join(INTERPROCESS_RATE_LIMIT_DIR, `${hashedKey}.lock`),
    timestampPath: path.join(INTERPROCESS_RATE_LIMIT_DIR, `${hashedKey}.ts`),
  };
};

async function tryRemoveLock(lockPath: string): Promise<void> {
  await fs.rm(lockPath, { force: true }).catch(() => {});
}

const isLockStale = async (lockPath: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(lockPath);
    return Date.now() - stat.mtimeMs > LOCK_STALE_TIMEOUT_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

async function withInterprocessLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  await ensureRateLimitDir();
  const { lockPath } = getRateLimitPaths(key);

  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.write(`${process.pid}:${Date.now()}`);
      await handle.close();

      try {
        const result = await fn();
        return result;
      } finally {
        await tryRemoveLock(lockPath);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "EEXIST") {
        if (await isLockStale(lockPath)) {
          await tryRemoveLock(lockPath);
          continue;
        }
        await sleep(LOCK_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
}

const applyInterprocessRateLimit = async (
  key: string,
  intervalMs: number,
): Promise<void> => {
  const { timestampPath } = getRateLimitPaths(key);

  await withInterprocessLock(key, async () => {
    let lastRequestTime = 0;
    try {
      const stat = await fs.stat(timestampPath);
      lastRequestTime = stat.mtimeMs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < intervalMs) {
      await sleep(intervalMs - elapsed);
    }

    await fs.writeFile(timestampPath, `${Date.now()}`);
  });
};

class SequentialRateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private lastTimestamp = 0;

  constructor(private readonly intervalMs: number) {}

  wait(): Promise<void> {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastTimestamp;
      const delay = elapsed < this.intervalMs ? this.intervalMs - elapsed : 0;

      if (delay > 0) {
        await sleep(delay);
      }

      this.lastTimestamp = Date.now();
    });

    return this.queue;
  }
}

interface RateLimiterRegistryGlobal {
  __afilmoryGeocodingRateLimiters?: Map<string, SequentialRateLimiter>;
}

const getGlobalRateLimiter = (
  key: string,
  intervalMs: number,
): SequentialRateLimiter => {
  const globalObject = globalThis as typeof globalThis &
    RateLimiterRegistryGlobal;

  if (!globalObject.__afilmoryGeocodingRateLimiters) {
    globalObject.__afilmoryGeocodingRateLimiters = new Map();
  }

  const existing = globalObject.__afilmoryGeocodingRateLimiters.get(key);
  if (existing) {
    return existing;
  }

  const limiter = new SequentialRateLimiter(intervalMs);
  globalObject.__afilmoryGeocodingRateLimiters.set(key, limiter);
  return limiter;
};

/**
 * 地理编码提供者接口
 */
export interface GeocodingProvider {
  reverseGeocode: (lat: number, lon: number) => Promise<LocationInfo | null>;
}

const cleanString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const TRADITIONAL_LANGUAGE_PATTERN = /^zh-(?:hant|tw|hk|mo)\b/i;
const SIMPLIFIED_LANGUAGE_PATTERN = /^zh-(?:hans|cn|sg)\b/i;
const SIMPLIFIED_ONLY_CHARS =
  "国兰伦苏广东门湾县区台后龙义乌宁厦宫丽桥泽罗汉爱约尔贝";
const TRADITIONAL_ONLY_CHARS =
  "國蘭倫蘇廣東門灣縣區臺後龍義烏寧廈宮麗橋澤羅漢愛約爾貝";
const SIMPLIFIED_ONLY_SET = new Set(Array.from(SIMPLIFIED_ONLY_CHARS));
const TRADITIONAL_ONLY_SET = new Set(Array.from(TRADITIONAL_ONLY_CHARS));

const prefersTraditionalChinese = (language: string | null): boolean => {
  if (!language) return false;
  return (
    TRADITIONAL_LANGUAGE_PATTERN.test(language) &&
    !SIMPLIFIED_LANGUAGE_PATTERN.test(language)
  );
};

const getScriptScore = (value: string, preferredTraditional: boolean): number => {
  let simplifiedScore = 0;
  let traditionalScore = 0;

  for (const character of value) {
    if (SIMPLIFIED_ONLY_SET.has(character)) simplifiedScore += 1;
    if (TRADITIONAL_ONLY_SET.has(character)) traditionalScore += 1;
  }

  return preferredTraditional
    ? traditionalScore - simplifiedScore
    : simplifiedScore - traditionalScore;
};

const selectLocalizedAlias = (
  value: string,
  language: string | null,
): string => {
  const aliases = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  if (aliases.length <= 1) return value;

  const preferredTraditional = prefersTraditionalChinese(language);
  return aliases
    .map((alias, index) => ({
      alias,
      index,
      score: getScriptScore(alias, preferredTraditional),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0].alias;
};

const cleanLocalizedAdminString = (
  value: unknown,
  language: string | null,
): string | undefined => {
  const cleaned = cleanString(value);
  return cleaned ? selectLocalizedAlias(cleaned, language) : undefined;
};

const normalizeCountryCode = (value: unknown): string | undefined => {
  const code = cleanString(value);
  return code ? code.toUpperCase() : undefined;
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
    const normalized = cleanLocalizedAdminString(value, language);
    if (normalized) return normalized;
  }
  return undefined;
};

const createLocationInfo = ({
  latitude,
  longitude,
  admin,
  locationName,
}: {
  latitude: number;
  longitude: number;
  admin: LocationAdminInfo;
  locationName?: string;
}): LocationInfo => ({
  latitude,
  longitude,
  admin,
  country: admin.country,
  city: admin.city ?? admin.district ?? admin.region,
  locationName,
});

export const normalizeLocationInfoAdminAliases = (
  location: LocationInfo,
  language: string | null,
): LocationInfo => {
  const admin = location.admin ?? {};
  const normalizedAdmin: LocationAdminInfo = {
    country: cleanLocalizedAdminString(
      admin.country ?? location.country,
      language,
    ),
    countryCode: normalizeCountryCode(admin.countryCode),
    region: cleanLocalizedAdminString(admin.region, language),
    city: cleanLocalizedAdminString(admin.city ?? location.city, language),
    district: cleanLocalizedAdminString(admin.district, language),
  };

  return createLocationInfo({
    latitude: location.latitude,
    longitude: location.longitude,
    admin: normalizedAdmin,
    locationName: location.locationName,
  });
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
    this.rateLimiter = getGlobalRateLimiter(
      `mapbox:${accessToken}`,
      this.rateLimitMs,
    );
    this.interprocessKey = `mapbox:${accessToken}`;
  }

  async reverseGeocode(lat: number, lon: number): Promise<LocationInfo | null> {
    const log = getGlobalLoggers().location;

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
            context.country?.country_code ?? context.country?.country_code_alpha_2,
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
    this.rateLimiter = getGlobalRateLimiter(
      `nominatim:${this.baseUrl}`,
      this.rateLimitMs,
    );
    this.interprocessKey = `nominatim:${this.baseUrl}`;
  }

  async reverseGeocode(lat: number, lon: number): Promise<LocationInfo | null> {
    const log = getGlobalLoggers().location;

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
  const log = getGlobalLoggers().location;

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
  const log = getGlobalLoggers().location;

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
