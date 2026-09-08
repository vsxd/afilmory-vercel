import type { BuilderServices } from "../core/contracts/services.js";
import { createBuilderServices } from "../core/services/index.js";
import { ExifService } from "../image/exif.js";
import {
  isThumbnailEncodingStale,
  THUMBNAIL_ENCODING_SIGNATURE,
  writeThumbnailEncodingMarker,
} from "../image/thumbnail.js";
import { logger } from "../logger/index.js";
import { loadExistingManifestWithDiagnostics } from "../manifest/manager.js";
import { normalizeBuilderOutputSettings } from "../output-paths.js";
import { resolveStablePhotoId } from "../photo/id.js";
import { enforcePhotoLocationPrivacy } from "../photo/location-privacy.js";
import type { PluginRunState } from "../plugins/manager.js";
import { PluginManager } from "../plugins/manager.js";
import { createSerializableBuilderConfigForWorker } from "../plugins/serializable.js";
import type {
  BuilderPluginConfigEntry,
  BuilderPluginEventPayloads,
} from "../plugins/types.js";
import type { StorageConfig } from "../storage/index.js";
import { normalizeStorageConfig, StorageManager } from "../storage/index.js";
import type { BuilderConfig, UserBuilderSettings } from "../types/config.js";
import type { ManifestSource } from "../types/manifest.js";
import type { BuilderOptions, BuilderResult } from "../types/options.js";
import type { PhotoManifestItem, ProcessPhotoResult } from "../types/photo.js";
import { ArtifactWriter } from "./workflow/artifact-writer.js";
import { DiffPlanner } from "./workflow/diff-planner.js";
import { ManifestAssembler } from "./workflow/manifest-assembler.js";
import type { ProcessingStats } from "./workflow/photo-task-processor.js";
import { PhotoTaskProcessor } from "./workflow/photo-task-processor.js";
import { BuildSession } from "./workflow/session.js";
import { SourceScanner } from "./workflow/source-scanner.js";

export type {
  BuilderOptions,
  BuilderResult,
  BuildProgressListener,
  BuildProgressSnapshot,
  BuildProgressStartPayload,
} from "../types/options.js";

/**
 * 构建成功后 Builder 是否应当落盘缩略图编码签名标记（.encoding）。
 * CLI 与程序化调用都走这个判断，避免两条入口产生不同的缓存兼容行为。
 *
 * - 零照片构建从未评估过任何缩略图：瞬时空列举（存储抖动/前缀误配）撞上
 *   编码参数变更时 failedCount 恰好为 0，此时盖新标记会让旧参数缩略图被
 *   下次增量构建当作已达标，永远不再重生成。
 * - 强制重生成的运行中若有照片失败也不写：磁盘上还残留旧参数的缩略图，
 *   带上新标记会让下次增量构建把它们当作已达标，旧参数产物永远无法收敛。
 */
export function shouldWriteThumbnailEncodingMarker(
  result: Pick<BuilderResult, "totalPhotos" | "failedCount">,
  wasThumbnailForce: boolean,
): boolean {
  if (result.totalPhotos === 0) return false;
  return !wasThumbnailForce || result.failedCount === 0;
}

export interface AfilmoryBuilderRuntime {
  exifService?: ExifService;
  ownsExifService?: boolean;
}

export class SourceListingIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceListingIncompleteError";
  }
}

export class EmptySourceListingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptySourceListingError";
  }
}

export class AfilmoryBuilder {
  private storageManager: StorageManager | null = null;
  private config: BuilderConfig;
  private pluginManager: PluginManager;
  private readonly pluginReferences: BuilderPluginConfigEntry[];
  private photoIdCollisionKeys = new Set<string>();
  private readonly servicesInstance: BuilderServices;
  private readonly exifService: ExifService;
  private readonly ownsExifService: boolean;
  private buildInProgress = false;

