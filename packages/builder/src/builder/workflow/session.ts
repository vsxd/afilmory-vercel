import type { BuilderServices } from "../../core/contracts/services.js";
import type { BuilderStorage } from "../../core/contracts/storage.js";
import type { PluginRunState } from "../../plugins/manager.js";
import type { BuilderPluginEventPayloads } from "../../plugins/types.js";
import type { BuilderConfig } from "../../types/config.js";
import type { ManifestSource } from "../../types/manifest.js";
import type {
  BuilderOptions,
  BuilderPluginOptions,
  BuildRequest,
} from "../../types/options.js";
import type { PhotoManifestItem } from "../../types/photo.js";

export type BuildPluginEventEmitter = <
  TEvent extends keyof BuilderPluginEventPayloads,
>(
  runState: PluginRunState,
  event: TEvent,
  payload: BuilderPluginEventPayloads[TEvent],
) => Promise<void>;

export type BuildSessionStorageManager = Pick<
  BuilderStorage,
  | "deleteFile"
  | "detectLivePhotos"
  | "generatePublicUrl"
  | "getFile"
  | "listAllFiles"
  | "listAllFilesDetailed"
  | "listImages"
  | "uploadFile"
>;

export interface BuildSessionInput {
  options: BuilderOptions;
  services: BuilderServices;
  runState: PluginRunState;
  storageManager: BuildSessionStorageManager;
  emitPluginEvent: BuildPluginEventEmitter;
  getManifestSource: () => ManifestSource;
  getPhotoIdForKey: (key: string, existingItem?: PhotoManifestItem) => string;
  setPhotoIdCollisionKeys: (keys: Iterable<string>) => void;
  getPhotoIdCollisionKeys: () => ReadonlySet<string>;
}

export class BuildSession {
  get config(): BuilderConfig {
    return this.services.config;
  }
  get logger() {
    return this.services.logger;
  }
  readonly request: BuildRequest;
  readonly options: BuilderPluginOptions;
  readonly services: BuilderServices;
  readonly runState: PluginRunState;
  readonly storageManager: BuildSessionStorageManager;
  readonly emitPluginEvent: BuildPluginEventEmitter;
  readonly getManifestSource: () => ManifestSource;
  readonly getPhotoIdForKey: (
    key: string,
    existingItem?: PhotoManifestItem,
  ) => string;
  readonly setPhotoIdCollisionKeys: (keys: Iterable<string>) => void;
  readonly getPhotoIdCollisionKeys: () => ReadonlySet<string>;

  constructor(input: BuildSessionInput) {
    this.request = Object.freeze({
      isForceMode: input.options.isForceMode,
      isForceManifest: input.options.isForceManifest,
      isForceThumbnails: input.options.isForceThumbnails,
      concurrencyLimit: input.options.concurrencyLimit,
      progressListener: input.options.progressListener,
    });
    this.options = {
      ...this.request,
      locationMode:
        input.services.config.system.processing.locationMode ?? "coarse",
    };
    this.services = input.services;
    this.runState = input.runState;
    this.storageManager = input.storageManager;
    this.emitPluginEvent = input.emitPluginEvent;
    this.getManifestSource = input.getManifestSource;
    this.getPhotoIdForKey = input.getPhotoIdForKey;
    this.setPhotoIdCollisionKeys = input.setPhotoIdCollisionKeys;
    this.getPhotoIdCollisionKeys = input.getPhotoIdCollisionKeys;
  }

  async emit<TEvent extends keyof BuilderPluginEventPayloads>(
    event: TEvent,
    payload: BuilderPluginEventPayloads[TEvent],
  ): Promise<void> {
    await this.emitPluginEvent(this.runState, event, payload);
  }
}
