import { Buffer } from "node:buffer";
import process from "node:process";

import type { Tags } from "exiftool-vendored";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createDefaultBuilderConfig } from "../../config/defaults.js";
import type { EmitPluginEventFn } from "../../core/contracts/execution-context.js";
import type { BuilderServices } from "../../core/contracts/services.js";
import { createThumbnailFileName } from "../../image/thumbnail.js";
import type { LogMessage } from "../../logger/index.js";
import { logger, setLogListener } from "../../logger/index.js";
import { StorageManager } from "../../storage/index.js";
import type { S3Config, StorageConfig } from "../../storage/interfaces.js";
import type { BuilderOptions } from "../../types/options.js";
import type { PhotoManifestItem } from "../../types/photo.js";
import type { BuilderPluginEventPayloads } from "../types.js";
import type { ThumbnailStoragePluginOptions } from "./index.js";
import thumbnailStoragePlugin from "./index.js";
import { THUMBNAIL_PLUGIN_DATA_KEY } from "./shared.js";

/**
 * These tests drive the plugin hooks directly with spied StorageManager
 * instances. This plugin is the ONLY code in the repo that deletes objects
 * from the user's remote bucket, so the tests pin:
 *   - which keys get deleted (exactly the orphans, never the expected set),
 *   - the dry-run-by-default gate (THUMBNAIL_STORAGE_CLEANUP=true required),
 *   - the safety gate (empty manifest / failedCount>0 skips listing entirely),
 *   - prefix normalization (a trailing-slash prefix must NOT shift the
 *     expected-key set — that regression class classifies every remote
 *     thumbnail as an orphan and one deploy wipes them all).
 */

const BUILD_OPTIONS: BuilderOptions = {
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
};

// Default directory (".afilmory/thumbnails") joined under storage prefix "photos".
const DEFAULT_REMOTE_PREFIX = "photos/.afilmory/thumbnails";

type AfterPhotoProcessPayload = BuilderPluginEventPayloads["afterPhotoProcess"];

// A real StorageManager (side-effect-free constructor) with every remote
// operation the plugin performs replaced by a spy — the typed seam that
// lets tests observe upload/delete/list calls without touching any storage.
function createManagerFixture() {
  const manager = new StorageManager({
    provider: "local",
    basePath: "/nonexistent-thumbnail-storage-test",
  });
  const uploadFile = vi
    .spyOn(manager, "uploadFile")
    .mockImplementation(async (key) => ({ key }));
  const deleteFile = vi
    .spyOn(manager, "deleteFile")
    .mockImplementation(async () => {});
  const listObjectKeys = vi
    .spyOn(manager, "listObjectKeys")
    .mockResolvedValue([]);
  const generatePublicUrl = vi
    .spyOn(manager, "generatePublicUrl")
    .mockImplementation(async (key) => `https://cdn.example.com/${key}`);
  const addExcludePrefix = vi.spyOn(manager, "addExcludePrefix");
  const dispose = vi.spyOn(manager, "dispose");

  return {
    manager,
    uploadFile,
    deleteFile,
    listObjectKeys,
    generatePublicUrl,
    addExcludePrefix,
    dispose,
  };
}
type ManagerFixture = ReturnType<typeof createManagerFixture>;

function manifestItem(id: string): PhotoManifestItem {
  return {
    id,
    title: id,
    description: "",
    dateTaken: "2026-06-06T00:00:00.000Z",
    tags: [],
    originalUrl: `https://example.com/${id}.jpg`,
    thumbnailUrl: `/thumbnails/${id}.jpg`,
    thumbHash: null,
    width: 100,
    height: 100,
    aspectRatio: 1,
    s3Key: `${id}.jpg`,
    lastModified: "2026-06-06T00:00:00.000Z",
    size: 100,
    etag: id,
    exif: null,
    toneAnalysis: null,
    location: null,
  };
}

function makePhotoPayload(input: {
  id: string;
  buffer?: Buffer | null;
  withPluginData?: boolean;
}): AfterPhotoProcessPayload {
  const fileName = `${input.id}.jpg`;
  const pluginData: Record<string, unknown> =
    input.withPluginData === false
      ? {}
      : {
          [THUMBNAIL_PLUGIN_DATA_KEY]: {
            photoId: input.id,
            fileName,
            buffer:
              input.buffer === undefined
                ? Buffer.from(`thumb-${input.id}`)
                : input.buffer,
            localUrl: null,
          },
        };

  return {
    options: BUILD_OPTIONS,
    context: {
      photoKey: fileName,
      obj: { key: fileName },
      existingItem: undefined,
      livePhotoMap: new Map(),
      options: BUILD_OPTIONS,
      pluginData,
    },
    result: { type: "new", item: manifestItem(input.id), pluginData: {} },
  };
}

