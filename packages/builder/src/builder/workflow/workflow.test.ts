import type { Tags } from "exiftool-vendored";
import { describe, expect, it, vi } from "vitest";

import { createDefaultBuilderConfig } from "../../config/defaults.js";
import type { BuilderServices } from "../../core/contracts/services.js";
import { logger } from "../../logger/index.js";
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
  saveManifest: vi.fn(async () => {}),
}));

vi.mock("../../image/thumbnail.js", () => ({
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
    output: {
      getSettings: () => config.output,
    },
    photoId: {
      getIdForKey: (key) => key.replace(/\.[^.]+$/, ""),
      hasCollision: () => false,
      setCollisionKeys: vi.fn(),
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
    config: sessionConfig,
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
    getConfig: () => sessionConfig,
  });
}

describe("builder workflow modules", () => {
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
    const session = createSession({
      storageManager: createStorageManagerFixture({
        listAllFiles: vi.fn(async () => allObjects),
        listImages: vi.fn(async () => imageObjects),
        detectLivePhotos: vi.fn(async () => livePhotoMap),
      }),
    });

    const result = await new SourceScanner().scan(session);

    expect(result).toEqual({
      allObjects,
      imageObjects,
      livePhotoMap,
    });
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
      manifest,
      [{ make: "Sony", model: "A7C", displayName: "Sony A7C" }],
      [{ make: "Sony", model: "FE 35mm", displayName: "Sony FE 35mm" }],
      { provider: "s3", bucket: "photos" },
    );
  });
});
