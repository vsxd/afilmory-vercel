// 扫描进度接口
export interface ScanProgress {
  currentPath: string;
  filesScanned: number;
  totalFiles?: number;
}

// 进度回调类型
export type ProgressCallback = (progress: ScanProgress) => void;

// 存储对象的通用接口
export interface StorageObject {
  key: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
}

export interface StorageUploadOptions {
  contentType?: string;
  /** 上传对象的 Cache-Control 元数据（S3 在响应中原样返回，决定浏览器/CDN 缓存行为） */
  cacheControl?: string;
}

export const DEFAULT_MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_DOWNLOAD_MEMORY_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

export type StorageListingIncompleteCode =
  "max-file-limit" | "pagination-anomaly" | "provider-error";

/**
 * A storage listing is a snapshot only when `complete` is true.  Callers that
 * reconcile or delete artifacts must never infer removals from an incomplete
 * listing: doing so can turn a pagination hiccup or a safety limit into mass
 * deletion.
 */
export interface StorageListing<T = StorageObject> {
  objects: T[];
  complete: boolean;
  reason?: {
    code: StorageListingIncompleteCode;
    message: string;
  };
}

// 存储提供商的通用接口
export interface StorageProvider {
  /**
   * 从存储中获取文件
   * @param key 文件的键值/路径
   * @param logger 可选的日志记录器
   * @returns 文件的 Buffer 数据，如果不存在则返回 null
   */
  getFile: (key: string, signal?: AbortSignal) => Promise<Buffer | null>;

  /**
   * 列出存储中的所有图片文件
   * @returns 图片文件对象数组
   */
  listImages: () => Promise<StorageObject[]>;

  /**
   * 列出存储中的所有文件
   * @param progressCallback 可选的进度回调函数
   * @returns 所有文件对象数组
   */
  listAllFiles: (
    progressCallback?: ProgressCallback,
  ) => Promise<StorageObject[]>;

  /**
   * Completeness-aware variant used by the build workflow. `listAllFiles` is
   * retained for API compatibility, but destructive reconciliation must use
   * this method.
   */
  listAllFilesDetailed: (
    progressCallback?: ProgressCallback,
  ) => Promise<StorageListing>;

  /**
   * 生成文件的公共访问 URL
   * @param key 文件的键值/路径
   * @returns 公共访问 URL
   */
  generatePublicUrl: (key: string) => string | Promise<string>;

  /**
   * 检测 Live Photos 配对
   * @param allObjects 所有文件对象
   * @returns Live Photo 配对映射 (图片 key -> 视频对象)
   */
  detectLivePhotos: (allObjects: StorageObject[]) => Map<string, StorageObject>;

  /**
   * 从存储中删除文件
   */
  deleteFile: (key: string) => Promise<void>;

  /**
   * 列出指定前缀下的所有对象 key（不应用 exclude/maxFileLimit）。
   * 用于缩略图远端存储的孤儿清理等场景。
   */
  listObjectKeys: (prefix: string) => Promise<string[]>;

  /**
   * 向存储上传文件
   * @param key 文件的键值/路径
   * @param data 文件数据
   * @param options 上传选项
   */
  uploadFile: (
    key: string,
    data: Buffer,
    options?: StorageUploadOptions,
  ) => Promise<StorageObject>;

  /** Release sockets or other provider-owned resources. Idempotent. */
  dispose: () => void | Promise<void>;
}

export type S3Config = {
  /**
   * 判别字段。历史上 StorageConfig 就是 S3Config 的别名，早期配置文件可能没有
   * 写 provider——运行时缺失时由 normalizeStorageConfig 兜底成 "s3"。
   */
  provider: "s3";
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string;
  customDomain?: string;
  excludeRegex?: string;
  maxFileLimit?: number;
  /**
   * 是否强制 S3 客户端使用 path-style 请求（`endpoint/bucket/key`）。
   *
   * 不设置时由 resolveForcePathStyle（见 s3/client.ts）按 endpoint 推导，
   * 与 S3StorageProvider.generatePublicUrl 的 URL 风格保持一致：
   * AWS / 阿里云 OSS 用 virtual-hosted-style，其余自定义 endpoint
   * （MinIO 等自建服务）用 path-style。只有当推导结果与实际服务不符时
   * 才需要显式覆盖。
   */
  forcePathStyle?: boolean;
  // Network tuning (optional)
  keepAlive?: boolean;
  maxSockets?: number;
  connectionTimeoutMs?: number;
  socketTimeoutMs?: number;
  requestTimeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  retryMode?: "standard" | "adaptive" | "legacy";
  maxAttempts?: number;
  // Download concurrency limiter within a single process/worker
  downloadConcurrency?: number;
  /** Hard upper bound for one downloaded object (default: 1 GiB). */
  maxDownloadBytes?: number;
  /** Total bytes that concurrent downloads may buffer (default: 2 GiB). */
  downloadMemoryBudgetBytes?: number;
};

export type LocalConfig = {
  provider: "local";
  /** 照片源目录（本地文件系统路径），key 为相对该目录的 posix 路径 */
  basePath: string;
  /**
   * 生成 originalUrl 时的公共 URL 前缀，默认 "/originals"——
   * 与 apps/web 的 photos-static Vite 插件在 dev 下服务的路径一致。
   */
  baseUrl?: string;
  /** 排除 key 的正则表达式，语义与 S3Config.excludeRegex 对等 */
  excludeRegex?: string;
};

export type StorageConfig = S3Config | LocalConfig;

/**
 * 兼容旧配置：StorageConfig 曾经就是 S3Config，存量配置文件可能缺少 provider
 * 判别字段（config 装载层是未经校验的类型断言）。运行时缺失时默认按 "s3" 处理，
 * 保证既有配置无需修改即可继续工作。
 */
export function normalizeStorageConfig(config: StorageConfig): StorageConfig {
  if ((config as { provider?: string }).provider === undefined) {
    return { ...(config as S3Config), provider: "s3" };
  }
  return config;
}
