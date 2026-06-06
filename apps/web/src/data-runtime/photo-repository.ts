import type {
  AfilmoryManifest,
  CameraInfo,
  LensInfo,
  PhotoManifestItem,
} from "@afilmory/schema";
import { createEmptyManifest } from "@afilmory/schema";

import { debugLog } from "~/lib/debug-log";

export class PhotoRepository {
  private readonly photos: PhotoManifestItem[];
  private readonly photoMap: Map<string, PhotoManifestItem>;
  private readonly cameras: CameraInfo[];
  private readonly lenses: LensInfo[];

  constructor(manifest: AfilmoryManifest = createEmptyManifest()) {
    this.photos = manifest.photos;
    this.cameras = manifest.indexes.cameras;
    this.lenses = manifest.indexes.lenses;
    this.photoMap = new Map(
      this.photos.flatMap((photo) => (photo?.id ? [[photo.id, photo]] : [])),
    );

    debugLog(
      `[PhotoRepository] Loaded ${this.photos.length} photos from manifest`,
    );
  }

  getPhotos(): PhotoManifestItem[] {
    return this.photos;
  }

  getPhoto(id: string): PhotoManifestItem | undefined {
    return this.photoMap.get(id);
  }

  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const photo of this.photos) {
      for (const tag of photo.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }

  getAllCameras(): CameraInfo[] {
    return this.cameras;
  }

  getAllLenses(): LensInfo[] {
    return this.lenses;
  }
}
