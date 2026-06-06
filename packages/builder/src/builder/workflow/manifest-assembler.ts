import type { CameraInfo, LensInfo } from "../../types/manifest.js";
import type {
  PhotoManifestItem,
  ProcessPhotoResult,
} from "../../types/photo.js";
import type { BuildSession } from "./session.js";

export class ManifestAssembler {
  async addExistingItems(
    session: BuildSession,
    manifest: PhotoManifestItem[],
    existingManifestItems: PhotoManifestItem[],
    s3ImageKeys: Set<string>,
  ): Promise<void> {
    for (const item of existingManifestItems) {
      if (!s3ImageKeys.has(item.s3Key)) continue;

      await session.emit("beforeAddManifestItem", {
        options: session.options,
        item,
        pluginData: {},
        resultType: "skipped",
      });

      manifest.push(item);
    }
  }

  async addProcessedResults(
    session: BuildSession,
    manifest: PhotoManifestItem[],
    results: ProcessPhotoResult[],
  ): Promise<void> {
    for (const result of results) {
      if (!result.item) continue;

      await session.emit("beforeAddManifestItem", {
        options: session.options,
        item: result.item,
        pluginData: result.pluginData ?? {},
        resultType: result.type,
      });

      manifest.push(result.item);
    }
  }

  async addUnchangedExistingItems(
    session: BuildSession,
    manifest: PhotoManifestItem[],
    existingManifestMap: Map<string, PhotoManifestItem>,
    s3ImageKeys: Set<string>,
  ): Promise<number> {
    let skippedCount = 0;
    const manifestKeys = new Set(manifest.map((item) => item.s3Key));

    for (const [key, item] of existingManifestMap) {
      if (!s3ImageKeys.has(key) || manifestKeys.has(key)) {
        continue;
      }

      await session.emit("beforeAddManifestItem", {
        options: session.options,
        item,
        pluginData: {},
        resultType: "skipped",
      });

      manifest.push(item);
      manifestKeys.add(item.s3Key);
      skippedCount++;
    }

    return skippedCount;
  }

  generateCameraCollection(manifest: PhotoManifestItem[]): CameraInfo[] {
    const cameraMap = new Map<string, CameraInfo>();

    for (const photo of manifest) {
      if (!photo.exif?.Make || !photo.exif?.Model) continue;

      const make = photo.exif.Make.trim();
      const model = photo.exif.Model.trim();
      const displayName = `${make} ${model}`;

      if (!cameraMap.has(displayName)) {
        cameraMap.set(displayName, {
          make,
          model,
          displayName,
        });
      }
    }

    return Array.from(cameraMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }

  generateLensCollection(manifest: PhotoManifestItem[]): LensInfo[] {
    const lensMap = new Map<string, LensInfo>();

    for (const photo of manifest) {
      if (!photo.exif?.LensModel) continue;

      const lensModel = photo.exif.LensModel.trim();
      const lensMake = photo.exif.LensMake?.trim();
      const displayName = lensMake ? `${lensMake} ${lensModel}` : lensModel;

      if (!lensMap.has(displayName)) {
        lensMap.set(displayName, {
          make: lensMake,
          model: lensModel,
          displayName,
        });
      }
    }

    return Array.from(lensMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }
}