function createHarness(
  overrides: {
    storagePrefix?: string;
    pluginOptions?: ThumbnailStoragePluginOptions;
  } = {},
) {
  const storageConfig: S3Config = {
    provider: "s3",
    bucket: "bucket",
    region: "auto",
    endpoint: "https://s3.example.com",
    accessKeyId: "key",
    secretAccessKey: "secret",
    prefix: overrides.storagePrefix ?? "photos",
  };

  const defaultManager = createManagerFixture();
  const externalManager = createManagerFixture();
  const createManager = vi.fn(
    (_config: StorageConfig) => externalManager.manager,
  );

  const config = createDefaultBuilderConfig();
  config.user = { storage: storageConfig };

  const emptyTags: Tags = { SourceFile: "fixture.jpg" };
  const services: BuilderServices = {
    config,
    exif: {
      close: vi.fn(),
      read: vi.fn(async () => emptyTags),
    },
    logger,
    photoId: {
      getIdForKey: (key) => key.replace(/\.[^.]+$/, ""),
    },
    storage: {
      createManager,
      getConfig: () => storageConfig,
      getManager: () => defaultManager.manager,
    },
  };

  const plugin = thumbnailStoragePlugin(overrides.pluginOptions);
  const runShared = new Map<string, unknown>();
  const emitPluginEvent: EmitPluginEventFn = async () => {};

  const baseHookContext = {
    services,
    emitPluginEvent,
    config,
    logger,
    options: BUILD_OPTIONS,
    pluginName: plugin.name ?? "afilmory:thumbnail-storage",
    pluginOptions: undefined,
    runShared,
  };

  async function init() {
    await plugin.hooks!.onInit!({
      services,
      config,
      logger,
      pluginOptions: undefined,
    });
  }

  async function runAfterPhotoProcess(payload: AfterPhotoProcessPayload) {
    await plugin.hooks!.afterPhotoProcess!({
      ...baseHookContext,
      event: "afterPhotoProcess",
      payload,
    });
  }

  async function runBeforeBuild() {
    await plugin.hooks!.beforeBuild!({
      ...baseHookContext,
      event: "beforeBuild",
      payload: { options: BUILD_OPTIONS },
    });
  }

  async function runAfterBuild(
    manifest: PhotoManifestItem[],
    { failedCount = 0 }: { failedCount?: number } = {},
  ) {
    await plugin.hooks!.afterBuild!({
      ...baseHookContext,
      event: "afterBuild",
      payload: {
        options: BUILD_OPTIONS,
        result: {
          hasUpdates: true,
          newCount: 0,
          processedCount: manifest.length,
          skippedCount: 0,
          failedCount,
          deletedCount: 0,
          totalPhotos: manifest.length,
        },
        manifest,
      },
    });
  }

  return {
    plugin,
    defaultManager,
    externalManager,
    createManager,
    init,
    runBeforeBuild,
    runAfterPhotoProcess,
    runAfterBuild,
  };
}

function deletedKeys(fixture: ManagerFixture): string[] {
  return fixture.deleteFile.mock.calls.map(([key]) => key);
}

// Captured through the logger module's own listener seam — the plugin logs
// via the real tagged logger, so tests assert on the recorded messages.
const logMessages: LogMessage[] = [];

function loggedMessages(tag: string, level: string): string[] {
  return logMessages
    .filter((message) => message.tag === tag && message.level === level)
    .map((message) => message.args.map(String).join(" "));
}

const ORIGINAL_CLEANUP_FLAG = process.env.THUMBNAIL_STORAGE_CLEANUP;

