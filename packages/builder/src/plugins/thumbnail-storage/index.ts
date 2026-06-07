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

  const plugin: BuilderPlugin & { [THUMBNAIL_PLUGIN_SYMBOL]: true } = {
    name: PLUGIN_NAME,
    [THUMBNAIL_PLUGIN_SYMBOL]: true,
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

        if (!options.storageConfig) {
          services.storage.getManager().addExcludePrefix(remotePrefix);
        } else {
          externalStorageManager =
            services.storage.createManager(storageConfig);
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
          | ThumbnailPluginData
          | undefined;

        if (!data || !data.buffer || !payload.result.item) {
          return;
        }

        const storageManager = resolved.useDefaultStorage
          ? services.storage.getManager()
          : externalStorageManager;

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
            });
            state.uploaded.add(remoteKey);
          } catch (error) {
            logger.thumbnail.error(`上传缩略图失败：${remoteKey}`, error);
            return;
          }
        }

        let remoteUrl = state.urlCache.get(remoteKey);
        if (!remoteUrl) {
          try {
            remoteUrl = await storageManager.generatePublicUrl(remoteKey);
            state.urlCache.set(remoteKey, remoteUrl);
          } catch (error) {
            logger.thumbnail.error(`生成缩略图 URL 失败：${remoteKey}`, error);
            return;
          }
        }

        payload.result.item.thumbnailUrl = remoteUrl;
      },
    },
  };

  return plugin;
}

export type { ThumbnailStoragePluginOptions };

export { THUMBNAIL_PLUGIN_SYMBOL } from "./shared.js";
