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

// 存储提供商的通用接口
export interface StorageProvider {
  /**
   * 从存储中获取文件
   * @param key 文件的键值/路径
   * @param logger 可选的日志记录器
   * @returns 文件的 Buffer 数据，如果不存在则返回 null
   */
  getFile: (key: string) => Promise<Buffer | null>;

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
}

export type S3Config = {
  provider: "s3";
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string;
  customDomain?: string;
  excludeRegex?: string;
  maxFileLimit?: number;
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
};

export type StorageConfig = S3Config;