  constructor(config: BuilderConfig, runtime: AfilmoryBuilderRuntime = {}) {
    // resolveBuilderConfig 已归一化过；这里再归一一次（幂等）覆盖绕过 resolve
    // 直接 new 的路径——cluster worker 用 IPC 传来的 config 重建 builder 就是这种。
    const worker =
      config.system.processing.worker ??
      config.system.observability.performance?.worker;
    if (!worker) {
      throw new Error(
        "Missing worker config: use system.processing.worker in the resolved BuilderConfig",
      );
    }
    const canonicalWorker = {
      ...worker,
      processCount: worker.processCount ?? worker.workerCount,
      globalTaskConcurrency:
        worker.globalTaskConcurrency ??
        config.system.processing.defaultConcurrency ??
        worker.workerCount,
      workerCount: worker.processCount ?? worker.workerCount,
    };
    this.config = {
      ...config,
      system: {
        ...config.system,
        processing: {
          ...config.system.processing,
          worker: canonicalWorker,
        },
      },
      output: normalizeBuilderOutputSettings(config.output),
    };
    this.exifService = runtime.exifService ?? new ExifService();
    this.ownsExifService = runtime.ownsExifService ?? !runtime.exifService;

    this.pluginReferences = this.resolvePluginReferences();

    this.pluginManager = new PluginManager(this.pluginReferences, {
      baseDir: process.cwd(),
    });

    this.servicesInstance = createBuilderServices({
      config: this.config,
      logger,
      getStorageConfig: () => this.getStorageConfig(),
      getStorageManager: () => this.getStorageManager(),
      getExifService: () => this.exifService,
      createStorageManager: (config) => this.createStorageManager(config),
      getPhotoIdForKey: (key, existingItem) =>
        this.getPhotoIdForKey(key, existingItem),
    });
  }

  get services(): BuilderServices {
    return this.servicesInstance;
  }

  dispose(): void {
    const { storageManager } = this;
    this.storageManager = null;
    void storageManager?.dispose().catch((error: unknown) => {
      logger.main.warn("Failed to dispose the storage manager", error);
    });
    if (this.ownsExifService) {
      this.exifService.close();
    }
  }

  async buildManifest(options: BuilderOptions): Promise<BuilderResult> {
    if (this.buildInProgress) {
      throw new Error(
        "AfilmoryBuilder.buildManifest() cannot run concurrently on the same instance",
      );
    }
    this.buildInProgress = true;
    this.photoIdCollisionKeys.clear();

    try {
      await this.ensurePluginsReady();
      this.preflightExecutionMode();
      this.ensureStorageManager();
      const effectiveOptions =
        await this.resolveThumbnailEncodingOptions(options);
      return await this.#buildManifest(effectiveOptions);
    } catch (error) {
      logger.main.error("❌ Failed to build manifest:", error);
      throw error;
    } finally {
      const { storageManager } = this;
      this.storageManager = null;
      try {
        await storageManager?.dispose();
      } finally {
        this.buildInProgress = false;
      }
    }
  }

  /**
   * Cluster compatibility is a configuration property, not a function of the
   * current photo count. Validate it before touching storage so a plugin never
   * works for a small gallery and then starts failing after an unrelated photo
   * pushes the task count over the cluster threshold.
   */
  private preflightExecutionMode(): void {
    if (!this.config.system.processing.worker.useClusterMode) {
      return;
    }
    createSerializableBuilderConfigForWorker(this.config);
  }

  private async resolveThumbnailEncodingOptions(
    options: BuilderOptions,
  ): Promise<BuilderOptions> {
    if (
      options.isForceMode ||
      options.isForceThumbnails ||
      !(await isThumbnailEncodingStale(this.config.output.thumbnailsDir))
    ) {
      return { ...options };
    }

    logger.main.info(
      `🧾 Thumbnail encoding signature marker mismatch (current: ${THUMBNAIL_ENCODING_SIGNATURE}); force-regenerating all thumbnails this run`,
    );
    return { ...options, isForceThumbnails: true };
  }
  /**
   * 构建照片清单
   * @param options 构建选项
   */
  async #buildManifest(request: BuilderOptions): Promise<BuilderResult> {
    const startTime = Date.now();
    const runState = this.pluginManager.createRunState();
    const session = new BuildSession({
      options: request,
      services: this.services,
      runState,
      storageManager: this.getStorageManager(),
      emitPluginEvent: (state, event, payload) =>
        this.emitPluginEvent(state, event, payload),
      getManifestSource: () => this.getManifestSource(),
      getPhotoIdForKey: (key, existingItem) =>
        this.getPhotoIdForKey(key, existingItem),
      setPhotoIdCollisionKeys: (keys) => this.setPhotoIdCollisionKeys(keys),
      getPhotoIdCollisionKeys: () => this.photoIdCollisionKeys,
    });

    const { options } = session;
    const manifest: PhotoManifestItem[] = [];
    const processingResults: ProcessPhotoResult[] = [];
    const processingStats: ProcessingStats = {
      newCount: 0,
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };

