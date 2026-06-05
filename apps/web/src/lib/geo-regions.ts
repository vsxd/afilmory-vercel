import type { LocationAdminInfo, PhotoManifestItem } from "@afilmory/data";

import type {
  GeographicRegion,
  GeographicRegionLevel,
  PhotoMarker,
} from "~/types/map";

import { calculateMapBounds } from "./map-utils";

export const GEOGRAPHIC_REGION_LEVELS = [
  "country",
  "region",
  "city",
  "district",
] as const satisfies readonly GeographicRegionLevel[];

export type GeoFilterState = {
  selectedGeoCountries: string[];
  selectedGeoRegions: string[];
  selectedGeoCities: string[];
  selectedGeoDistricts: string[];
};

const levelLabels: Record<GeographicRegionLevel, keyof LocationAdminInfo> = {
  country: "country",
  region: "region",
  city: "city",
  district: "district",
};

const previousLevels: Record<GeographicRegionLevel, GeographicRegionLevel[]> = {
  country: [],
  region: ["country"],
  city: ["country", "region"],
  district: ["country", "region", "city"],
};

const normalizeValue = (value: string | undefined): string | undefined => {
  const normalized = value?.trim().replaceAll(/\s+/g, " ");
  return normalized || undefined;
};

const normalizeKey = (value: string | undefined): string | undefined =>
  normalizeValue(value)?.toLocaleLowerCase("en-US");

const TRADITIONAL_LANGUAGE_PATTERN = /^zh-(?:hant|tw|hk|mo)\b/i;
const SIMPLIFIED_LANGUAGE_PATTERN = /^zh-(?:hans|cn|sg)\b/i;
const SIMPLIFIED_ONLY_CHARS =
  "国兰伦苏广东门湾县区台后龙义乌宁厦宫丽桥泽罗汉爱约尔贝";
const TRADITIONAL_ONLY_CHARS =
  "國蘭倫蘇廣東門灣縣區臺後龍義烏寧廈宮麗橋澤羅漢愛約爾貝";
const SIMPLIFIED_ONLY_SET = new Set(Array.from(SIMPLIFIED_ONLY_CHARS));
const TRADITIONAL_ONLY_SET = new Set(Array.from(TRADITIONAL_ONLY_CHARS));
const CHINA_DIRECT_ADMIN_REGION_KEYS = new Set([
  "beijing",
  "北京市",
  "shanghai",
  "上海市",
  "tianjin",
  "天津市",
  "chongqing",
  "重庆市",
  "hong kong",
  "香港",
  "香港特别行政区",
  "香港特別行政區",
  "macau",
  "macao",
  "澳门",
  "澳門",
  "澳门特别行政区",
  "澳門特別行政區",
]);
const SUB_CITY_ADMIN_PATTERN =
  /\b(?:district|county|borough|sub-?district|new area|community)\b/i;
const SUB_CITY_ADMIN_SUFFIX_PATTERN =
  /(?:区|區|县|縣|街道|新区|新區|社区|社區|乡|鄉|镇|鎮)$/;

const prefersTraditionalChinese = (language: string | undefined): boolean => {
  if (!language) return false;
  return (
    TRADITIONAL_LANGUAGE_PATTERN.test(language) &&
    !SIMPLIFIED_LANGUAGE_PATTERN.test(language)
  );
};