beforeEach(() => {
  // The dry-run default must be exercised with the variable truly unset,
  // regardless of the developer's shell environment.
  delete process.env.THUMBNAIL_STORAGE_CLEANUP;
  logMessages.length = 0;
  setLogListener((message) => logMessages.push(message), {
    forwardToConsole: false,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  setLogListener(null, { forwardToConsole: true });
});

afterAll(() => {
  if (ORIGINAL_CLEANUP_FLAG !== undefined) {
    process.env.THUMBNAIL_STORAGE_CLEANUP = ORIGINAL_CLEANUP_FLAG;
  }
});

describe("thumbnailStoragePlugin onInit", () => {
  it("registers the remote thumbnail prefix as an exclude on the default storage manager", async () => {
    const harness = createHarness();
    await harness.init();
    await harness.runBeforeBuild();

    expect(harness.defaultManager.addExcludePrefix).toHaveBeenCalledWith(
      DEFAULT_REMOTE_PREFIX,
    );
    expect(harness.createManager).not.toHaveBeenCalled();
  });

  it("uses a dedicated external manager (and no exclude) when storageConfig is provided", async () => {
    const externalConfig: S3Config = {
      provider: "s3",
      bucket: "thumbs-bucket",
      prefix: "cdn",
    };
    const harness = createHarness({
      pluginOptions: { storageConfig: externalConfig },
    });
    await harness.init();

    expect(harness.createManager).not.toHaveBeenCalled();
    expect(harness.defaultManager.addExcludePrefix).not.toHaveBeenCalled();

    // Uploads must go through the external manager, not the default one.
    await harness.runAfterPhotoProcess(makePhotoPayload({ id: "a" }));
    expect(harness.createManager).toHaveBeenCalledWith(externalConfig);
    expect(harness.externalManager.uploadFile).toHaveBeenCalledTimes(1);
    expect(harness.defaultManager.uploadFile).not.toHaveBeenCalled();
    // External config prefix "cdn" + default directory.
    expect(harness.externalManager.uploadFile).toHaveBeenCalledWith(
      "cdn/.afilmory/thumbnails/a.jpg",
      expect.any(Buffer),
      expect.anything(),
    );
    await harness.runAfterBuild([manifestItem("a")]);
    expect(harness.externalManager.dispose).toHaveBeenCalledTimes(1);
    expect(harness.defaultManager.dispose).not.toHaveBeenCalled();
  });
});

describe("thumbnailStoragePlugin afterPhotoProcess", () => {
  it("uploads the thumbnail once per remote key and rewrites thumbnailUrl on every item", async () => {
    const harness = createHarness();
    await harness.init();

    const first = makePhotoPayload({ id: "a" });
    const second = makePhotoPayload({ id: "a" });
    await harness.runAfterPhotoProcess(first);
    await harness.runAfterPhotoProcess(second);

    const remoteKey = `${DEFAULT_REMOTE_PREFIX}/a.jpg`;
    expect(harness.defaultManager.uploadFile).toHaveBeenCalledTimes(1);
    expect(harness.defaultManager.uploadFile).toHaveBeenCalledWith(
      remoteKey,
      expect.any(Buffer),
      {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=31536000, immutable",
      },
    );
    // Public URL is cached per key too.
    expect(harness.defaultManager.generatePublicUrl).toHaveBeenCalledTimes(1);

    const expectedUrl = `https://cdn.example.com/${remoteKey}`;
    expect(first.result.item?.thumbnailUrl).toBe(expectedUrl);
    expect(second.result.item?.thumbnailUrl).toBe(expectedUrl);
  });

  it("skips upload when the plugin data, buffer, or manifest item is missing", async () => {
    const harness = createHarness();
    await harness.init();

    await harness.runAfterPhotoProcess(
      makePhotoPayload({ id: "no-data", withPluginData: false }),
    );
    await harness.runAfterPhotoProcess(
      makePhotoPayload({ id: "no-buffer", buffer: null }),
    );
    const noItem = makePhotoPayload({ id: "no-item" });
    noItem.result.item = null;
    await harness.runAfterPhotoProcess(noItem);

    expect(harness.defaultManager.uploadFile).not.toHaveBeenCalled();
  });

  it("keeps the local thumbnailUrl and retries later when the upload fails", async () => {
    const harness = createHarness();
    await harness.init();

    harness.defaultManager.uploadFile.mockRejectedValueOnce(
      new Error("network down"),
    );

    const failed = makePhotoPayload({ id: "a" });
    await harness.runAfterPhotoProcess(failed);
    expect(failed.result.item?.thumbnailUrl).toBe("/thumbnails/a.jpg");
    expect(loggedMessages("THUMBNAIL", "error")).not.toHaveLength(0);

    // The failed key must not poison the dedupe set: next photo with the
    // same key uploads again and gets the remote URL.
    const retried = makePhotoPayload({ id: "a" });
    await harness.runAfterPhotoProcess(retried);
    expect(harness.defaultManager.uploadFile).toHaveBeenCalledTimes(2);
    expect(retried.result.item?.thumbnailUrl).toBe(
      `https://cdn.example.com/${DEFAULT_REMOTE_PREFIX}/a.jpg`,
    );
  });
});

describe("thumbnailStoragePlugin afterBuild orphan cleanup", () => {
  it("preserves a published photo's artifacts when its CDN rewrites the basename", async () => {
    vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "true");
    const harness = createHarness();
    await harness.init();

    const current = `${DEFAULT_REMOTE_PREFIX}/${createThumbnailFileName("a", Buffer.from("current"))}`;
    const previous = `${DEFAULT_REMOTE_PREFIX}/${createThumbnailFileName("a", Buffer.from("previous"))}`;
    const legacy = `${DEFAULT_REMOTE_PREFIX}/a.jpg`;
    const orphan = `${DEFAULT_REMOTE_PREFIX}/deleted-photo.jpg`;
    harness.defaultManager.listObjectKeys.mockResolvedValueOnce([
      current,
      previous,
      legacy,
      orphan,
      `${DEFAULT_REMOTE_PREFIX}/b.jpg`,
    ]);

    await harness.runAfterBuild([
      {
        ...manifestItem("a"),
        thumbnailUrl: "https://cdn.example.com/resize/rewritten-name.jpg",
      },
      manifestItem("b"),
    ]);

    expect(deletedKeys(harness.defaultManager)).toEqual([orphan]);
  });

  it("deletes exactly the remote keys that are not expected by the manifest when cleanup is enabled", async () => {
    vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "true");
    const harness = createHarness();
    await harness.init();

    const expectedA = `${DEFAULT_REMOTE_PREFIX}/a.jpg`;
    const expectedB = `${DEFAULT_REMOTE_PREFIX}/b.jpg`;
    const orphan1 = `${DEFAULT_REMOTE_PREFIX}/deleted-photo.jpg`;
    const orphan2 = `${DEFAULT_REMOTE_PREFIX}/stale.jpg`;
    harness.defaultManager.listObjectKeys.mockResolvedValueOnce([
      expectedA,
      orphan1,
      expectedB,
      orphan2,
    ]);

    await harness.runAfterBuild([manifestItem("a"), manifestItem("b")]);

    expect(harness.defaultManager.listObjectKeys).toHaveBeenCalledWith(
      `${DEFAULT_REMOTE_PREFIX}/`,
    );
    expect(deletedKeys(harness.defaultManager).sort()).toEqual(
      [orphan1, orphan2].sort(),
    );
    expect(deletedKeys(harness.defaultManager)).not.toContain(expectedA);
    expect(deletedKeys(harness.defaultManager)).not.toContain(expectedB);
  });

  it("defaults to dry-run: deletes nothing but logs the orphans it would delete", async () => {
    const harness = createHarness();
    await harness.init();

    const orphan = `${DEFAULT_REMOTE_PREFIX}/stale.jpg`;
    harness.defaultManager.listObjectKeys.mockResolvedValueOnce([
      `${DEFAULT_REMOTE_PREFIX}/a.jpg`,
      orphan,
    ]);

    await harness.runAfterBuild([manifestItem("a")]);

    expect(harness.defaultManager.deleteFile).not.toHaveBeenCalled();
    const warnings = loggedMessages("THUMBNAIL", "warn");
    expect(warnings.some((message) => message.includes("dry-run"))).toBe(true);
    expect(warnings.some((message) => message.includes(orphan))).toBe(true);
  });

  it("treats any non-'true' THUMBNAIL_STORAGE_CLEANUP value as dry-run", async () => {
    vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "1");
    const harness = createHarness();
    await harness.init();

    harness.defaultManager.listObjectKeys.mockResolvedValueOnce([
      `${DEFAULT_REMOTE_PREFIX}/stale.jpg`,
    ]);

    await harness.runAfterBuild([manifestItem("a")]);
    expect(harness.defaultManager.deleteFile).not.toHaveBeenCalled();
  });

  it("skips cleanup entirely (no remote listing) when the manifest is empty", async () => {
    vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "true");
    const harness = createHarness();
    await harness.init();

    await harness.runAfterBuild([]);

    expect(harness.defaultManager.listObjectKeys).not.toHaveBeenCalled();
    expect(harness.defaultManager.deleteFile).not.toHaveBeenCalled();
    expect(loggedMessages("THUMBNAIL", "warn")).toHaveLength(1);
  });

  it("skips cleanup entirely (no remote listing) when any photo failed to process", async () => {
    vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "true");
    const harness = createHarness();
    await harness.init();

    await harness.runAfterBuild([manifestItem("a")], { failedCount: 2 });

    expect(harness.defaultManager.listObjectKeys).not.toHaveBeenCalled();
    expect(harness.defaultManager.deleteFile).not.toHaveBeenCalled();
    expect(loggedMessages("THUMBNAIL", "warn")).toHaveLength(1);
  });

  it("aborts cleanup without failing the build when listing remote keys throws", async () => {
    vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "true");
    const harness = createHarness();
    await harness.init();

    harness.defaultManager.listObjectKeys.mockRejectedValueOnce(
      new Error("list failed"),
    );

    await expect(
      harness.runAfterBuild([manifestItem("a")]),
    ).resolves.toBeUndefined();

    expect(harness.defaultManager.deleteFile).not.toHaveBeenCalled();
    expect(loggedMessages("THUMBNAIL", "warn")).toHaveLength(1);
  });

  it("keeps deleting remaining orphans when a single delete fails", async () => {
    vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "true");
    const harness = createHarness();
    await harness.init();

    const orphan1 = `${DEFAULT_REMOTE_PREFIX}/stale-1.jpg`;
    const orphan2 = `${DEFAULT_REMOTE_PREFIX}/stale-2.jpg`;
    harness.defaultManager.listObjectKeys.mockResolvedValueOnce([
      `${DEFAULT_REMOTE_PREFIX}/a.jpg`,
      orphan1,
      orphan2,
    ]);
    harness.defaultManager.deleteFile.mockRejectedValueOnce(
      new Error("delete failed"),
    );

    await expect(
      harness.runAfterBuild([manifestItem("a")]),
    ).resolves.toBeUndefined();

    expect(deletedKeys(harness.defaultManager)).toEqual([orphan1, orphan2]);
  });

  it.each(["photos", "photos/", "/photos", "/photos/"])(
    "computes the same expected-key set for storage prefix %j (slash variants must never reclassify live thumbnails as orphans)",
    async (prefix) => {
      vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "true");
      const harness = createHarness({ storagePrefix: prefix });
      await harness.init();

      // The remote bucket holds exactly the thumbnails for the manifest,
      // stored under the canonical (no-slash) prefix. Any normalization
      // mismatch would classify every one of them as an orphan and delete
      // the user's whole thumbnail set in a single deploy.
      harness.defaultManager.listObjectKeys.mockResolvedValueOnce([
        `${DEFAULT_REMOTE_PREFIX}/a.jpg`,
        `${DEFAULT_REMOTE_PREFIX}/b.jpg`,
      ]);

      await harness.runAfterBuild([manifestItem("a"), manifestItem("b")]);

      expect(harness.defaultManager.listObjectKeys).toHaveBeenCalledWith(
        `${DEFAULT_REMOTE_PREFIX}/`,
      );
      expect(harness.defaultManager.deleteFile).not.toHaveBeenCalled();
    },
  );

  it("uploads and expected-key computation agree on the remote key for the same photo id", async () => {
    // Cross-hook consistency: the key written by afterPhotoProcess must be
    // in the expected set of afterBuild, otherwise a freshly uploaded
    // thumbnail would be deleted as an orphan in the same build.
    vi.stubEnv("THUMBNAIL_STORAGE_CLEANUP", "true");
    const harness = createHarness();
    await harness.init();

    await harness.runAfterPhotoProcess(makePhotoPayload({ id: "a" }));
    const [uploadedKey] = harness.defaultManager.uploadFile.mock.calls[0]!;

    harness.defaultManager.listObjectKeys.mockResolvedValueOnce([uploadedKey]);
    await harness.runAfterBuild([manifestItem("a")]);

    expect(harness.defaultManager.deleteFile).not.toHaveBeenCalled();
  });
});