    try {
      await session.emit("beforeBuild", {
        options,
      });

      this.logBuildStart();

      // Force flags change the work plan, never the recovery baseline. Keeping
      // the last successful manifest lets a failed force rebuild preserve the
      // previous photo instead of shrinking the published gallery.
      const {
        manifest: existingManifest,
        repairedPhotoKeys,
        requiresRewrite: existingManifestRequiresRewrite,
      } = await loadExistingManifestWithDiagnostics(this.config.output);
      const existingManifestItems = existingManifest.photos;
      const existingManifestMap = new Map(
        existingManifestItems.map((item) => [item.s3Key, item]),
      );
      await session.emit("afterManifestLoad", {
        options,
        manifest: existingManifest,
        manifestMap: existingManifestMap,
      });

      logger.main.info(
        `Existing manifest contains ${existingManifestItems.length} photos`,
      );

      const storageConfig = this.getStorageConfig();
      logger.main.info("Using storage provider:", storageConfig.provider);

      const sourceScan = await new SourceScanner().scan(session);
      const { complete: scanComplete, imageObjects, livePhotoMap } = sourceScan;

      if (!scanComplete) {
        const message = `Refusing to publish from an incomplete storage listing; the previous ${existingManifestItems.length}-photo gallery remains untouched.${sourceScan.incompleteReason ? ` ${sourceScan.incompleteReason.message}` : ""}`;
        logger.main.error(`❌ ${message}`);
        throw new SourceListingIncompleteError(message);
      }

      // 列举成功但从非空图库骤降到 0 张：视作疑似误配或瞬时故障（前缀写错、
      // 存储抖动），以错误结束并保留现有产物。这样 production fresh build 不会
      // 把旧图库误报成刷新成功。只有 --force 才明确授权发布空图库并清理产物；
      // 首次构建/既有空图库没有数据可丢，可正常收敛为空 manifest。
      if (
        imageObjects.length === 0 &&
        !options.isForceMode &&
        existingManifestItems.length > 0
      ) {
        const message = `Storage returned zero photos while the existing manifest has ${existingManifestItems.length}; the gallery remains untouched. Pass --force to publish an empty gallery, or check the storage path/prefix.`;
        logger.main.error(`❌ ${message}`);
        throw new EmptySourceListingError(message);
      }

      if (imageObjects.length === 0) {
        logger.main.warn(
          options.isForceMode
            ? "⚠️ Storage returned zero photos and --force is set: publishing an empty gallery and clearing thumbnails."
            : "ℹ️ Storage contains no photos: publishing an empty gallery.",
        );
      }

      const diffPlan = await new DiffPlanner().plan(
        session,
        imageObjects,
        existingManifestMap,
        livePhotoMap,
        repairedPhotoKeys,
      );
      const { s3ImageKeys, tasksToProcess } = diffPlan;
      let executedTasks = [...tasksToProcess];
      const taskProcessor = new PhotoTaskProcessor();
      const assembler = new ManifestAssembler();

      if (tasksToProcess.length === 0) {
        logger.main.info(
          "💡 No photos to process; using the existing manifest",
        );
        await assembler.addExistingItems(
          session,
          manifest,
          existingManifestItems,
          s3ImageKeys,
        );
        taskProcessor.completeEmptyRun(session, processingStats);
      } else {
        const taskResult = await taskProcessor.process(
          session,
          diffPlan,
          existingManifestMap,
          livePhotoMap,
        );
        executedTasks = taskResult.tasks;
        processingResults.push(...taskResult.results);
        Object.assign(processingStats, taskResult.stats);

        await assembler.addProcessedResults(
          session,
          manifest,
          taskResult.results,
        );
        const reprocessedKeys = new Set<string>();
        for (const task of executedTasks) {
          if (task.key) {
            reprocessedKeys.add(task.key);
          }
        }
        processingStats.skippedCount +=
          await assembler.addUnchangedExistingItems(
            session,
            manifest,
            existingManifestMap,
            s3ImageKeys,
            reprocessedKeys,
          );
      }

      // 本地 provider 的 originalUrl/videoUrl 是「当前 baseUrl + s3Key」的
      // 确定性函数，而增量跳过路径会原样复用旧 manifest 条目。baseUrl 变更时
      //（如 /photos → /originals 的命名空间迁移，/photos 已改为照片页 HTML）
      // 必须在这里统一重推导，否则旧条目的 URL 指向 HTML，查看器整库报
      // 「Failed to load image」且永远不会被增量构建修复。
      if (this.getStorageConfig().provider === "local") {
        const urlStorageManager = this.getStorageManager();
        for (const item of manifest) {
          item.originalUrl = await urlStorageManager.generatePublicUrl(
            item.s3Key,
          );
          if (item.video?.type === "live-photo") {
            item.video.videoUrl = await urlStorageManager.generatePublicUrl(
              item.video.s3Key,
            );
          }
        }
      }

      const locationMode =
        session.config.system.processing.locationMode ?? "coarse";
      for (const item of manifest) {
        enforcePhotoLocationPrivacy(item, locationMode);
      }

      await session.emit("afterProcessTasks", {
        options,
        tasks: executedTasks,
        results: processingResults,
        manifest,
        stats: {
          newCount: processingStats.newCount,
          processedCount: processingStats.processedCount,
          skippedCount: processingStats.skippedCount,
        },
      });

      // Plugins may enrich location data in afterProcessTasks. Reassert the
      // publication policy before the atomic manifest commit so neither
      // third-party output nor a preserved failure fallback can leak precision.
      for (const item of manifest) {
        enforcePhotoLocationPrivacy(item, locationMode);
      }

      // 存储中仍存在的照片全集：本次处理失败的照片不进 manifest，但它们的
      // 缩略图不能被孤儿清理连坐删除（否则一次批量下载超时就清空可复用缩略图，
      // 再被 artifact-cache 持久化成缩水状态）。
      const keepPhotoIds = new Set<string>();
      for (const key of s3ImageKeys) {
        keepPhotoIds.add(
          session.getPhotoIdForKey(key, existingManifestMap.get(key)),
        );
      }

      const { deletedCount, manifestChanged } =
        await new ArtifactWriter().write(session, manifest, {
          forceManifestRewrite: existingManifestRequiresRewrite,
          keepPhotoIds,
          previousManifest: existingManifest,
        });

      if (this.config.system.observability.showDetailedStats) {
        this.logBuildResults(
          manifest,
          {
            newCount: processingStats.newCount,
            processedCount: processingStats.processedCount,
            skippedCount: processingStats.skippedCount,
            failedCount: processingStats.failedCount,
            deletedCount,
          },
          Date.now() - startTime,
        );
      }

      // 失败照片汇总：即使被跳过也要醒目提示，避免“绿色构建”掩盖照片丢失。
      if (processingStats.failedCount > 0) {
        logger.main.warn(
          `⚠️ ${processingStats.failedCount} photo(s) failed to process. New photos that failed are omitted from the manifest; photos that failed while being reprocessed keep their previous manifest entry (which may now be stale). Check the failure logs above.`,
        );
      }

      const hasUpdates = manifestChanged || deletedCount > 0;
      const result: BuilderResult = {
        hasUpdates,
        newCount: processingStats.newCount,
        processedCount: processingStats.processedCount,
        skippedCount: processingStats.skippedCount,
        failedCount: processingStats.failedCount,
        deletedCount,
        totalPhotos: manifest.length,
      };

      await session.emit("afterBuild", {
        options,
        result,
        manifest,
      });

      const wasThumbnailForce =
        options.isForceMode || options.isForceThumbnails;
      if (
        wasThumbnailForce &&
        shouldWriteThumbnailEncodingMarker(result, wasThumbnailForce)
      ) {
        await writeThumbnailEncodingMarker(this.config.output.thumbnailsDir);
      } else if (wasThumbnailForce && result.failedCount > 0) {
        logger.main.warn(
          "⚠️ Some photos failed during this force-regeneration; keeping the previous encoding marker so the next build retries them.",
        );
      }

      return result;
    } catch (error) {
      options.progressListener?.onError?.(error);
      await session.emit("onError", {
        options,
        error,
      });
      throw error;
    }
  }

  private getManifestSource(): ManifestSource {
    const storage = this.getStorageConfig();
    switch (storage.provider) {
      case "s3": {
        return {
          provider: "s3",
          bucket: storage.bucket,
          region: storage.region,
          endpoint: storage.endpoint,
          prefix: storage.prefix,
          customDomain: storage.customDomain,
        };
      }
      case "local": {
        // A manifest is a public browser asset. Never publish the build
        // machine's absolute source path (user name, mount points, CI layout).
        return {
          provider: "local",
          baseUrl: storage.baseUrl,
        };
      }
    }
  }

  private logBuildStart(): void {
    const storage = this.getStorageConfig();
    switch (storage.provider) {
      case "s3": {
        const endpoint = storage.endpoint || "default AWS S3";
        const customDomain = storage.customDomain || "not set";
        const { bucket } = storage;
        const prefix = storage.prefix || "no prefix";

        logger.main.info("🚀 Fetching photo list from storage...");
        logger.main.info(`🔗 Endpoint: ${endpoint}`);
        logger.main.info(`🌐 Custom domain: ${customDomain}`);
        logger.main.info(`🪣 Bucket: ${bucket}`);
        logger.main.info(`📂 Prefix: ${prefix}`);
        break;
      }
      case "local": {
        logger.main.info(
          "🚀 Fetching photo list from the local file system...",
        );
        logger.main.info(`📂 Photo directory: ${storage.basePath}`);
        logger.main.info(
          `🌐 Public URL prefix: ${storage.baseUrl ?? "/originals"}`,
        );
        break;
      }
    }
  }

  private logBuildResults(
    manifest: PhotoManifestItem[],
    stats: {
      newCount: number;
      processedCount: number;
      skippedCount: number;
      failedCount: number;
      deletedCount: number;
    },
    totalDuration: number,
  ): void {
    const durationSeconds = Math.round(totalDuration / 1000);
    const durationMinutes = Math.floor(durationSeconds / 60);
    const remainingSeconds = durationSeconds % 60;

    logger.main.success(`🎉 Manifest build complete!`);
    logger.main.info(`📊 Processing stats:`);
    logger.main.info(`   📸 Total photos: ${manifest.length}`);
    logger.main.info(`   🆕 New photos: ${stats.newCount}`);
    logger.main.info(`   🔄 Processed photos: ${stats.processedCount}`);
    logger.main.info(`   ⏭️ Skipped photos: ${stats.skippedCount}`);
    if (stats.failedCount > 0) {
      logger.main.warn(
        `   ❌ Failed photos: ${stats.failedCount} (new ones omitted; reprocessed ones keep their previous entry)`,
      );
    }
    logger.main.info(`   🗑️ Deleted photos: ${stats.deletedCount}`);
    logger.main.info(
      `   ⏱️ Total time: ${durationMinutes > 0 ? `${durationMinutes}m${remainingSeconds}s` : `${durationSeconds}s`}`,
    );
  }

  /**
   * 获取当前使用的存储管理器
   */
  getStorageManager(): StorageManager {
    return this.ensureStorageManager();
  }

  createPluginRunState(): PluginRunState {
    return this.pluginManager.createRunState();
  }

  setPhotoIdCollisionKeys(keys: Iterable<string>): void {
    this.photoIdCollisionKeys = new Set(keys);
  }

  hasPhotoIdCollision(key: string): boolean {
    return this.photoIdCollisionKeys.has(key);
  }

  getPhotoIdForKey(key: string, existingItem?: PhotoManifestItem): string {
    const digestSuffixLength =
      this.config.system.processing.digestSuffixLength ?? 0;

    return resolveStablePhotoId(key, existingItem, {
      digestSuffixLength,
      hasCollision: this.hasPhotoIdCollision(key),
    });
  }

  async emitPluginEvent<TEvent extends keyof BuilderPluginEventPayloads>(
    runState: PluginRunState,
    event: TEvent,
    payload: BuilderPluginEventPayloads[TEvent],
  ): Promise<void> {
    await this.pluginManager.emit(
      this.services,
      (rs, ev, pl) => this.emitPluginEvent(rs, ev, pl),
      runState,
      event,
      payload,
    );
  }

  async ensurePluginsReady(): Promise<void> {
    await this.pluginManager.ensureLoaded(this.services);
  }

  private resolvePluginReferences(): BuilderPluginConfigEntry[] {
    const references: BuilderPluginConfigEntry[] = [];
    const seen = new Set<string>();

    const addReference = (ref: BuilderPluginConfigEntry) => {
      if (typeof ref === "string") {
        if (seen.has(ref)) return;
        seen.add(ref);
        references.push(ref);
        return;
      }

      const pluginName = ref.name;
      if (pluginName) {
        const key = `plugin:${pluginName}`;
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
      }
      references.push(ref);
    };

    for (const ref of this.config.plugins) {
      addReference(ref);
    }

    return references;
  }

  private ensureStorageManager(): StorageManager {
    if (!this.storageManager) {
      this.storageManager = this.createStorageManager(this.getStorageConfig());
    }

    return this.storageManager;
  }

  private createStorageManager(config: StorageConfig): StorageManager {
    return new StorageManager(config);
  }

  private getUserSettings(): UserBuilderSettings {
    if (!this.config.user) {
      throw new Error(
        "User configuration is missing. Please configure your system/user settings.",
      );
    }
    return this.config.user;
  }

  getStorageConfig(): StorageConfig {
    const { storage } = this.getUserSettings();
    if (!storage) {
      throw new Error(
        "Storage configuration is missing. Please configure your system/user storage settings.",
      );
    }
    // 兜底缺失的 provider 判别字段（历史配置默认 s3），使 getManifestSource /
    // logBuildStart 的 switch 与 StorageManager 看到同一份归一化配置。
    return normalizeStorageConfig(storage);
  }

  /**
   * 获取当前配置
   */
  getConfig(): BuilderConfig {
    return Object.freeze(this.config);
  }
}
