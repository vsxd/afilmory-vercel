import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
  LocationAdminInfo,
  LocationInfo,
  ManifestIndexes,
  ManifestSource,
  PhotoManifestItem,
  PhotoProcessingFingerprints,
  PickedExif,
  ToneAnalysis,
  ToneType,
  VideoSource,
} from "./types.ts";
import {
  AFILMORY_MANIFEST_SCHEMA,
  CURRENT_MANIFEST_VERSION,
} from "./version.ts";

const UNKNOWN_SOURCE: ManifestSource = { provider: "unknown" };
const DANGEROUS_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const VALID_TONE_TYPES = new Set<ToneType>([
  "low-key",
  "high-key",
  "normal",
  "high-contrast",
]);

export class ManifestValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid Afilmory manifest: ${issues.join("; ")}`);
    this.name = "ManifestValidationError";
    this.issues = issues;
  }
}

export type ManifestValidationResult =
  | {
      success: true;
      manifest: AfilmoryManifest;
    }
  | {
      success: false;
      issues: string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * 解析层只把「无法安全用作路由段/文件名成分」的 id 判为致命：路径分隔符、
 * 控制字符、空串或离谱长度。完整的可移植性规则（NFC、Windows 保留名、170 字节、
 * 尾部点/空格）只在铸造新 id 时由 builder 的 createPhotoId 强制——旧 manifest 里
 * 由旧版 builder 铸造的 id（NFD、大小写变体、含 ':' 等）必须原样保留，否则照片
 * 从图库消失且已发布的 /photos/<id> 永久链接会被换新（见 id.ts 的 reuse 契约）。
 */
const isSafePhotoId = (value: unknown): value is string => {
  if (!isNonEmptyString(value)) return false;
  // These segments collapse in both URLs and static output paths, so they
  // cannot identify a photo even when the manifest preserves them verbatim.
  if (value === "." || value === "..") return false;
  if (new TextEncoder().encode(value).length > 512) return false;
  return (
    !/[/\\]/.test(value) &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      // Iteration combines valid surrogate pairs. Remaining lone surrogates
      // would make encodeURIComponent throw during route/RSS/SEO generation.
      return codePoint <= 0x1f || (codePoint >= 0xd800 && codePoint <= 0xdfff);
    })
  );
};

const isDateString = (value: unknown): value is string =>
  isNonEmptyString(value) && Number.isFinite(Date.parse(value));

const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const isPositiveNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  (value as number) > 0 &&
  (value as number) <= 1_000_000;

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

const isPercentage = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= 100;

const isRatio = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= 1;

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

// ---------------------------------------------------------------------------
// 字段描述符：同一形状只描述一次，严格校验（check → issues）与宽松抢救
// （normalize → 默认值/丢弃）都从这一份描述派生，不再维护 validateX/normalizeX
// 双胞胎。check 返回相对路径 issue（以 " 自身文案"、".子字段" 或 "[下标]" 开头），
// 由上层拼接完整路径。
// ---------------------------------------------------------------------------

interface Field<T> {
  check: (value: unknown) => string[];
  normalize: (value: unknown) => T;
  /** normalize 时该字段不合法则整个对象放弃（判别/寻址字段，如 camera.model） */
  required?: boolean;
  /** normalize 结果为 undefined 时不写入键（保持历史输出形状：photo.isHDR/video 缺席） */
  omitUndefined?: boolean;
}

type Shape = Record<string, Field<unknown>>;

// Shape 与产出类型没有静态关联，而 normalizeShape 只拷贝 shape 里声明的键——
// 目标类型新增字段却漏写描述符时会编译通过、字段被两个入口静默剥掉。各 shape
// 声明处用 `satisfies ShapeFor<目标类型>` 把"每个键都有描述符"变成编译期约束
// （Field 对 T 协变，Field<T[K]> 仍可赋给 Field<unknown>，运行时不受影响）。
type ShapeFor<T> = { [K in keyof T]-?: Field<T[K]> };

function field<T>(
  guard: (value: unknown) => value is T,
  message: string,
  fallback: T,
): Field<T> {
  return {
    check: (value) => (guard(value) ? [] : [` ${message}`]),
    normalize: (value) => (guard(value) ? value : fallback),
  };
}

function requiredField<T>(
  guard: (value: unknown) => value is T,
  message: string,
): Field<T> {
  return {
    check: (value) => (guard(value) ? [] : [` ${message}`]),
    // guard 失败时 normalizeShape 已放弃整个对象，这里不会拿到非法值
    normalize: (value) => value as T,
    required: true,
  };
}

function optionalField<T>(
  guard: (value: unknown) => value is T,
  message: string,
  omitUndefined = false,
): Field<T | undefined> {
  return {
    check: (value) =>
      value === undefined || guard(value) ? [] : [` ${message}`],
    normalize: (value) => (guard(value) ? value : undefined),
    omitUndefined,
  };
}

function checkShape(shape: Shape, value: Record<string, unknown>): string[] {
  const issues: string[] = [];
  for (const [key, item] of Object.entries(shape)) {
    for (const message of item.check(value[key])) {
      issues.push(`.${key}${message}`);
    }
  }
  return issues;
}

function normalizeShape<T>(
  shape: Shape,
  value: Record<string, unknown>,
): T | null {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(shape)) {
    if (item.required && item.check(value[key]).length > 0) return null;
    const normalized = item.normalize(value[key]);
    if (normalized === undefined && item.omitUndefined) continue;
    result[key] = normalized;
  }
  return result as T;
}

function arrayField<T>(shape: Shape): Field<T[]> {
  return {
    check: (value) => {
      if (!Array.isArray(value)) return [" must be an array"];
      const issues: string[] = [];
      for (const [index, item] of value.entries()) {
        if (!isRecord(item)) {
          issues.push(`[${index}] must be an object`);
          continue;
        }
        for (const message of checkShape(shape, item)) {
          issues.push(`[${index}]${message}`);
        }
      }
      return issues;
    },
    normalize: (value) =>
      Array.isArray(value)
        ? value.flatMap((item) => {
            const normalized = isRecord(item)
              ? normalizeShape<T>(shape, item)
              : null;
            return normalized ? [normalized] : [];
          })
        : [],
  };
}

// 常用字段的简写工厂（文案与历史 issue 逐字一致）
const str = () => field(isString, "must be a string", "");
const requiredStr = () =>
  requiredField(isNonEmptyString, "must be a non-empty string");
const nonEmptyStr = () =>
  requiredField(isNonEmptyString, "must be a non-empty string");
const optStr = (message = "must be a string") =>
  optionalField(isString, message);
const presentStr = () => optStr("must be a string when present");

// —— source ——

type S3Source = Extract<ManifestSource, { provider: "s3" }>;
type LocalSource = Extract<ManifestSource, { provider: "local" }>;

const s3SourceShape: Shape = {
  bucket: presentStr(),
  region: presentStr(),
  endpoint: presentStr(),
  prefix: presentStr(),
  customDomain: presentStr(),
} satisfies ShapeFor<Omit<S3Source, "provider">>;

const localSourceShape: Shape = {
  basePath: presentStr(),
  baseUrl: presentStr(),
} satisfies ShapeFor<Omit<LocalSource, "provider">>;

const sourceField: Field<ManifestSource> = {
  check: (value) => {
    if (!isRecord(value)) return [" must be an object"];
    if (value.provider === "unknown") return [];
    if (value.provider === "s3") return checkShape(s3SourceShape, value);
    if (value.provider === "local") return checkShape(localSourceShape, value);
    return [".provider must be 's3', 'local' or 'unknown'"];
  },
  normalize: (value) => {
    if (!isRecord(value)) return UNKNOWN_SOURCE;
    if (value.provider === "s3") {
      return {
        provider: "s3",
        ...normalizeShape<Omit<S3Source, "provider">>(s3SourceShape, value),
      };
    }
    if (value.provider === "local") {
      return {
        provider: "local",
        ...normalizeShape<Omit<LocalSource, "provider">>(
          localSourceShape,
          value,
        ),
      };
    }
    return UNKNOWN_SOURCE;
  },
};

// —— indexes ——

const cameraShape: Shape = {
  make: requiredStr(),
  model: requiredStr(),
  displayName: requiredStr(),
} satisfies ShapeFor<CameraInfo>;

const lensShape: Shape = {
  make: optStr(),
  model: requiredStr(),
  displayName: requiredStr(),
} satisfies ShapeFor<LensInfo>;

const indexesShape: Shape = {
  cameras: arrayField<CameraInfo>(cameraShape),
  lenses: arrayField<LensInfo>(lensShape),
} satisfies ShapeFor<ManifestIndexes>;

function normalizeIndexes(value: unknown): ManifestIndexes {
  return (
    (isRecord(value) &&
      normalizeShape<ManifestIndexes>(indexesShape, value)) || {
      cameras: [],
      lenses: [],
    }
  );
}

// —— toneAnalysis / location（null 表示"缺失"，undefined 与其他类型都非法）——

function nullableObjectField<T>(shape: Shape): Field<T | null> {
  return {
    check: (value) => {
      if (value === null) return [];
      if (!isRecord(value)) return [" must be null or an object"];
      return checkShape(shape, value);
    },
    normalize: (value) =>
      isRecord(value) ? normalizeShape<T>(shape, value) : null,
  };
}

const isToneType = (value: unknown): value is ToneType =>
  typeof value === "string" && VALID_TONE_TYPES.has(value as ToneType);

const toneAnalysisShape: Shape = {
  toneType: field(isToneType, "is invalid", "normal" as ToneType),
  brightness: field(isPercentage, "must be between 0 and 100", 0),
  contrast: field(isPercentage, "must be between 0 and 100", 0),
  shadowRatio: field(isRatio, "must be between 0 and 1", 0),
  highlightRatio: field(isRatio, "must be between 0 and 1", 0),
} satisfies ShapeFor<ToneAnalysis>;

const toneAnalysisField = nullableObjectField<ToneAnalysis>(toneAnalysisShape);

// Omit 列出的键不进 shape，由 locationField.normalize 手工抢救（见下）；
// LocationInfo 新增字段会在这里编译失败，倒逼作者显式选择两种归属之一。
const locationShape: Shape = {
  latitude: field(
    (value): value is number =>
      isFiniteNumber(value) && value >= -90 && value <= 90,
    "must be between -90 and 90",
    0,
  ),
  longitude: field(
    (value): value is number =>
      isFiniteNumber(value) && value >= -180 && value <= 180,
    "must be between -180 and 180",
    0,
  ),
} satisfies ShapeFor<
  Omit<
    LocationInfo,
    | "admin"
    | "adminI18n"
    | "adminKey"
    | "country"
    | "city"
    | "locationName"
    | "locationNameI18n"
  >
>;

// 键值对逐条抢救：坏值丢弃，全空则整体视为缺失（undefined）
function normalizeRecordOf<T>(
  value: unknown,
  normalizeItem: (item: unknown) => T | undefined,
): Record<string, T> | undefined {
  if (!isRecord(value)) return undefined;
  const record: Record<string, T> = {};
  for (const [key, item] of Object.entries(value)) {
    if (DANGEROUS_OBJECT_KEYS.has(key)) continue;
    const normalized = normalizeItem(item);
    if (normalized !== undefined) record[key] = normalized;
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

const adminInfoShape: Shape = {
  country: optStr(),
  countryCode: optStr(),
  region: optStr(),
  city: optStr(),
  district: optStr(),
} satisfies ShapeFor<LocationAdminInfo>;

function normalizeAdminInfo(value: unknown): LocationAdminInfo | undefined {
  if (!isRecord(value)) return undefined;
  const admin = normalizeShape<LocationAdminInfo>(
    adminInfoShape,
    value,
  ) as LocationAdminInfo;
  return Object.values(admin).some(Boolean) ? admin : undefined;
}

const locationField: Field<LocationInfo | null> = {
  check: nullableObjectField<LocationInfo>(locationShape).check,
  // admin/i18n 等字段严格模式从不校验（历史行为），仅在归一化时尽力抢救
  normalize: (value) => {
    if (!isRecord(value)) return null;
    const location = normalizeShape<LocationInfo>(
      locationShape,
      value,
    ) as LocationInfo;
    const admin = normalizeAdminInfo(value.admin);
    if (admin) location.admin = admin;
    const adminI18n = normalizeRecordOf(value.adminI18n, normalizeAdminInfo);
    if (adminI18n) location.adminI18n = adminI18n;
    const adminKey = normalizeAdminInfo(value.adminKey);
    if (adminKey) location.adminKey = adminKey;
    if (typeof value.country === "string") location.country = value.country;
    if (typeof value.city === "string") location.city = value.city;
    if (typeof value.locationName === "string") {
      location.locationName = value.locationName;
    }
    const locationNameI18n = normalizeRecordOf(
      value.locationNameI18n,
      (item) => (typeof item === "string" ? item : undefined),
    );
    if (locationNameI18n) location.locationNameI18n = locationNameI18n;
    return location;
  },
};

// —— video（可选字段：undefined 合法；type 判别的联合）——

type LivePhoto = Extract<VideoSource, { type: "live-photo" }>;
type MotionPhoto = Extract<VideoSource, { type: "motion-photo" }>;

const livePhotoShape: Shape = {
  videoUrl: nonEmptyStr(),
  s3Key: nonEmptyStr(),
  version: presentStr(),
} satisfies ShapeFor<Omit<LivePhoto, "type">>;

const motionPhotoShape: Shape = {
  offset: requiredField(isNonNegativeNumber, "must be a non-negative number"),
  size: optionalField(isNonNegativeNumber, "must be a non-negative number"),
  presentationTimestamp: optionalField(
    isNonNegativeNumber,
    "must be a non-negative number",
  ),
} satisfies ShapeFor<Omit<MotionPhoto, "type">>;

const videoField: Field<VideoSource | undefined> = {
  check: (value) => {
    if (value === undefined) return [];
    if (!isRecord(value)) return [" must be an object"];
    if (value.type === "live-photo") return checkShape(livePhotoShape, value);
    if (value.type === "motion-photo") {
      return checkShape(motionPhotoShape, value);
    }
    return [".type is invalid"];
  },
  normalize: (value) => {
    if (!isRecord(value)) return;
    if (value.type === "live-photo") {
      const live = normalizeShape<Omit<LivePhoto, "type">>(
        livePhotoShape,
        value,
      );
      return live ? { type: "live-photo", ...live } : undefined;
    }
    if (value.type === "motion-photo") {
      const motion = normalizeShape<Omit<MotionPhoto, "type">>(
        motionPhotoShape,
        value,
      );
      return motion ? { type: "motion-photo", ...motion } : undefined;
    }
    return;
  },
  omitUndefined: true,
};

// —— EXIF 消毒：丢弃结构性危险值，而非字段白名单 ——
// PickedExif 表面很宽、web 端 formatter 本身是防御式的；这里只保证"已验证"的
// manifest 不携带函数/类实例、循环引用、非有限数字等无法安全 JSON 序列化的值。

const INVALID_EXIF_VALUE = Symbol("invalid-exif-value");
const MAX_EXIF_DEPTH = 32;

function isPlainObject(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

function sanitizeExifValue(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number,
): unknown | typeof INVALID_EXIF_VALUE {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_EXIF_VALUE;
  }
  if (depth >= MAX_EXIF_DEPTH || typeof value !== "object") {
    return INVALID_EXIF_VALUE;
  }
  if (ancestors.has(value)) return INVALID_EXIF_VALUE;

  if (Array.isArray(value)) {
    ancestors.add(value);
    const sanitized: unknown[] = [];
    for (const item of value) {
      const safeItem = sanitizeExifValue(item, ancestors, depth + 1);
      if (safeItem === INVALID_EXIF_VALUE) {
        ancestors.delete(value);
        return INVALID_EXIF_VALUE;
      }
      sanitized.push(safeItem);
    }
    ancestors.delete(value);
    return sanitized;
  }

  if (!isPlainObject(value)) return INVALID_EXIF_VALUE;
  ancestors.add(value);
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    // JSON.parse 会把 __proto__ 还原成自有键；constructor/prototype 组合也会在
    // 后续深合并时形成原型污染路径，因此所有层级都显式丢弃。
    if (DANGEROUS_OBJECT_KEYS.has(key)) continue;
    const safeItem = sanitizeExifValue(item, ancestors, depth + 1);
    if (safeItem !== INVALID_EXIF_VALUE) sanitized[key] = safeItem;
  }
  ancestors.delete(value);
  return sanitized;
}

function normalizeExif(value: unknown): PickedExif | null {
  const sanitized = sanitizeExifValue(value, new WeakSet(), 0);
  if (
    sanitized === INVALID_EXIF_VALUE ||
    !isPlainObject(sanitized) ||
    Array.isArray(sanitized)
  ) {
    return null;
  }
  return sanitized as PickedExif;
}

// —— photo ——
// 键顺序即历史上 item 字面量的构造顺序，保证归一化输出的 JSON 键序不变。

const photoShape: Shape = {
  id: requiredField(isSafePhotoId, "must be a non-empty safe identifier"),
  originalUrl: nonEmptyStr(),
  thumbnailUrl: nonEmptyStr(),
  thumbHash: field(
    (value): value is string | null =>
      value === null ||
      (typeof value === "string" &&
        value.length > 0 &&
        value.length % 2 === 0 &&
        /^[\da-f]+$/i.test(value)),
    "must be null or a non-empty even-length hexadecimal string",
    null,
  ),
  width: field(isPositiveInteger, "must be a positive integer", 1),
  height: field(isPositiveInteger, "must be a positive integer", 1),
  aspectRatio: field(isPositiveNumber, "must be a positive number", 1),
  s3Key: nonEmptyStr(),
  lastModified: field(
    isDateString,
    "must be a non-empty valid date string",
    "1970-01-01T00:00:00.000Z",
  ),
  size: field(isNonNegativeNumber, "must be a non-negative number", 0),
  // etag 历史上从不参与校验（严格模式也放行任意类型），仅归一化
  etag: {
    check: () => [],
    normalize: (value) => (typeof value === "string" ? value : undefined),
  },
  exif: {
    check: (value) =>
      value === null || isRecord(value) ? [] : [" must be null or an object"],
    normalize: normalizeExif,
  },
  toneAnalysis: toneAnalysisField,
  location: locationField,
  title: str(),
  dateTaken: field(
    isDateString,
    "must be a non-empty valid date string",
    "1970-01-01T00:00:00.000Z",
  ),
  tags: {
    check: (value) => (isStringArray(value) ? [] : [" must be a string array"]),
    // 每次返回新数组，避免共享的 fallback 实例被调用方原地修改后串扰
    normalize: (value) => (isStringArray(value) ? value : []),
  },
  description: str(),
  isHDR: optionalField(isBoolean, "must be a boolean", true),
  video: videoField,
  processing: {
    check: (value) => {
      if (value === undefined) return [];
      if (!isRecord(value)) return [" must be an object when present"];
      const allowed = [
        "thumbnail",
        "exif",
        "tone",
        "media",
        "location",
        "privacy",
      ];
      return allowed.flatMap((key) =>
        value[key] === undefined || isNonEmptyString(value[key])
          ? []
          : [`.${key} must be a non-empty string when present`],
      );
    },
    normalize: (value) => {
      if (!isRecord(value)) return;
      const result: PhotoProcessingFingerprints = {};
      for (const key of [
        "thumbnail",
        "exif",
        "tone",
        "media",
        "location",
        "privacy",
      ] as const) {
        if (isNonEmptyString(value[key])) result[key] = value[key];
      }
      return Object.keys(result).length > 0 ? result : undefined;
    },
    omitUndefined: true,
  },
} satisfies ShapeFor<PhotoManifestItem>;

function validatePhoto(
  value: unknown,
  index: number,
): { item: PhotoManifestItem | null; issues: string[] } {
  // 每张照片用独立的 issues 数组，避免一张坏照片污染整个 manifest 的校验结果。
  // 严格模式由调用方把这些 issues 汇入共享数组；宽松模式据此只丢弃出错的照片。
  const path = `photos[${index}]`;
  if (!isRecord(value)) {
    return { item: null, issues: [`${path} must be an object`] };
  }
  const issues = checkShape(photoShape, value).map(
    (message) => `${path}${message}`,
  );
  const item = normalizeShape<PhotoManifestItem>(photoShape, value);
  if (item) {
    const expectedAspectRatio = item.width / item.height;
    const tolerance = Math.max(0.000_001, expectedAspectRatio * 0.01);
    if (Math.abs(item.aspectRatio - expectedAspectRatio) > tolerance) {
      issues.push(`${path}.aspectRatio must match width / height`);
      // Lenient output must itself satisfy the invariant so a failed repair can
      // still be used as a safe recovery baseline.
      item.aspectRatio = expectedAspectRatio;
    }
    if (item.video?.type === "live-photo" && item.video.s3Key === item.s3Key) {
      issues.push(`${path}.video.s3Key must reference a different object`);
      delete item.video;
    }
  }
  return { item, issues };
}

export function createManifest({
  generatedAt = new Date().toISOString(),
  indexes = { cameras: [], lenses: [] },
  photos = [],
  source = UNKNOWN_SOURCE,
}: {
  generatedAt?: string;
  indexes?: {
    cameras?: CameraInfo[];
    lenses?: LensInfo[];
  };
  photos?: PhotoManifestItem[];
  source?: ManifestSource;
} = {}): AfilmoryManifest {
  return {
    schema: AFILMORY_MANIFEST_SCHEMA,
    version: CURRENT_MANIFEST_VERSION,
    generatedAt,
    source,
    photos,
    indexes: {
      cameras: indexes.cameras ?? [],
      lenses: indexes.lenses ?? [],
    },
  };
}

export function createEmptyManifest(): AfilmoryManifest {
  return createManifest();
}

export function isAfilmoryManifest(input: unknown): input is AfilmoryManifest {
  return validateManifest(input).success;
}

/**
 * 信封层校验：schema/version/generatedAt/photos-是数组，是严格与宽松
 * 两个入口共用的硬性前提，只在这里描述一次。source 全仓无读方且 normalize
 * 总能抢救成合法值（最差退回 UNKNOWN_SOURCE），因此只在严格模式
 * （`strictSource`）算作致命——例如新增 provider 值不应砖掉已部署的旧解析方。
 * `collectMore` 供严格模式在 source 与 photos 检查之间插入 indexes 校验，
 * 保持历史 issue 顺序。
 */
function validateEnvelope(
  input: Record<string, unknown>,
  strictSource: boolean,
  collectMore?: (issues: string[]) => void,
): string[] {
  const issues: string[] = [];
  if (input.schema !== AFILMORY_MANIFEST_SCHEMA) {
    issues.push(`schema must be '${AFILMORY_MANIFEST_SCHEMA}'`);
  }
  if (input.version !== CURRENT_MANIFEST_VERSION) {
    issues.push(`version must be ${CURRENT_MANIFEST_VERSION}`);
  }
  if (!isDateString(input.generatedAt)) {
    issues.push("generatedAt must be a non-empty valid date string");
  }
  if (strictSource) {
    issues.push(
      ...sourceField.check(input.source).map((message) => `source${message}`),
    );
  }
  collectMore?.(issues);
  if (!Array.isArray(input.photos)) {
    issues.push("photos must be an array");
  }
  return issues;
}

export function validateManifest(input: unknown): ManifestValidationResult {
  if (!isRecord(input)) {
    return {
      success: false,
      issues: ["manifest must be an object"],
    };
  }

  const issues = validateEnvelope(input, true, (envelope) => {
    // indexes 只在严格模式整体校验；宽松模式视为派生数据、逐条抢救
    if (!isRecord(input.indexes)) {
      envelope.push("indexes must be an object");
    } else {
      envelope.push(
        ...checkShape(indexesShape, input.indexes).map(
          (message) => `indexes${message}`,
        ),
      );
    }
  });

  const photos: PhotoManifestItem[] = [];
  const idIndexes = new Map<string, number>();
  const keyIndexes = new Map<string, number>();
  if (Array.isArray(input.photos)) {
    for (const [index, photo] of input.photos.entries()) {
      const { item, issues: photoIssues } = validatePhoto(photo, index);
      issues.push(...photoIssues);
      if (item) {
        // 只判定字节级完全相同的 id 为重复：旧版 builder 合法产出过仅大小写/
        // Unicode 归一化不同的 id（不同照片），大小写折叠去重会误删其中一张。
        // 新 id 的跨文件系统碰撞由 builder 的 findPhotoIdCollisionKeys 在铸造时
        // 用 digest 后缀规避。
        const previousIdIndex = idIndexes.get(item.id);
        if (previousIdIndex !== undefined) {
          issues.push(
            `photos[${index}].id duplicates photos[${previousIdIndex}].id`,
          );
        } else {
          idIndexes.set(item.id, index);
        }
        const previousKeyIndex = keyIndexes.get(item.s3Key);
        if (previousKeyIndex !== undefined) {
          issues.push(
            `photos[${index}].s3Key duplicates photos[${previousKeyIndex}].s3Key`,
          );
        } else {
          keyIndexes.set(item.s3Key, index);
        }
        photos.push(item);
      }
    }
  }

  const normalizedIndexes = normalizeIndexes(input.indexes);
  const cameraNames = new Set<string>();
  for (const [index, camera] of normalizedIndexes.cameras.entries()) {
    if (cameraNames.has(camera.displayName)) {
      issues.push(`indexes.cameras[${index}].displayName must be unique`);
    }
    cameraNames.add(camera.displayName);
    const referenced = photos.some((photo) => {
      const make = photo.exif?.Make;
      const model = photo.exif?.Model;
      return (
        typeof make === "string" &&
        typeof model === "string" &&
        make.trim() === camera.make &&
        model.trim() === camera.model
      );
    });
    if (!referenced) {
      issues.push(`indexes.cameras[${index}] must reference a photo`);
    }
  }
  const lensNames = new Set<string>();
  for (const [index, lens] of normalizedIndexes.lenses.entries()) {
    if (lensNames.has(lens.displayName)) {
      issues.push(`indexes.lenses[${index}].displayName must be unique`);
    }
    lensNames.add(lens.displayName);
    const referenced = photos.some((photo) => {
      const model = photo.exif?.LensModel;
      const make = photo.exif?.LensMake;
      return (
        typeof model === "string" &&
        model.trim() === lens.model &&
        (lens.make === undefined ||
          (typeof make === "string" && make.trim() === lens.make))
      );
    });
    if (!referenced) {
      issues.push(`indexes.lenses[${index}] must reference a photo`);
    }
  }

  if (issues.length > 0) {
    return {
      success: false,
      issues,
    };
  }

  return {
    success: true,
    manifest: createManifest({
      generatedAt: input.generatedAt as string,
      source: sourceField.normalize(input.source),
      photos,
      indexes: normalizedIndexes,
    }),
  };
}

export function assertManifest(input: unknown): AfilmoryManifest {
  const result = validateManifest(input);
  if (!result.success) {
    throw new ManifestValidationError(result.issues);
  }
  return result.manifest;
}

export function parseManifest(input?: unknown): AfilmoryManifest {
  const result = validateManifest(input);
  return result.success ? result.manifest : createEmptyManifest();
}

export interface SkippedPhoto {
  index: number;
  issues: string[];
}

export interface RepairedPhoto extends SkippedPhoto {
  /** Normalized key used by the builder to force this cached item through the pipeline. */
  s3Key: string;
}

export interface LenientManifestParseResult {
  manifest: AfilmoryManifest;
  skipped: SkippedPhoto[];
  /** Photos retained after normalization but not safe to reuse as clean cache entries. */
  repaired: RepairedPhoto[];
}

/**
 * 宽松解析：信封层（schema/version/generatedAt、photos 是否为数组）仍严格——
 * 任一项无效都抛 {@link ManifestValidationError}，由调用方决定如何降级（运行时显示诊断页，
 * 构建期丢弃缓存做全量重建）。
 *
 * source 不算信封的一部分：全仓没有任何读方，损坏时由 sourceField.normalize 抢救
 * （最差退回 provider "unknown"），绝不因它砖掉一个本可正常渲染的图库。
 *
 * 派生 indexes 与照片逐条容错：坏的 camera/lens 条目由 normalizeIndexes 丢弃；照片仅在
 * 无法寻址（非对象，或缺 id/originalUrl/s3Key 核心字段）时丢弃并记入 `skipped`，可恢复的
 * 字段问题（损坏的可选字段、可默认的数值）由 normalizer 抢救后保留。绝不让一张坏照片或
 * 一个坏索引条目清空整个图库或砖掉后续构建。
 *
 * 严格完整性仍由 {@link assertManifest} 提供，用于"刚生成的 manifest"等构建闸门。
 */
export function parseManifestLenient(
  input: unknown,
): LenientManifestParseResult {
  if (!isRecord(input)) {
    throw new ManifestValidationError(["manifest must be an object"]);
  }

  const envelopeIssues = validateEnvelope(input, false);
  if (envelopeIssues.length > 0) {
    throw new ManifestValidationError(envelopeIssues);
  }

  // indexes 是派生数据：逐条容错。坏的 camera/lens 条目由 normalizeIndexes 丢弃，
  // 绝不因单个坏索引条目抛掉整个 manifest（normalizeIndexes 永远返回一个对象）。
  const indexes = normalizeIndexes(input.indexes);

  const photos: PhotoManifestItem[] = [];
  const skipped: SkippedPhoto[] = [];
  const repairedByIndex = new Map<number, RepairedPhoto>();
  const idIndexes = new Map<string, number>();
  const keyIndexes = new Map<string, number>();

  const markRepaired = (
    index: number,
    s3Key: string,
    repairIssues: string[],
  ) => {
    const previous = repairedByIndex.get(index);
    if (previous) {
      previous.issues.push(
        ...repairIssues.filter((issue) => !previous.issues.includes(issue)),
      );
    } else {
      repairedByIndex.set(index, { index, s3Key, issues: [...repairIssues] });
    }
  };

  for (const [index, photo] of (input.photos as unknown[]).entries()) {
    const { item, issues } = validatePhoto(photo, index);
    // 致命：无法构造照片对象，或缺少用于寻址/路由/查看的核心字段。其余问题
    // （损坏的可选字段、可默认的数值）已被 normalizer 抢救，照片仍能正常渲染，
    // 予以保留——只有真正无法使用的照片才丢弃并记入 `skipped`。
    if (!item) {
      skipped.push({ index, issues });
    } else {
      const duplicateIssues: string[] = [];
      // 与严格路径同理：只有字节级相同的 id 才是重复（大小写变体是旧版
      // builder 的合法产物，两张都必须保留）。
      const previousIdIndex = idIndexes.get(item.id);
      if (previousIdIndex !== undefined) {
        const issue = `photos[${index}].id duplicates photos[${previousIdIndex}].id`;
        duplicateIssues.push(issue);
        const previous = photos.find((candidate) => candidate.id === item.id);
        if (previous) markRepaired(previousIdIndex, previous.s3Key, [issue]);
      }
      const previousKeyIndex = keyIndexes.get(item.s3Key);
      if (previousKeyIndex !== undefined) {
        const issue = `photos[${index}].s3Key duplicates photos[${previousKeyIndex}].s3Key`;
        duplicateIssues.push(issue);
        const previous = photos.find(
          (candidate) => candidate.s3Key === item.s3Key,
        );
        if (previous) markRepaired(previousKeyIndex, previous.s3Key, [issue]);
      }
      if (duplicateIssues.length > 0) {
        skipped.push({ index, issues: [...issues, ...duplicateIssues] });
        continue;
      }

      idIndexes.set(item.id, index);
      keyIndexes.set(item.s3Key, index);
      photos.push(item);
      if (issues.length > 0) markRepaired(index, item.s3Key, issues);
    }
  }

  return {
    manifest: createManifest({
      generatedAt: input.generatedAt as string,
      source: sourceField.normalize(input.source),
      photos,
      indexes,
    }),
    skipped,
    repaired: [...repairedByIndex.values()].sort((a, b) => a.index - b.index),
  };
}