const getScriptScore = (
  value: string,
  preferredTraditional: boolean,
): number => {
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

const selectLocalizedAlias = (value: string, language?: string): string => {
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

const normalizeDisplayValue = (
  value: string | undefined,
  language?: string,
): string | undefined => {
  const normalized = normalizeValue(value);
  return normalized ? selectLocalizedAlias(normalized, language) : undefined;
};

const getLanguageCandidates = (language?: string): string[] => {
  const normalized = language?.trim();
  const candidates = normalized ? [normalized] : [];
  const primary = normalized?.split("-")[0];

  if (primary && primary !== normalized) candidates.push(primary);
  if (primary === "ja") candidates.push("jp");
  if (primary === "jp") candidates.push("ja");
  if (primary === "zh" && normalized !== "zh-CN") candidates.push("zh-CN");
  candidates.push("en");

  return Array.from(new Set(candidates));
};

const isChinaAdmin = (admin: LocationAdminInfo): boolean =>
  normalizeKey(admin.countryCode) === "cn" ||
  normalizeKey(admin.country) === "china" ||
  normalizeValue(admin.country) === "中国" ||
  normalizeValue(admin.country) === "中國";

const isChinaDirectAdminRegion = (admin: LocationAdminInfo): boolean => {
  const region = normalizeValue(admin.region);
  return Boolean(
    region && CHINA_DIRECT_ADMIN_REGION_KEYS.has(region.toLocaleLowerCase()),
  );
};

const looksLikeSubCityAdmin = (value: string | undefined): boolean => {
  const normalized = normalizeValue(value);
  if (!normalized) return false;
  return (
    SUB_CITY_ADMIN_PATTERN.test(normalized) ||
    SUB_CITY_ADMIN_SUFFIX_PATTERN.test(normalized)
  );
};

const getLocalizedLocationName = (
  location: PhotoManifestItem["location"],
  language?: string,
): string | undefined => {
  if (!location) return undefined;

  for (const locale of getLanguageCandidates(language)) {
    const localizedName = normalizeValue(location.locationNameI18n?.[locale]);
    if (localizedName) return localizedName;
  }

  return normalizeValue(location.locationName);
};

const extractCityFromLocationName = (
  location: PhotoManifestItem["location"],
  admin: LocationAdminInfo,
  language?: string,
): string | undefined => {
  const locationName = getLocalizedLocationName(location, language);
  const region = normalizeValue(admin.region);
  if (!locationName || !region) return undefined;

  const parts = locationName
    .split(",")
    .map((part) => normalizeValue(part))
    .filter((part): part is string => Boolean(part));
  const regionIndex = parts.findLastIndex(
    (part) => normalizeKey(part) === normalizeKey(region),
  );
  if (regionIndex <= 0) return undefined;

  return parts
    .slice(0, regionIndex)
    .reverse()
    .find(
      (part) =>
        normalizeKey(part) !== normalizeKey(admin.city) &&
        normalizeKey(part) !== normalizeKey(admin.district),
    );
};

const getCityLevelAdmin = (
  photo: PhotoManifestItem,
  admin: LocationAdminInfo,
  language?: string,
): LocationAdminInfo => {
  if (!isChinaAdmin(admin)) return admin;

  if (isChinaDirectAdminRegion(admin)) {
    return {
      ...admin,
      city: normalizeValue(admin.region) ?? normalizeValue(admin.city),
    };
  }

  if (!looksLikeSubCityAdmin(admin.city)) return admin;

  const city = extractCityFromLocationName(photo.location, admin, language);
  return city ? { ...admin, city } : admin;
};

const getPhotoAdminForLevel = (
  photo: PhotoManifestItem,
  level: GeographicRegionLevel,
  language?: string,
): LocationAdminInfo | null => {
  const admin = language
    ? getPhotoAdmin(photo, language)
    : getPhotoAdminKey(photo);
  if (!admin) return null;
  return level === "city" ? getCityLevelAdmin(photo, admin, language) : admin;
};

const normalizeAdmin = (
  admin: LocationAdminInfo | undefined,
  location?: PhotoManifestItem["location"],
): LocationAdminInfo | null => {
  const normalizedAdmin: LocationAdminInfo = {
    country: normalizeValue(admin?.country ?? location?.country),
    countryCode: normalizeValue(admin?.countryCode),
    region: normalizeValue(admin?.region),
    city: normalizeValue(admin?.city ?? location?.city),
    district: normalizeValue(admin?.district),
  };

  return Object.values(normalizedAdmin).some(Boolean) ? normalizedAdmin : null;
};

export const getPhotoAdmin = (
  photo: PhotoManifestItem,
  language?: string,
): LocationAdminInfo | null => {
  const { location } = photo;
  if (!location) return null;

  for (const locale of getLanguageCandidates(language)) {
    const localizedAdmin = normalizeAdmin(location.adminI18n?.[locale]);
    if (localizedAdmin) return localizedAdmin;
  }

  return normalizeAdmin(location.admin ?? {}, location);
};

export const getPhotoAdminKey = (
  photo: PhotoManifestItem,
): LocationAdminInfo | null => {
  const { location } = photo;
  if (!location) return null;

  const adminKey = normalizeAdmin(location.adminKey);
  if (adminKey) return adminKey;

  const canonicalAdmin = normalizeAdmin(location.adminI18n?.en);
  if (canonicalAdmin) return canonicalAdmin;

  const admin = location.admin ?? {};
  const legacyAdmin: LocationAdminInfo = {
    country: normalizeValue(admin.country ?? location.country),
    countryCode: normalizeValue(admin.countryCode),
    region: normalizeValue(admin.region),
    city: normalizeValue(admin.city ?? location.city),
    district: normalizeValue(admin.district),
  };

  return Object.values(legacyAdmin).some(Boolean) ? legacyAdmin : null;
};

const getLevelValue = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): string | undefined => normalizeValue(admin[levelLabels[level]]);

const getCountryKey = (admin: LocationAdminInfo): string | undefined =>
  normalizeKey(admin.countryCode) ?? normalizeKey(admin.country);

const getPathPart = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): string | undefined => {
  if (level === "country") {
    return getCountryKey(admin);
  }
  return normalizeKey(getLevelValue(admin, level));
};

export const getRegionAdminPath = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): GeographicRegion["adminPath"] | null => {
  const current = getLevelValue(admin, level);
  if (!current) return null;

  const path: GeographicRegion["adminPath"] = {
    country: normalizeValue(admin.country),
    countryCode: normalizeValue(admin.countryCode),
  };

  if (level === "country") return path;

  path.region = normalizeValue(admin.region);
  if (level === "region") return path;

  path.city = normalizeValue(admin.city);
  if (level === "city") return path;

  path.district = normalizeValue(admin.district);
  return path;
};

