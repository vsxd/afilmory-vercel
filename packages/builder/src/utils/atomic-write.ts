import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

async function syncDirectory(dir: string): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(dir, "r");
    await handle.sync();
  } catch (error) {
    // Some platforms/filesystems do not allow opening or fsyncing a directory.
    // The destination is still atomically replaced; ignore only known
    // unsupported cases rather than hiding genuine I/O failures.
    const { code } = error as NodeJS.ErrnoException;
    if (!["EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(code ?? "")) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}

/**
 * Atomically and durably write a file.
 *
 * Writes to a uniquely-named temporary file in the SAME directory (so the
 * final `rename` is a same-filesystem, atomic operation), fsyncs the data to
 * disk, then renames it into place. A crash or kill mid-write can therefore
 * never leave a partially-written / truncated destination file — readers see
 * either the old contents or the complete new contents, never a torn file.
 *
 * This matters for artifacts like `photos-manifest.json`: a torn manifest is
 * unparseable JSON, so the lenient loader discards the cache and the next
 * build pays a full rebuild; worse, a deploy that reads the torn file fails
 * the web build's `assertManifest` gate outright.
 */
export async function writeFileAtomic(
  filePath: string,
  data: string | Uint8Array,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = path.join(dir, `.afilmory-${crypto.randomUUID()}.tmp`);

  let handle: fs.FileHandle | undefined;
  try {
    // `wx` prevents following a pre-existing path/symlink. UUID names make a
    // collision practically impossible; if one occurs, failing is safer than
    // clobbering another writer's temporary file.
    handle = await fs.open(tmpPath, "wx", 0o666);
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
  handle = undefined;

  try {
    await fs.rename(tmpPath, filePath);
    // Persist the renamed directory entry as well as the file data.
    await syncDirectory(dir);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}
