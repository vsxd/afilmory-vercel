import type { BuilderServices } from "../../core/contracts/services.js";
import type { PluginRunState } from "../../plugins/manager.js";
import type { BuilderPluginEventPayloads } from "../../plugins/types.js";
import type { StorageManager } from "../../storage/index.js";
import type { BuilderConfig } from "../../types/config.js";
import type { ManifestSource } from "../../types/manifest.js";
import type { BuilderOptions } from "../../types/options.js";
import type { PhotoManifestItem } from "../../types/photo.js";

export type BuildPluginEventEmitter = <
  TEvent extends keyof BuilderPluginEventPayloads,
>(
  runState: PluginRunState,
  event: TEvent,
  payload: BuilderPluginEventPayloads[TEvent],
) => Promise<void>;

export type BuildSessionStorageManager = Pick<
  StorageManager,
  | "deleteFile"
  | "detectLivePhotos"
  | "generatePublicUrl"
  | "getFile"
  | "listAllFiles"
  | "listImages"
  | "uploadFile"
>;

export interface BuildSessionInput {
  config: BuilderConfig;
  options: BuilderOptions;
  services: BuilderServices;
  runState: PluginRunState;
  storageManager: BuildSessionStorageManager;
  emitPluginEvent: BuildPluginEventEmitter;
  getConfig: () => BuilderConfig;
  getManifestSource: () => ManifestSource;
  getPhotoIdForKey: (key: string, existingItem?: PhotoManifestItem) => string;
  setPhotoIdCollisionKeys: (keys: Iterable<string>) => void;
  getPhotoIdCollisionKeys: () => ReadonlySet<string>;
}

export class BuildSession {
  readonly config: BuilderConfig;
  readonly options: BuilderOptions;
  readonly services: BuilderServices;
  readonly runState: PluginRunState;
  readonly storageManager: BuildSessionStorageManager;
  readonly emitPluginEvent: BuildPluginEventEmitter;
  readonly getConfig: () => BuilderConfig;
  readonly getManifestSource: () => ManifestSource;
  readonly getPhotoIdForKey: (
    key: string,
    existingItem?: PhotoManifestItem,
  ) => string;
  readonly setPhotoIdCollisionKeys: (keys: Iterable<string>) => void;
  readonly getPhotoIdCollisionKeys: () => ReadonlySet<string>;

  constructor(input: BuildSessionInput) {
    this.config = input.config;
    this.options = input.options;
    this.services = input.services;
    this.runState = input.runState;
    this.storageManager = input.storageManager;
    this.emitPluginEvent = input.emitPluginEvent;
    this.getConfig = input.getConfig;
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
