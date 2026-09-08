import type { Tags } from "exiftool-vendored";
import { describe, expect, it, vi } from "vitest";

import { createDefaultBuilderConfig } from "../../config/defaults.js";
import type { BuilderServices } from "../../core/contracts/services.js";
import { thumbnailExists } from "../../image/thumbnail.js";
import { logger } from "../../logger/index.js";
import { CURRENT_CORE_PROCESSING_FINGERPRINTS } from "../../photo/processing-fingerprints.js";
import { StorageManager } from "../../storage/index.js";
import type { StorageObject } from "../../storage/interfaces.js";
import type { BuilderConfig } from "../../types/config.js";
import type { BuilderOptions } from "../../types/options.js";
import type { PhotoManifestItem } from "../../types/photo.js";
import { ArtifactWriter } from "./artifact-writer.js";
import { DiffPlanner } from "./diff-planner.js";
import { ManifestAssembler } from "./manifest-assembler.js";
import type {
  BuildPluginEventEmitter,
  BuildSessionStorageManager,
} from "./session.js";
import { BuildSession } from "./session.js";
import { SourceScanner } from "./source-scanner.js";

const manifestManagerMocks = vi.hoisted(() => ({
  handleDeletedPhotos: vi.fn(async () => 1),
  saveManifest: vi.fn(
    async (
      _output: unknown,
      photos: PhotoManifestItem[],
      cameras: unknown[],
      lenses: unknown[],
      source: unknown,
    ) => ({
      manifest: {
        schema: "afilmory.manifest" as const,
        version: 2 as const,
        generatedAt: "2026-06-06T00:00:00.000Z",
        source,
        photos,
        indexes: { cameras, lenses },
      },
      written: true,
    }),
  ),
}));

vi.mock("../../image/thumbnail.js", () => ({
  createThumbnailInventory: vi.fn(async () => ({ has: () => false })),
  thumbnailExists: vi.fn(async () => false),
}));

vi.mock("../../manifest/manager.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../manifest/manager.js")
  >("../../manifest/manager.js");
  return {
    ...actual,
    handleDeletedPhotos: manifestManagerMocks.handleDeletedPhotos,
    saveManifest: manifestManagerMocks.saveManifest,
  };
});

function createPhoto(
  id: string,
  overrides: Partial<PhotoManifestItem> = {},
): PhotoManifestItem {
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
    processing: { ...CURRENT_CORE_PROCESSING_FINGERPRINTS },
    ...overrides,
  };
}

function createStorageManagerFixture(
  overrides: Partial<BuildSessionStorageManager> = {},
): BuildSessionStorageManager {
  return {
    deleteFile: overrides.deleteFile ?? vi.fn(async () => {}),
    detectLivePhotos:
      overrides.detectLivePhotos ?? vi.fn(async () => new Map()),
    generatePublicUrl:
      overrides.generatePublicUrl ??
      vi.fn(async (key: string) => `https://example.com/${key}`),
    getFile: overrides.getFile ?? vi.fn(async () => null),
    listAllFiles: overrides.listAllFiles ?? vi.fn(async () => []),
    listAllFilesDetailed:
      overrides.listAllFilesDetailed ??
      vi.fn(async () => ({ objects: [], complete: true })),
    listImages: overrides.listImages ?? vi.fn(async () => []),
    uploadFile:
      overrides.uploadFile ??
      vi.fn(async (key: string, data: Buffer) => ({
        key,
        size: data.length,
      })),
  };
}

function createBuilderServicesFixture(config: BuilderConfig): BuilderServices {
  const storageConfig = config.user?.storage ?? {
    provider: "s3" as const,
    bucket: "photos",
  };
  const emptyTags: Tags = {
    SourceFile: "fixture.jpg",
  };

  return {
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
      createManager: (nextConfig) => new StorageManager(nextConfig),
      getConfig: () => storageConfig,
      getManager: () => new StorageManager(storageConfig),
    },
  };
}

