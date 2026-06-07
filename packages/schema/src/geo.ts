import type {
  LocationAdminInfo,
  LocationInfo,
  PhotoManifestItem,
} from "./types.ts";

export const GEOGRAPHIC_REGION_LEVELS = [
  "country",
  "region",
  "city",
  "district",
] as const;

export type GeoRegionLevel = (typeof GEOGRAPHIC_REGION_LEVELS)[number];

export type GeoFilterState = {
  selectedGeoCountries: string[];
  selectedGeoRegions: string[];
  selectedGeoCities: string[];
  selectedGeoDistricts: string[];
};

export type GeoAdminPath = {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  district?: string;
};

const levelLabels: Record<GeoRegionLevel, keyof LocationAdminInfo> = {
  country: "country",
  region: "region",
  city: "city",
  district: "district",
};

const previousLevels: Record<GeoRegionLevel, GeoRegionLevel[]> = {
  country: [],
  region: ["country"],
  city: ["country", "region"],
  district: ["country", "region", "city"],
};

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
  /(?:[区區县縣乡鄉镇鎮]|街道|新区|新區|社区|社區)$/;

export const normalizeGeoValue = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim().replaceAll(/\s+/g, " ");
  return normalized || undefined;
};

export const normalizeGeoKey = (
  value: string | undefined,
): string | undefined => normalizeGeoValue(value)?.toLocaleLowerCase("en-US");

export const normalizeCountryCode = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const code = normalizeGeoValue(value);
  return code ? code.toUpperCase() : undefined;
};

