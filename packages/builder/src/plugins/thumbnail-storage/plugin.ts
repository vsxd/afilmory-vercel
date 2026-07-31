import process from "node:process";

import type { BuilderServices } from "../../core/contracts/services.js";
import { getThumbnailFileNameFromUrl } from "../../image/thumbnail.js";
import type { StorageManager } from "../../storage/index.js";
import type { S3Config } from "../../storage/interfaces.js";
import type { BuilderPlugin } from "../types.js";
import type { ThumbnailPluginData } from "./shared.js";
import {
  DEFAULT_CONTENT_TYPE,
  DEFAULT_DIRECTORY,
  THUMBNAIL_PLUGIN_DATA_KEY,
  THUMBNAIL_PLUGIN_SYMBOL,
} from "./shared.js";

const PLUGIN_NAME = "afilmory:thumbnail-storage";
const RUN_STATE_KEY = "state";

interface ThumbnailStoragePluginOptions {
  directory?: string;
  storageConfig?: S3Config;
  contentType?: string;
}

interface ResolvedPluginConfig {
  directory: string;
  remotePrefix: string;
  contentType: string;
  useDefaultStorage: boolean;
  storageConfig: S3Config | null;
  enabled: boolean;
}

interface PluginRunState {
  uploaded: Set<string>;
  urlCache: Map<string, string>;
}

function normalizeDirectory(directory: string | undefined): string {
  const value = directory?.trim() || DEFAULT_DIRECTORY;
  const normalized = value.replaceAll("\\", "/").replaceAll(/^\/+|\/+$/g, "");
  return normalized || DEFAULT_DIRECTORY;
}

function trimSlashes(value: string | undefined | null): string | null {
  if (!value) return null;
  const normalized = value.replaceAll("\\", "/").replaceAll(/^\/+|\/+$/g, "");
  return normalized.length > 0 ? normalized : null;
}

function joinSegments(...segments: Array<string | null | undefined>): string {
  const filtered = segments
    .map((segment) =>
      (segment ?? "").replaceAll("\\", "/").replaceAll(/^\/+|\/+$/g, ""),
    )
    .filter((segment) => segment.length > 0);
  return filtered.join("/");
}

function resolveRemotePrefix(config: S3Config, directory: string): string {
  const base = trimSlashes(config.prefix);
  return joinSegments(base, directory);
}

function getOrCreateRunState(container: Map<string, unknown>): PluginRunState {
  let state = container.get(RUN_STATE_KEY) as PluginRunState | undefined;
  if (!state) {
    state = {
      uploaded: new Set<string>(),
      urlCache: new Map<string, string>(),
    };
    container.set(RUN_STATE_KEY, state);
  }
  return state;
}