function createPluginEventEmitter(): BuildPluginEventEmitter {
  const emitPluginEvent: BuildPluginEventEmitter = async () => {};
  return vi.fn(emitPluginEvent);
}

function createSession(
  overrides: {
    config?: BuilderConfig;
    options?: Partial<BuilderOptions>;
    storageManager?: BuildSessionStorageManager;
  } = {},
): BuildSession {
  const config = createDefaultBuilderConfig();
  config.user = {
    storage: { provider: "s3", bucket: "photos" },
  };
  const sessionConfig = overrides.config ?? config;
  const storageManager =
    overrides.storageManager ?? createStorageManagerFixture();
  const services = createBuilderServicesFixture(sessionConfig);

  return new BuildSession({
    options: {
      isForceMode: false,
      isForceManifest: false,
      isForceThumbnails: false,
      ...overrides.options,
    },
    services,
    runState: new Map(),
    storageManager,
    emitPluginEvent: createPluginEventEmitter(),
    getManifestSource: () => ({ provider: "s3", bucket: "photos" }),
    getPhotoIdCollisionKeys: () => new Set<string>(),
    getPhotoIdForKey: (key: string) => key.replace(/\.[^.]+$/, ""),
    setPhotoIdCollisionKeys: vi.fn(),
  });
}

