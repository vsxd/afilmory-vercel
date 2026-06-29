import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Atomically and durably write a file.
 *
 * Writes to a uniquely-named temporary file in the SAME directory (so the
 * final `rename` is a same-filesystem, atomic operation), fsyncs the data to
 * disk, then renames it into place. A crash or kill mid-write can therefore
 * never leave a partially-written / truncated destination file — readers see
 * either the old contents or the complete new contents, never a torn file.
 *
 * This matters for artifacts like `photos-manifest.json`: a truncated manifest
 * makes every subsequent build throw at `assertManifest`, permanently breaking
 * the pipeline until the file is manually removed.
 */
export async function writeFileAtomic(
  filePath: string,
  data: string | Uint8Array,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(tmpPath, "w");
    await handle.writeFile(data);
    // Flush to disk before the rename so the rename can't expose an empty file
    // after a power loss.
    await handle.sync();
  } catch (error) {
    await handle?.close();
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
  await handle.close();

  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}