export default function thumbnailStoragePlugin(
  options: ThumbnailStoragePluginOptions = {},
): BuilderPlugin {
  let resolved: ResolvedPluginConfig | null = null;
  let externalStorageManager: StorageManager | null = null;

  const getStorageManager = (
    services: BuilderServices,
    config: ResolvedPluginConfig,
  ): StorageManager | null => {
    if (config.useDefaultStorage) return services.storage.getManager();
    if (!externalStorageManager && config.storageConfig) {
      externalStorageManager = services.storage.createManager(
        config.storageConfig,
      );
    }
    return externalStorageManager;
  };

  const disposeExternalStorageManager = async () => {
    const manager = externalStorageManager;
    externalStorageManager = null;
    await manager?.dispose();
  };

  const plugin: BuilderPlugin & { [THUMBNAIL_PLUGIN_SYMBOL]: true } = {
    name: PLUGIN_NAME,
    [THUMBNAIL_PLUGIN_SYMBOL]: true,
    serializablePluginReference: {
      plugin: "thumbnail-storage",
      options,
    },
    hooks: {
      onInit: ({ services, config }) => {
        const fallbackStorage =
          config.user?.storage ?? services.storage.getConfig();
        const storageConfig = (options.storageConfig ??
          fallbackStorage) as S3Config;
        const directory = normalizeDirectory(options.directory);
        const contentType = options.contentType ?? DEFAULT_CONTENT_TYPE;

        const remotePrefix = resolveRemotePrefix(storageConfig, directory);

        resolved = {
          directory,
          remotePrefix,
          contentType,
          useDefaultStorage: !options.storageConfig,
          storageConfig,
          enabled: true,
        };
      },
      // The builder uses a fresh default manager for every run. Reapply the
      // plugin-owned dynamic exclusion when the same builder instance runs
      // again, otherwise remote thumbnails can enter the source scan.
      beforeBuild: ({ services }) => {
        if (resolved?.useDefaultStorage) {
          services.storage.getManager().addExcludePrefix(resolved.remotePrefix);
        }
      },
      afterPhotoProcess: async ({ services, payload, runShared, logger }) => {
        if (!resolved) {
          logger.main.warn(
            "Thumbnail storage plugin is not initialized correctly. Skipping upload.",
          );
          return;
        }

        if (!resolved.enabled) {
          return;
        }

        const data = payload.context.pluginData[THUMBNAIL_PLUGIN_DATA_KEY] as
          ThumbnailPluginData | undefined;

        if (!data || !data.buffer || !payload.result.item) {
          return;
        }

        const storageManager = getStorageManager(services, resolved);

        if (!storageManager) {
          logger.main.warn(
            "Thumbnail storage plugin could not resolve storage manager. Skipping upload.",
          );
          return;
        }

        const remoteKey = joinSegments(resolved.remotePrefix, data.fileName);
        const state = getOrCreateRunState(runShared);

        if (!state.uploaded.has(remoteKey)) {
          try {
            await storageManager.uploadFile(remoteKey, data.buffer, {
              contentType: resolved.contentType,
              // 与 vercel.json 的 /thumbnails/ 规则一致：长缓存 + 不可变
              cacheControl: "public, max-age=31536000, immutable",
            });
            state.uploaded.add(remoteKey);
          } catch (error) {
            logger.thumbnail.error(
              `Failed to upload thumbnail: ${remoteKey}`,
              error,
            );
            return;
          }
        }

        let remoteUrl = state.urlCache.get(remoteKey);
        if (!remoteUrl) {
          try {
            remoteUrl = await storageManager.generatePublicUrl(remoteKey);
            state.urlCache.set(remoteKey, remoteUrl);
          } catch (error) {
            logger.thumbnail.error(
              `Failed to generate thumbnail URL: ${remoteKey}`,
              error,
            );
            return;
          }
        }

        payload.result.item.thumbnailUrl = remoteUrl;
      },
      afterBuild: async ({ services, payload, logger }) => {
        const config = resolved;
        try {
          if (!config || !config.enabled) return;

          // 与 manifest/manager.ts 的本地孤儿判定同一条规则：孤儿 = "存储中已
          // 不存在"，而不是"不在本次 manifest 里"。空扫描或有照片处理失败时
          // manifest 是缩水的，据它清理会把仍然有效的远端缩略图连坐删除
          // （本地路径靠 keepPhotoIds 防护；远端直接跳过本轮，下次健康构建再收敛）。
          if (payload.manifest.length === 0 || payload.result.failedCount > 0) {
            logger.thumbnail.warn(
              payload.manifest.length === 0
                ? "Skipping remote thumbnail orphan cleanup: this run's manifest is empty."
                : `Skipping remote thumbnail orphan cleanup: ${payload.result.failedCount} photo(s) failed to process this run.`,
            );
            return;
          }

          const storageManager = getStorageManager(services, config);
          if (!storageManager) return;

          // 期望存在的远端缩略图 key（来自最终 manifest）。
          const expected = new Set(
            payload.manifest.map((photo) => {
              const fileName =
                getThumbnailFileNameFromUrl(photo.thumbnailUrl) ??
                `${photo.id}.jpg`;
              return joinSegments(config.remotePrefix, fileName);
            }),
          );

          let remoteKeys: string[];
          try {
            remoteKeys = await storageManager.listObjectKeys(
              `${config.remotePrefix}/`,
            );
          } catch (error) {
            logger.thumbnail.warn(
              "Failed to list remote thumbnails; skipping orphan cleanup.",
              error,
            );
            return;
          }

          const orphans = remoteKeys.filter((key) => !expected.has(key));
          if (orphans.length === 0) return;

          // 破坏性删除默认走 dry-run：仅当显式设置 THUMBNAIL_STORAGE_CLEANUP=true 时才真正删除。
          if (process.env.THUMBNAIL_STORAGE_CLEANUP !== "true") {
            logger.thumbnail.warn(
              `Found ${orphans.length} remote thumbnail orphan(s) (dry-run, nothing deleted). ` +
                `Set THUMBNAIL_STORAGE_CLEANUP=true to actually delete them. Examples: ${orphans
                  .slice(0, 5)
                  .join(", ")}`,
            );
            return;
          }

          let deleted = 0;
          for (const key of orphans) {
            try {
              await storageManager.deleteFile(key);
              deleted++;
            } catch (error) {
              logger.thumbnail.warn(
                `Failed to delete remote thumbnail orphan: ${key}`,
                error,
              );
            }
          }
          logger.thumbnail.info(
            `Cleaned up ${deleted}/${orphans.length} remote thumbnail orphan(s).`,
          );
        } finally {
          if (!config?.useDefaultStorage) {
            await disposeExternalStorageManager();
          }
        }
      },
      onError: disposeExternalStorageManager,
    },
  };

  return plugin;
}

export type { ThumbnailStoragePluginOptions };
