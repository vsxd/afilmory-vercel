import type { BuilderServices } from "../core/contracts/services.js";
import { createBuilderServices } from "../core/services/index.js";
import { logger } from "../logger/index.js";
import { loadExistingManifest } from "../manifest/manager.js";
import { CURRENT_MANIFEST_VERSION } from "../manifest/version.js";
import { runWithBuilderOutputSettings } from "../output-paths.js";
import { createPhotoId } from "../photo/id.js";
import type { PluginRunState } from "../plugins/manager.js";
import { PluginManager } from "../plugins/manager.js";
import type {
  BuilderPluginConfigEntry,
  BuilderPluginEventPayloads,
} from "../plugins/types.js";
import type { StorageConfig } from "../storage/index.js";
import { StorageManager } from "../storage/index.js";
import type { BuilderConfig, UserBuilderSettings } from "../types/config.js";
import type { AfilmoryManifest, ManifestSource } from "../types/manifest.js";
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

export class AfilmoryBuilder {
  private storageManager: StorageManager | null = null;
  private config: BuilderConfig;
  private pluginManager: PluginManager;
  private readonly pluginReferences: BuilderPluginConfigEntry[];
  private photoIdCollisionKeys = new Set<string>();
  private readonly servicesInstance: BuilderServices;

  constructor(config: BuilderConfig) {
    this.config = config;

    this.pluginReferences = this.resolvePluginReferences();

    this.pluginManager = new PluginManager(this.pluginReferences, {
      baseDir: process.cwd(),
    });

    this.servicesInstance = createBuilderServices({
      config: this.config,
      logger,
      getStorageConfig: () => this.getStorageConfig(),
      getStorageManager: () => this.getStorageManager(),
      createStorageManager: (config) => this.createStorageManager(config),
      hasPhotoIdCollision: (key) => this.hasPhotoIdCollision(key),
      getPhotoIdForKey: (key, existingItem) =>
        this.getPhotoIdForKey(key, existingItem),
      setPhotoIdCollisionKeys: (keys) => this.setPhotoIdCollisionKeys(keys),
      getOutputSettings: () => this.config.output,
    });
  }

  get services(): BuilderServices {
    return this.servicesInstance;
  }

  async buildManifest(options: BuilderOptions): Promise<BuilderResult> {
    return await runWithBuilderOutputSettings(this.config.output, async () => {
      try {
        await this.ensurePluginsReady();
        this.ensureStorageManager();
        return await this.#buildManifest(options);
      } catch (error) {
        logger.main.error("❌ 构建 manifest 失败：", error);
        throw error;
      }
    });
  }
  /**
   * 构建照片清单
   * @param options 构建选项
   */
  async #buildManifest(options: BuilderOptions): Promise<BuilderResult> {
    const startTime = Date.now();
    const runState = this.pluginManager.createRunState();
    const session = new BuildSession({
      config: this.config,
      options,
      services: this.services,
      runState,
      storageManager: this.getStorageManager(),
      emitPluginEvent: (state, event, payload) =>
        this.emitPluginEvent(state, event, payload),
      getConfig: () => this.getConfig(),
      getManifestSource: () => this.getManifestSource(),
      getPhotoIdForKey: (key, existingItem) =>
        this.getPhotoIdForKey(key, existingItem),
      setPhotoIdCollisionKeys: (keys) => this.setPhotoIdCollisionKeys(keys),
      getPhotoIdCollisionKeys: () => this.photoIdCollisionKeys,
    });

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

