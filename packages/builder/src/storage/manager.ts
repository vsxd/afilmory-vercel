import type { BuilderStorage } from "../core/contracts/storage.js";
import type {
  StorageConfig,
  StorageListing,
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
} from "./interfaces.js";
import { normalizeStorageConfig } from "./interfaces.js";
import { LocalFileSystemProvider } from "./providers/local-provider.js";
import { S3StorageProvider } from "./providers/s3-provider.js";

export class StorageManager implements BuilderStorage {
  private provider: StorageProvider;

  /**
   * 排除逻辑分两层，各司其职：
   * - provider 层只应用自身配置里的静态 excludeRegex（S3 / local 对等），在列举时生效；
   * - manager 层的 excludeFilters 是跨 provider 的动态过滤（如 thumbnail-storage
   *   插件排除远端缩略图前缀），provider 不得重复实现这类过滤。
   */
  private readonly excludeFilters: Array<(key: string) => boolean> = [];

  constructor(config: StorageConfig) {
    this.provider = this.createProvider(normalizeStorageConfig(config));
  }

  private applyExcludes<T extends StorageObject>(objects: T[]): T[] {
    if (this.excludeFilters.length === 0) {
      return objects;
    }

    return objects.filter((obj) => {
      const { key } = obj;
      if (!key) return true;
      return !this.excludeFilters.some((filter) => filter(key));
    });
  }

  /**
   * 从存储中获取文件
   * @param key 文件的键值/路径
   * @param logger 可选的日志记录器
   * @returns 文件的 Buffer 数据，如果不存在则返回 null
   */
  async getFile(key: string, signal?: AbortSignal): Promise<Buffer | null> {
    return this.provider.getFile(key, signal);
  }

  /**
   * 列出存储中的所有图片文件
   * @returns 图片文件对象数组
   */
  async listImages(): Promise<StorageObject[]> {
    const objects = await this.provider.listImages();
    return this.applyExcludes(objects);
  }

  /**
   * 列出存储中的所有文件
   * @returns 所有文件对象数组
   */
  async listAllFiles(): Promise<StorageObject[]> {
    const listing = await this.listAllFilesDetailed();
    return listing.objects;
  }

  async listAllFilesDetailed(): Promise<StorageListing> {
    const listing = await this.provider.listAllFilesDetailed();
    return {
      ...listing,
      objects: this.applyExcludes(listing.objects),
    };
  }

  /**
   * 生成文件的公共访问 URL
   * @param key 文件的键值/路径
   * @returns 公共访问 URL
   */
  async generatePublicUrl(key: string): Promise<string> {
    return this.provider.generatePublicUrl(key);
  }

  /**
   * 检测 Live Photos 配对
   * @param allObjects 所有文件对象（可选，如果不提供则自动获取）
   * @returns Live Photo 配对映射 (图片 key -> 视频对象)
   */
  async detectLivePhotos(
    allObjects?: StorageObject[],
  ): Promise<Map<string, StorageObject>> {
    const sourceObjects = allObjects ?? (await this.provider.listAllFiles());
    const filtered = this.applyExcludes(sourceObjects);
    return this.provider.detectLivePhotos(filtered);
  }

  async deleteFile(key: string): Promise<void> {
    await this.provider.deleteFile(key);
  }

  async listObjectKeys(prefix: string): Promise<string[]> {
    return await this.provider.listObjectKeys(prefix);
  }

  async uploadFile(
    key: string,
    data: Buffer,
    options?: StorageUploadOptions,
  ): Promise<StorageObject> {
    return await this.provider.uploadFile(key, data, options);
  }

  addExcludeFilter(filter: (key: string) => boolean): void {
    this.excludeFilters.push(filter);
  }

  addExcludePrefix(prefix: string): void {
    const normalized = prefix.replaceAll("\\", "/").replace(/^\/+/, "");
    if (!normalized) {
      return;
    }

    const effectivePrefix = normalized.endsWith("/")
      ? normalized
      : `${normalized}/`;
    this.addExcludeFilter((key) => key.startsWith(effectivePrefix));
  }

  /**
   * 获取当前使用的存储提供商
   * @returns 存储提供商实例
   */
  getProvider(): StorageProvider {
    return this.provider;
  }

  async dispose(): Promise<void> {
    await this.provider.dispose();
  }

  private createProvider(config: StorageConfig): StorageProvider {
    switch (config.provider) {
      case "s3": {
        return new S3StorageProvider(config);
      }
      case "local": {
        return new LocalFileSystemProvider(config);
      }
      default: {
        // 缺失的判别字段已由 normalizeStorageConfig 兜底成 "s3"，能走到这里说明
        // 传入了未知 provider——明确报错，而不是静默退回 S3。
        throw new Error(
          `Unknown storage provider: ${String(
            (config as { provider?: string }).provider,
          )}`,
        );
      }
    }
  }
}
