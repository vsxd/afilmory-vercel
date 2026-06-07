import { handleDeletedPhotos, saveManifest } from "../../manifest/manager.js";
import type { CameraInfo, LensInfo } from "../../types/manifest.js";
import type { PhotoManifestItem } from "../../types/photo.js";
import { ManifestAssembler } from "./manifest-assembler.js";
import type { BuildSession } from "./session.js";

export interface ArtifactWriteResult {
  cameras: CameraInfo[];
  lenses: LensInfo[];
  deletedCount: number;
}

export class ArtifactWriter {
  private readonly assembler = new ManifestAssembler();

  async write(
    session: BuildSession,
    manifest: PhotoManifestItem[],
  ): Promise<ArtifactWriteResult> {
    const deletedCount = await handleDeletedPhotos(manifest);

    await session.emit("afterCleanup", {
      options: session.options,
      manifest,
      deletedCount,
    });

    const cameras = this.assembler.generateCameraCollection(manifest);
    const lenses = this.assembler.generateLensCollection(manifest);

    await session.emit("beforeSaveManifest", {
      options: session.options,
      manifest,
      cameras,
      lenses,
    });

    await saveManifest(manifest, cameras, lenses, session.getManifestSource());

    await session.emit("afterSaveManifest", {
      options: session.options,
      manifest,
      cameras,
      lenses,
    });

    return {
      cameras,
      lenses,
      deletedCount,
    };
  }
}