describe("builder workflow modules", () => {
  it("plans reproducibly from frozen options and keeps all intermediate policy out of the request", async () => {
    const session = createSession({ options: { isForceMode: true } });
    const before = { ...session.options };
    Object.freeze(session.options);
    const objects = [
      { key: "b.jpg", size: 10 },
      { key: "a.jpg", size: 10 },
    ];
    const planner = new DiffPlanner();
    const first = await planner.plan(
      session,
      objects,
      new Map(),
      new Map(),
      new Set(["b.jpg"]),
    );
    const second = await planner.plan(
      session,
      [...objects].reverse(),
      new Map(),
      new Map(),
      new Set(["b.jpg"]),
    );
    expect(first).toEqual(second);
    expect(first.tasksToProcess.map((task) => task.key)).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
    expect(first.processorOptions.reprocessKeySet).toEqual(new Set(["b.jpg"]));
    expect(first.processorOptions.plannedKeys).toEqual(
      new Set(["a.jpg", "b.jpg"]),
    );
    expect(session.options).toEqual(before);
    expect(Object.isFrozen(session.request)).toBe(true);
    expect(session.request).not.toHaveProperty("reprocessKeys");
    expect(session.request).not.toHaveProperty("plannedKeys");
    expect(session.config).toBe(session.services.config);
  });

  it("captures legacy plugin invalidation hints without retaining their mutable arrays", async () => {
    const session = createSession();
    const hints = ["photo.jpg"];
    session.options.derivedReprocessKeys = hints;
    const photo = createPhoto("photo", {
      processing: { ...CURRENT_CORE_PROCESSING_FINGERPRINTS },
    });
    const object = {
      key: photo.s3Key,
      size: photo.size,
      etag: photo.etag,
      lastModified: new Date(photo.lastModified),
    };
    const result = await new DiffPlanner().plan(
      session,
      [object],
      new Map([[photo.s3Key, photo]]),
    );
    expect(result.reasons.get(photo.s3Key)).toBe("derived processing changed");
    hints.push("later.jpg");
    expect(result.processorOptions.derivedReprocessKeySet).toEqual(
      new Set(["photo.jpg"]),
    );
    const next = createSession();
    expect(next.options.derivedReprocessKeys).toBeUndefined();
  });

  it("scans source files, live photos, and image objects with scoped events", async () => {
    const allObjects: StorageObject[] = [
      { key: "a.jpg" },
      { key: "a.mov" },
      { key: "b.jpg" },
    ];
    const imageObjects = allObjects.filter((object) =>
      object.key.endsWith(".jpg"),
    );
    const livePhotoMap = new Map([[allObjects[0].key, allObjects[1]]]);
    const listAllFiles = vi.fn(async () => allObjects);
    const listAllFilesDetailed = vi.fn(async () => ({
      objects: allObjects,
      complete: true,
    }));
    const listImages = vi.fn(async () => imageObjects);
    const session = createSession({
      storageManager: createStorageManagerFixture({
        listAllFiles,
        listAllFilesDetailed,
        listImages,
        detectLivePhotos: vi.fn(async () => livePhotoMap),
      }),
    });

    const result = await new SourceScanner().scan(session);

    expect(result).toEqual({
      allObjects,
      complete: true,
      incompleteReason: undefined,
      imageObjects,
      livePhotoMap,
    });
    // imageObjects 由 allObjects 本地派生：整次扫描只做一次存储列举，
    // 不再触发 listImages 的第二次 ListObjectsV2 分页。
    expect(listAllFilesDetailed).toHaveBeenCalledTimes(1);
    expect(listAllFiles).not.toHaveBeenCalled();
    expect(listImages).not.toHaveBeenCalled();
    expect(session.emitPluginEvent).toHaveBeenCalledWith(
      session.runState,
      "afterAllFilesListed",
      {
        options: session.options,
        allObjects,
      },
    );
    expect(session.emitPluginEvent).toHaveBeenCalledWith(
      session.runState,
      "afterLivePhotoDetection",
      {
        options: session.options,
        livePhotoMap,
      },
    );
  });

  it("derives image objects locally via the shared supported-image predicate", async () => {
    const allObjects: StorageObject[] = [
      { key: "photos/a.JPG" }, // 大小写不敏感
      { key: "photos/b.heic" },
      { key: "photos/clip.mov" },
      { key: "photos/notes.txt" },
      { key: "photos/no-extension" },
    ];
    const listAllFiles = vi.fn(async () => allObjects);
    const listAllFilesDetailed = vi.fn(async () => ({
      objects: allObjects,
      complete: true,
    }));
    const listImages = vi.fn(async () => []);
    const session = createSession({
      storageManager: createStorageManagerFixture({
        listAllFiles,
        listAllFilesDetailed,
        listImages,
      }),
    });

    const result = await new SourceScanner().scan(session);

    expect(result.imageObjects.map((object) => object.key)).toEqual([
      "photos/a.JPG",
      "photos/b.heic",
    ]);
    expect(listAllFilesDetailed).toHaveBeenCalledTimes(1);
    expect(listAllFiles).not.toHaveBeenCalled();
    expect(listImages).not.toHaveBeenCalled();
  });

  it("does not emit source lifecycle hooks for an incomplete snapshot", async () => {
    const allObjects: StorageObject[] = [{ key: "partial.jpg" }];
    const session = createSession({
      storageManager: createStorageManagerFixture({
        listAllFilesDetailed: vi.fn(async () => ({
          objects: allObjects,
          complete: false,
          reason: {
            code: "pagination-anomaly" as const,
            message: "missing continuation token",
          },
        })),
      }),
    });

    await expect(new SourceScanner().scan(session)).resolves.toMatchObject({
      allObjects,
      complete: false,
      imageObjects: [],
      livePhotoMap: new Map(),
    });
    expect(session.emitPluginEvent).not.toHaveBeenCalled();
  });

  it("plans force-mode tasks without consulting thumbnail state", async () => {
    const imageObjects: StorageObject[] = [
      { key: "small.jpg", size: 1 },
      { key: "large.jpg", size: 10 },
    ];
    const session = createSession({
      options: {
        isForceMode: true,
        isForceManifest: false,
        isForceThumbnails: false,
      },
    });

    const result = await new DiffPlanner().plan(
      session,
      imageObjects,
      new Map(),
    );

    expect(result.s3ImageKeys).toEqual(new Set(["small.jpg", "large.jpg"]));
    expect(result.tasksToProcess.map((task) => task.key)).toEqual([
      "large.jpg",
      "small.jpg",
    ]);
  });

  it("forces worker reprocessing when a Live Photo sidecar changes", async () => {
    vi.mocked(thumbnailExists).mockResolvedValueOnce(true);
    const imageObject: StorageObject = {
      key: "photo.jpg",
      etag: "photo",
      size: 100,
      lastModified: new Date("2026-06-06T00:00:00.000Z"),
    };
    const livePhoto: StorageObject = {
      key: "photo.mov",
      etag: "new-video",
      size: 200,
    };
    const existing = createPhoto("photo", {
      video: {
        type: "live-photo",
        videoUrl: "https://example.com/photo.mov",
        s3Key: "photo.mov",
        version: "etag:old-video",
      },
    });
    const session = createSession();

    const result = await new DiffPlanner().plan(
      session,
      [imageObject],
      new Map([[imageObject.key, existing]]),
      new Map([[imageObject.key, livePhoto]]),
    );

    expect(result.tasksToProcess).toEqual([imageObject]);
    expect(result.processorOptions.reprocessKeySet?.has(imageObject.key)).toBe(
      true,
    );
    expect(session.options.reprocessKeys).toBeUndefined();
  });

  it("forces worker reprocessing when a Live Photo sidecar disappears", async () => {
    vi.mocked(thumbnailExists).mockResolvedValueOnce(true);
    const imageObject: StorageObject = {
      key: "photo.jpg",
      etag: "photo",
      size: 100,
      lastModified: new Date("2026-06-06T00:00:00.000Z"),
    };
    const existing = createPhoto("photo", {
      video: {
        type: "live-photo",
        videoUrl: "https://example.com/photo.mov",
        s3Key: "photo.mov",
        version: "etag:video",
      },
    });
    const session = createSession();

    const result = await new DiffPlanner().plan(
      session,
      [imageObject],
      new Map([[imageObject.key, existing]]),
    );

    expect(result.tasksToProcess).toEqual([imageObject]);
    expect(result.processorOptions.reprocessKeySet?.has(imageObject.key)).toBe(
      true,
    );
    expect(session.options.reprocessKeys).toBeUndefined();
  });

  it("merges existing and processed manifest items without duplicates", async () => {
    const assembler = new ManifestAssembler();
    const session = createSession();
    const manifest: PhotoManifestItem[] = [createPhoto("processed")];

    const skipped = await assembler.addUnchangedExistingItems(
      session,
      manifest,
      new Map([
        ["processed.jpg", createPhoto("processed")],
        [
          "kept.jpg",
          createPhoto("kept", {
            exif: {
              Make: "Sony",
              Model: "A7C",
              LensModel: "FE 35mm",
            },
          }),
        ],
      ]),
      new Set(["processed.jpg", "kept.jpg"]),
    );

    expect(skipped).toBe(1);
    expect(manifest.map((item) => item.id)).toEqual(["processed", "kept"]);
    expect(assembler.generateCameraCollection(manifest)).toEqual([
      { make: "Sony", model: "A7C", displayName: "Sony A7C" },
    ]);
    expect(assembler.generateLensCollection(manifest)).toEqual([
      { make: undefined, model: "FE 35mm", displayName: "FE 35mm" },
    ]);
  });

  it("writes artifacts with generated indexes and manifest source", async () => {
    manifestManagerMocks.handleDeletedPhotos.mockClear();
    manifestManagerMocks.saveManifest.mockClear();
    const session = createSession();
    const manifest = [
      createPhoto("photo", {
        exif: {
          Make: "Sony",
          Model: "A7C",
          LensMake: "Sony",
          LensModel: "FE 35mm",
        },
      }),
    ];

    const result = await new ArtifactWriter().write(session, manifest);

    expect(result.deletedCount).toBe(1);
    expect(manifestManagerMocks.saveManifest).toHaveBeenCalledWith(
      session.config.output,
      manifest,
      [{ make: "Sony", model: "A7C", displayName: "Sony A7C" }],
      [{ make: "Sony", model: "FE 35mm", displayName: "Sony FE 35mm" }],
      { provider: "s3", bucket: "photos" },
      { forceWrite: undefined, previousManifest: undefined },
    );
    expect(
      manifestManagerMocks.saveManifest.mock.invocationCallOrder[0],
    ).toBeLessThan(
      manifestManagerMocks.handleDeletedPhotos.mock.invocationCallOrder[0]!,
    );
  });

  it("rebuilds derived indexes after beforeSaveManifest mutations", async () => {
    manifestManagerMocks.handleDeletedPhotos.mockClear();
    manifestManagerMocks.saveManifest.mockClear();
    const session = createSession();
    const manifest = [createPhoto("photo")];
    vi.mocked(session.emitPluginEvent).mockImplementation(
      async (_runState, event, payload) => {
        if (event !== "beforeSaveManifest") return;
        const savePayload = payload as {
          manifest: PhotoManifestItem[];
        };
        savePayload.manifest[0]!.exif = {
          Make: "Leica",
          Model: "M11",
          LensModel: "Summilux 35",
        };
      },
    );

    await new ArtifactWriter().write(session, manifest);

    expect(manifestManagerMocks.saveManifest).toHaveBeenCalledWith(
      session.config.output,
      manifest,
      [{ make: "Leica", model: "M11", displayName: "Leica M11" }],
      [
        {
          make: undefined,
          model: "Summilux 35",
          displayName: "Summilux 35",
        },
      ],
      { provider: "s3", bucket: "photos" },
      { forceWrite: undefined, previousManifest: undefined },
    );
  });

  it("never cleans old assets when candidate validation/save fails", async () => {
    manifestManagerMocks.handleDeletedPhotos.mockClear();
    manifestManagerMocks.saveManifest.mockRejectedValueOnce(
      new Error("candidate rejected"),
    );
    const session = createSession();

    await expect(
      new ArtifactWriter().write(session, [createPhoto("photo")]),
    ).rejects.toThrow("candidate rejected");
    expect(manifestManagerMocks.handleDeletedPhotos).not.toHaveBeenCalled();
  });

  it("forwards keepPhotoIds to handleDeletedPhotos so failed photos' thumbnails survive cleanup", async () => {
    manifestManagerMocks.handleDeletedPhotos.mockClear();
    const session = createSession();
    const manifest = [createPhoto("kept")];
    // Deliberately includes an id that is NOT in the manifest: a photo whose
    // processing failed is dropped from the manifest but still exists in
    // storage, and the orphan cleanup must spare its thumbnail. builder.ts
    // relies on this pass-through when it calls write(..., { keepPhotoIds }).
    const keepPhotoIds = new Set(["kept", "failed-but-still-in-storage"]);

    await new ArtifactWriter().write(session, manifest, { keepPhotoIds });

    expect(manifestManagerMocks.handleDeletedPhotos).toHaveBeenCalledTimes(1);
    expect(manifestManagerMocks.handleDeletedPhotos).toHaveBeenCalledWith(
      session.config.output,
      manifest,
      keepPhotoIds,
      new Set(),
    );
  });

  it("isolates and freezes afterSaveManifest so it cannot change cleanup", async () => {
    manifestManagerMocks.handleDeletedPhotos.mockClear();
    const session = createSession();
    const manifest = [createPhoto("committed")];
    vi.mocked(session.emitPluginEvent).mockImplementation(
      async (_runState, event, payload) => {
        if (event !== "afterSaveManifest") return;
        const snapshot = (payload as { manifest: readonly PhotoManifestItem[] })
          .manifest;
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot[0])).toBe(true);
        try {
          (snapshot[0] as PhotoManifestItem).id = "mutated";
        } catch {
          // Frozen snapshots throw in ESM strict mode; a plugin may catch its
          // own mistake, but it still cannot alter the cleanup transaction.
        }
      },
    );

    await new ArtifactWriter().write(session, manifest);

    expect(manifestManagerMocks.handleDeletedPhotos).toHaveBeenCalledWith(
      session.config.output,
      expect.arrayContaining([expect.objectContaining({ id: "committed" })]),
      undefined,
      new Set(),
    );
  });
});