      const existingManifest = await this.loadExistingManifest(options);
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
        `现有 manifest 包含 ${existingManifestItems.length} 张照片`,
      );

      const storageConfig = this.getStorageConfig();
      logger.main.info("使用存储提供商：", storageConfig.provider);

      const sourceScan = await new SourceScanner().scan(session);
      const { imageObjects, livePhotoMap } = sourceScan;

      if (imageObjects.length === 0) {
        logger.main.error("❌ 没有找到需要处理的照片");
        const result: BuilderResult = {
          hasUpdates: false,
          newCount: 0,
          processedCount: 0,
          skippedCount: 0,
          deletedCount: 0,
          totalPhotos: 0,
        };

        await session.emit("afterBuild", {
          options,
          result,
          manifest,
        });

        return result;
      }

      const diffPlan = await new DiffPlanner().plan(
        session,
        imageObjects,
        existingManifestMap,
      );
      const { s3ImageKeys, tasksToProcess } = diffPlan;
      const taskProcessor = new PhotoTaskProcessor();
      const assembler = new ManifestAssembler();

      if (tasksToProcess.length === 0) {
        logger.main.info("💡 没有需要处理的照片，使用现有 manifest");
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
          tasksToProcess,
          existingManifestMap,
          livePhotoMap,
        );
        processingResults.push(...taskResult.results);
        Object.assign(processingStats, taskResult.stats);

        await assembler.addProcessedResults(
          session,
          manifest,
          taskResult.results,
        );
        processingStats.skippedCount +=
          await assembler.addUnchangedExistingItems(
            session,
            manifest,
            existingManifestMap,
            s3ImageKeys,
          );
      }

      await session.emit("afterProcessTasks", {
        options,
        tasks: tasksToProcess,
        results: processingResults,
        manifest,
        stats: {
          newCount: processingStats.newCount,
          processedCount: processingStats.processedCount,
          skippedCount: processingStats.skippedCount,
        },
      });

      const { deletedCount } = await new ArtifactWriter().write(
        session,
        manifest,
      );

      if (this.config.system.observability.showDetailedStats) {
        this.logBuildResults(
          manifest,
          {
            newCount: processingStats.newCount,
            processedCount: processingStats.processedCount,
            skippedCount: processingStats.skippedCount,
            deletedCount,
          },
          Date.now() - startTime,
        );
      }

      const hasUpdates =
        processingStats.newCount > 0 ||
        processingStats.processedCount > 0 ||
        deletedCount > 0;
      const result: BuilderResult = {
        hasUpdates,
        newCount: processingStats.newCount,
        processedCount: processingStats.processedCount,
        skippedCount: processingStats.skippedCount,
        deletedCount,
        totalPhotos: manifest.length,
      };

      await session.emit("afterBuild", {
        options,
        result,
        manifest,
      });

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

  private async loadExistingManifest(
    options: BuilderOptions,
  ): Promise<AfilmoryManifest> {
    return options.isForceMode || options.isForceManifest
      ? {
          schema: "afilmory.manifest",
          version: CURRENT_MANIFEST_VERSION,
          generatedAt: new Date().toISOString(),
          source: this.getManifestSource(),
          photos: [],
          indexes: { cameras: [], lenses: [] },
        }
      : await loadExistingManifest();
  }

  private getManifestSource(): ManifestSource {
    const storage = this.getStorageConfig();
    return {
      provider: "s3",
      bucket: storage.bucket,
      region: storage.region,
      endpoint: storage.endpoint,
      prefix: storage.prefix,
      customDomain: storage.customDomain,
    };
  }

  private logBuildStart(): void {
    const storage = this.getStorageConfig();
    switch (storage.provider) {
      case "s3": {
        const endpoint = storage.endpoint || "默认 AWS S3";
        const customDomain = storage.customDomain || "未设置";
        const { bucket } = storage;
        const prefix = storage.prefix || "无前缀";

        logger.main.info("🚀 开始从存储获取照片列表...");
        logger.main.info(`🔗 使用端点：${endpoint}`);
        logger.main.info(`🌐 自定义域名：${customDomain}`);
        logger.main.info(`🪣 存储桶：${bucket}`);
        logger.main.info(`📂 前缀：${prefix}`);
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
      deletedCount: number;
    },
    totalDuration: number,
  ): void {
    const durationSeconds = Math.round(totalDuration / 1000);
    const durationMinutes = Math.floor(durationSeconds / 60);
    const remainingSeconds = durationSeconds % 60;

    logger.main.success(`🎉 Manifest 构建完成!`);
    logger.main.info(`📊 处理统计:`);
    logger.main.info(`   📸 总照片数：${manifest.length}`);
    logger.main.info(`   🆕 新增照片：${stats.newCount}`);
    logger.main.info(`   🔄 处理照片：${stats.processedCount}`);
    logger.main.info(`   ⏭️ 跳过照片：${stats.skippedCount}`);
    logger.main.info(`   🗑️ 删除照片：${stats.deletedCount}`);
    logger.main.info(
      `   ⏱️ 总耗时：${durationMinutes > 0 ? `${durationMinutes}分${remainingSeconds}秒` : `${durationSeconds}秒`}`,
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

    if (
      existingItem?.id &&
      digestSuffixLength <= 0 &&
      !this.hasPhotoIdCollision(key)
    ) {
      return existingItem.id;
    }

    return createPhotoId(key, {
      digestSuffixLength,
      forceDigest: this.hasPhotoIdCollision(key),
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
        "User configuration is missing. 请配置 system/user 设置。",
      );
    }
    return this.config.user;
  }

  getStorageConfig(): StorageConfig {
    const { storage } = this.getUserSettings();
    if (!storage) {
      throw new Error(
        "Storage configuration is missing. 请配置 system/user storage 设置。",
      );
    }
    return storage;
  }

  /**
   * 获取当前配置
   */
  getConfig(): BuilderConfig {
    return Object.freeze(this.config);
  }
}
