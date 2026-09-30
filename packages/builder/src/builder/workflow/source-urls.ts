import type { BuilderStorage } from "../../core/contracts/storage.js";
import type { StorageConfig } from "../../storage/interfaces.js";
import { DEFAULT_LOCAL_BASE_URL } from "../../storage/providers/local-provider.js";
import { generateS3PublicUrl } from "../../storage/providers/s3-provider.js";
import { joinPublicUrl } from "../../storage/url.js";
import type { ManifestSource } from "../../types/manifest.js";
import type { PhotoManifestItem } from "../../types/photo.js";

function isProviderUrl(
  url: string,
  key: string,
  source: ManifestSource,
): boolean {
  if (source.provider === "local") {
    return url === joinPublicUrl(source.baseUrl ?? DEFAULT_LOCAL_BASE_URL, key);
  }
  if (source.provider !== "s3" || !source.bucket) return false;
  try {
    // Manifest v2 did not store forcePathStyle. Both provider-generated forms
    // are recognizable without assuming the current addressing policy.
    return [true, false].some(
      (forcePathStyle) =>
        url ===
        generateS3PublicUrl(
          { ...source, bucket: source.bucket!, forcePathStyle },
          key,
        ),
    );
  } catch {
    // Lenient cache loading may recover a malformed source descriptor. Never
    // guess ownership of a plugin URL from a broken historical descriptor.
    return false;
  }
}

/** Refresh cached URLs before plugins run; decoding source bytes is unnecessary. */
export async function refreshCachedSourceUrls(
  photos: PhotoManifestItem[],
  previousSource: ManifestSource,
  storage: StorageConfig,
  manager: Pick<BuilderStorage, "generatePublicUrl">,
): Promise<void> {
  const refresh = async (url: string, key: string): Promise<string> =>
    storage.provider === "local" || isProviderUrl(url, key, previousSource)
      ? await manager.generatePublicUrl(key)
      : url;

  for (const photo of photos) {
    photo.originalUrl = await refresh(photo.originalUrl, photo.s3Key);
    if (photo.video?.type === "live-photo") {
      photo.video.videoUrl = await refresh(
        photo.video.videoUrl,
        photo.video.s3Key,
      );
    }
  }
}