export const getLanguageCandidates = (language?: string | null): string[] => {
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

const prefersTraditionalChinese = (
  language: string | null | undefined,
): boolean => {
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

export const selectLocalizedAlias = (
  value: string,
  language?: string | null,
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

export const normalizeLocalizedAdminValue = (
  value: unknown,
  language?: string | null,
): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeGeoValue(value);
  return normalized ? selectLocalizedAlias(normalized, language) : undefined;
};

export const normalizeDisplayValue = (
  value: string | undefined,
  language?: string | null,
): string | undefined => {
  const normalized = normalizeGeoValue(value);
  return normalized ? selectLocalizedAlias(normalized, language) : undefined;
};

export const normalizeAdminInfo = (
  admin: LocationAdminInfo | undefined,
  location?: LocationInfo | null,
): LocationAdminInfo | null => {
  const normalizedAdmin: LocationAdminInfo = {
    country: normalizeGeoValue(admin?.country ?? location?.country),
    countryCode: normalizeGeoValue(admin?.countryCode),
    region: normalizeGeoValue(admin?.region),
    city: normalizeGeoValue(admin?.city ?? location?.city),
    district: normalizeGeoValue(admin?.district),
  };

  return Object.values(normalizedAdmin).some(Boolean) ? normalizedAdmin : null;
};

export const createLocationInfo = ({
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
  language?: string | null,
): LocationInfo => {
  const admin = location.admin ?? {};
  const normalizedAdmin: LocationAdminInfo = {
    country: normalizeLocalizedAdminValue(
      admin.country ?? location.country,
      language,
    ),
    countryCode: normalizeCountryCode(admin.countryCode),
    region: normalizeLocalizedAdminValue(admin.region, language),
    city: normalizeLocalizedAdminValue(admin.city ?? location.city, language),
    district: normalizeLocalizedAdminValue(admin.district, language),
  };

  return createLocationInfo({
    latitude: location.latitude,
    longitude: location.longitude,
    admin: normalizedAdmin,
    locationName: location.locationName,
  });
};

const isChinaAdmin = (admin: LocationAdminInfo): boolean =>
  normalizeGeoKey(admin.countryCode) === "cn" ||
  normalizeGeoKey(admin.country) === "china" ||
  normalizeGeoValue(admin.country) === "中国" ||
  normalizeGeoValue(admin.country) === "中國";

const isChinaDirectAdminRegion = (admin: LocationAdminInfo): boolean => {
  const region = normalizeGeoValue(admin.region);
  return Boolean(
    region && CHINA_DIRECT_ADMIN_REGION_KEYS.has(region.toLocaleLowerCase()),
  );
};

const looksLikeSubCityAdmin = (value: string | undefined): boolean => {
  const normalized = normalizeGeoValue(value);
  if (!normalized) return false;
  return (
    SUB_CITY_ADMIN_PATTERN.test(normalized) ||
    SUB_CITY_ADMIN_SUFFIX_PATTERN.test(normalized)
  );
};

const getLocalizedLocationName = (
  location: PhotoManifestItem["location"],
  language?: string | null,
): string | undefined => {
  if (!location) return undefined;

  for (const locale of getLanguageCandidates(language)) {
    const localizedName = normalizeGeoValue(
      location.locationNameI18n?.[locale],
    );
    if (localizedName) return localizedName;
  }

  return normalizeGeoValue(location.locationName);
};

const extractCityFromLocationName = (
  location: PhotoManifestItem["location"],
  admin: LocationAdminInfo,
  language?: string | null,
): string | undefined => {
  const locationName = getLocalizedLocationName(location, language);
  const region = normalizeGeoValue(admin.region);
  if (!locationName || !region) return undefined;

  const parts = locationName
    .split(",")
    .map((part) => normalizeGeoValue(part))
    .filter(Boolean);
  const regionIndex = parts.findLastIndex(
    (part) => normalizeGeoKey(part) === normalizeGeoKey(region),
  );
  if (regionIndex <= 0) return undefined;

  return parts
    .slice(0, regionIndex)
    .reverse()
    .find(
      (part) =>
        normalizeGeoKey(part) !== normalizeGeoKey(admin.city) &&
        normalizeGeoKey(part) !== normalizeGeoKey(admin.district),
    );
};

export const getCityLevelAdmin = (
  photo: PhotoManifestItem,
  admin: LocationAdminInfo,
  language?: string | null,
): LocationAdminInfo => {
  if (!isChinaAdmin(admin)) return admin;

  if (isChinaDirectAdminRegion(admin)) {
    return {
      ...admin,
      city: normalizeGeoValue(admin.region) ?? normalizeGeoValue(admin.city),
    };
  }

  if (!looksLikeSubCityAdmin(admin.city)) return admin;

  const city = extractCityFromLocationName(photo.location, admin, language);
  return city ? { ...admin, city } : admin;
};

export const getPhotoAdmin = (
  photo: PhotoManifestItem,
  language?: string | null,
): LocationAdminInfo | null => {
  const { location } = photo;
  if (!location) return null;

  for (const locale of getLanguageCandidates(language)) {
    const localizedAdmin = normalizeAdminInfo(location.adminI18n?.[locale]);
    if (localizedAdmin) return localizedAdmin;
  }

  return normalizeAdminInfo(location.admin ?? {}, location);
};

export const getPhotoAdminKey = (
  photo: PhotoManifestItem,
): LocationAdminInfo | null => {
  const { location } = photo;
  if (!location) return null;

  const adminKey = normalizeAdminInfo(location.adminKey);
  if (adminKey) return adminKey;

  const canonicalAdmin = normalizeAdminInfo(location.adminI18n?.en);
  if (canonicalAdmin) return canonicalAdmin;

  const admin = location.admin ?? {};
  const legacyAdmin: LocationAdminInfo = {
    country: normalizeGeoValue(admin.country ?? location.country),
    countryCode: normalizeGeoValue(admin.countryCode),
    region: normalizeGeoValue(admin.region),
    city: normalizeGeoValue(admin.city ?? location.city),
    district: normalizeGeoValue(admin.district),
  };

  return Object.values(legacyAdmin).some(Boolean) ? legacyAdmin : null;
};

export const getPhotoAdminForLevel = (
  photo: PhotoManifestItem,
  level: GeoRegionLevel,
  language?: string | null,
): LocationAdminInfo | null => {
  const admin = language
    ? getPhotoAdmin(photo, language)
    : getPhotoAdminKey(photo);
  if (!admin) return null;
  return level === "city" ? getCityLevelAdmin(photo, admin, language) : admin;
};

export const getGeoLevelValue = (
  admin: LocationAdminInfo,
  level: GeoRegionLevel,
): string | undefined => normalizeGeoValue(admin[levelLabels[level]]);

const getCountryKey = (admin: LocationAdminInfo): string | undefined =>
  normalizeGeoKey(admin.countryCode) ?? normalizeGeoKey(admin.country);

const getPathPart = (
  admin: LocationAdminInfo,
  level: GeoRegionLevel,
): string | undefined => {
  if (level === "country") {
    return getCountryKey(admin);
  }
  return normalizeGeoKey(getGeoLevelValue(admin, level));
};

export const getRegionAdminPath = (
  admin: LocationAdminInfo,
  level: GeoRegionLevel,
): GeoAdminPath | null => {
  const current = getGeoLevelValue(admin, level);
  if (!current) return null;

  const path: GeoAdminPath = {
    country: normalizeGeoValue(admin.country),
    countryCode: normalizeGeoValue(admin.countryCode),
  };

  if (level === "country") return path;

  path.region = normalizeGeoValue(admin.region);
  if (level === "region") return path;

  path.city = normalizeGeoValue(admin.city);
  if (level === "city") return path;

  path.district = normalizeGeoValue(admin.district);
  return path;
};

export const buildGeoRegionId = (
  admin: LocationAdminInfo,
  level: GeoRegionLevel,
): string | null => {
  if (!getGeoLevelValue(admin, level)) return null;

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
): Partial<Record<GeoRegionLevel, string>> => {
  return GEOGRAPHIC_REGION_LEVELS.reduce<
    Partial<Record<GeoRegionLevel, string>>
  >((ids, level) => {
    const admin = getPhotoAdminForLevel(photo, level);
    if (!admin) return ids;
    const id = buildGeoRegionId(admin, level);
    if (id) ids[level] = id;
    return ids;
  }, {});
};

export const photoMatchesGeoFilters = (
  photo: PhotoManifestItem,
  filters: GeoFilterState,
): boolean => {
  const regionIds = getPhotoRegionIds(photo);

  const matchesLevel = (selectedIds: string[], level: GeoRegionLevel) =>
    selectedIds.length === 0 || selectedIds.includes(regionIds[level] ?? "");

  return (
    matchesLevel(filters.selectedGeoCountries, "country") &&
    matchesLevel(filters.selectedGeoRegions, "region") &&
    matchesLevel(filters.selectedGeoCities, "city") &&
    matchesLevel(filters.selectedGeoDistricts, "district")
  );
};