export const buildGeoRegionId = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): string | null => {
  if (!getLevelValue(admin, level)) return null;

  const levels = [...previousLevels[level], level];
  const parts = levels.flatMap((itemLevel) => {
    const part = getPathPart(admin, itemLevel);
    return part ? [`${itemLevel}=${encodeURIComponent(part)}`] : [];
  });

  if (parts.length === 0) return null;
  return `${level}:${parts.join("|")}`;
};

export const getPhotoRegionIds = (
  photo: PhotoManifestItem,
): Partial<Record<GeographicRegionLevel, string>> => {
  return GEOGRAPHIC_REGION_LEVELS.reduce<
    Partial<Record<GeographicRegionLevel, string>>
  >((ids, level) => {
    const admin = getPhotoAdminForLevel(photo, level);
    if (!admin) return ids;
    const id = buildGeoRegionId(admin, level);
    if (id) ids[level] = id;
    return ids;
  }, {});
};

const createRegionLabel = (
  admin: LocationAdminInfo,
  level: GeographicRegionLevel,
): string => getLevelValue(admin, level) ?? "Unknown";

export function createGeographicRegions(
  markers: PhotoMarker[],
  level: GeographicRegionLevel,
): GeographicRegion[] {
  const groups = new Map<
    string,
    {
      label: string;
      adminPath: GeographicRegion["adminPath"];
      markers: PhotoMarker[];
    }
  >();

  for (const marker of markers) {
    const adminKey = getPhotoAdminForLevel(marker.photo, level);
    if (!adminKey) continue;

    const id = buildGeoRegionId(adminKey, level);
    const adminPath = getRegionAdminPath(adminKey, level);
    if (!id || !adminPath) continue;

    const existing = groups.get(id);
    if (existing) {
      existing.markers.push(marker);
      continue;
    }

    groups.set(id, {
      label: createRegionLabel(adminKey, level),
      adminPath,
      markers: [marker],
    });
  }

  return Array.from(groups.entries())
    .map(([id, group]): GeographicRegion | null => {
      const bounds = calculateMapBounds(group.markers);
      const representativeMarker = group.markers[0];
      if (!bounds || !representativeMarker) return null;

      return {
        id,
        level,
        label: group.label,
        adminPath: group.adminPath,
        longitude: bounds.centerLng,
        latitude: bounds.centerLat,
        photoIds: group.markers.map((marker) => marker.photo.id),
        photoCount: group.markers.length,
        representativeMarker,
        markers: group.markers,
        bounds,
      };
    })
    .filter((region): region is GeographicRegion => region !== null)
    .sort((a, b) => {
      const firstIndex = markers.findIndex((marker) =>
        a.photoIds.includes(marker.photo.id),
      );
      const secondIndex = markers.findIndex((marker) =>
        b.photoIds.includes(marker.photo.id),
      );
      return firstIndex - secondIndex;
    });
}

export function createRegionMarker(region: GeographicRegion): PhotoMarker {
  return {
    ...region.representativeMarker,
    id: region.id,
    longitude: region.longitude,
    latitude: region.latitude,
  };
}

export function createRegionMarkers(
  regions: GeographicRegion[],
): PhotoMarker[] {
  return regions.map(createRegionMarker);
}

export function getRegionDisplayName(
  region: GeographicRegion,
  language?: string,
): string {
  const displayAdmin = getPhotoAdminForLevel(
    region.representativeMarker.photo,
    region.level,
    language,
  );
  const displayPath = displayAdmin
    ? getRegionAdminPath(displayAdmin, region.level)
    : null;
  const adminPath = displayPath ?? region.adminPath;
  const parts = [
    adminPath.country,
    adminPath.region,
    adminPath.city,
    adminPath.district,
  ]
    .flatMap((part) => {
      const normalized = normalizeDisplayValue(part, language);
      return normalized ? [normalized] : [];
    })
    .filter((part, index, array) => array.indexOf(part) === index);

  return (
    parts.join(" / ") ||
    normalizeDisplayValue(region.label, language) ||
    region.label
  );
}

export const getRegionLevelForZoom = (zoom: number): GeographicRegionLevel => {
  if (zoom < 4) return "country";
  if (zoom < 7) return "region";
  if (zoom < 10) return "city";
  return "district";
};

export const photoMatchesGeoFilters = (
  photo: PhotoManifestItem,
  filters: GeoFilterState,
): boolean => {
  const regionIds = getPhotoRegionIds(photo);

  const matchesLevel = (selectedIds: string[], level: GeographicRegionLevel) =>
    selectedIds.length === 0 || selectedIds.includes(regionIds[level] ?? "");

  return (
    matchesLevel(filters.selectedGeoCountries, "country") &&
    matchesLevel(filters.selectedGeoRegions, "region") &&
    matchesLevel(filters.selectedGeoCities, "city") &&
    matchesLevel(filters.selectedGeoDistricts, "district")
  );
};
