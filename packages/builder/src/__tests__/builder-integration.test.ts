import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assertManifest } from "@afilmory/schema";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AfilmoryBuilder } from "../builder/builder.js";
import { createDefaultBuilderConfig } from "../config/defaults.js";
import { getDisplayImageFileName } from "../image/display-images.js";
import {
  getThumbnailFileNameFromUrl,
  isThumbnailEncodingStale,
} from "../image/thumbnail.js";
import type { BuilderConfig } from "../types/config.js";
import type { BuilderOptions } from "../types/options.js";

/**
 * 为什么存在这个测试（收口用的唯一一条真实链路测试）：
 *
 * 本仓的其余 builder 测试全部跑在 mock 之下——存储、sharp、exiftool、缩略图落盘
 * 都是替身。于是 AfilmoryBuilder.buildManifest → 图片管道 → 处理器 这条"产品的核心
 * 承诺"（扫描存储 → 产出合法 manifest + 缩略图，并且能增量）从未被任何测试真正执行过。
 * 一次审计把这条"从未被执行的核心路径"列为必须补齐的缺口。
 *
 * 这个测试就是那条收口：用 sharp 生成真实的小 JPEG，走 provider:"local" 真实文件系统，
 * 真正调用 exiftool + sharp + thumbhash，把 manifest 与缩略图真正写到磁盘，然后断言：
 *   1. 落盘的 manifest 能通过 @afilmory/schema 的严格 assertManifest（web 构建的闸门）；
 *   2. 首次构建把每张照片都当新照片处理，产出缩略图、thumbHash、尺寸/宽高比；
 *   3. 同配置再构建一次是完全增量的（没有任何照片被重新处理，全部照片被保留）；
 *   4. 删掉一张源文件后，该照片连同其缩略图被正确清理。
 *   5. (second test) a photo whose reprocessing fails is dropped from the
 *      manifest, but its still-reusable thumbnail survives the orphan cleanup
 *      (failure containment via the keepPhotoIds chain in builder.ts).
 *
 * 只要这条链路里的任何一环真的坏了（而不仅仅是 mock 的契约漂了），这个测试就会红。
 */

// 真实生成的源图：三种不同宽高比，避免"宽高被读错却恰好相等"这类假阳性。
const FIXTURES = [
  {
    name: "red-64x48.jpg",
    width: 64,
    height: 48,
    bg: { r: 200, g: 40, b: 40 },
  },
  {
    name: "green-48x64.jpg",
    width: 48,
    height: 64,
    bg: { r: 40, g: 200, b: 40 },
  },
  {
    name: "blue-32x32.jpg",
    width: 32,
    height: 32,
    bg: { r: 40, g: 40, b: 200 },
  },
] as const;

// 第三次构建要删掉的那张（连同它的缩略图应当被清理）。
const DELETED_FIXTURE = FIXTURES.at(-1)!;

// The fixture corrupted in the failure-containment scenario. Must be one that
// survives build #3 (i.e. not DELETED_FIXTURE).
const CORRUPTED_FIXTURE = FIXTURES[1];

const BUILD_OPTIONS: BuilderOptions = {
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
};

let tmpDir: string;
let sourceDir: string;
let manifestPath: string;
let thumbnailsDir: string;
let config: BuilderConfig;

// 每个构建都用一个全新的 AfilmoryBuilder；ExifService 包着 exiftool-vendored 的常驻
// 子进程，忘了 dispose 会让 vitest 永远挂住。这里统一登记、在 afterAll 兜底 dispose，
// 即使中途某个断言抛错，已创建的 builder 也都会被关闭。
const createdBuilders: AfilmoryBuilder[] = [];

function makeBuilder(): AfilmoryBuilder {
  // 直接 new AfilmoryBuilder(fullConfig) —— 与 CLI 里 resolveBuilderConfig 产出完整
  // BuilderConfig 后 `new AfilmoryBuilder(config)` 的构造路径一致；这里跳过 c12 装载与
  // schema 校验，直接给一个已完整的 config（构造器会把 output 幂等归一成绝对路径）。
  const builder = new AfilmoryBuilder(config);
  createdBuilders.push(builder);
  return builder;
}

async function generateJpeg(
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 3, background },
  })
    .jpeg()
    .toBuffer();
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readManifestFromDisk() {
  const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
  // 严格断言：这正是 web 构建用来卡关的门；刚生成的 manifest 必须无损通过。
  return assertManifest(raw);
}

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "afilmory-builder-it-"));
  sourceDir = path.join(tmpDir, "source");
  await mkdir(sourceDir, { recursive: true });

  for (const fixture of FIXTURES) {
    await writeFile(
      path.join(sourceDir, fixture.name),
      await generateJpeg(fixture.width, fixture.height, fixture.bg),
    );
  }

  manifestPath = path.join(tmpDir, "out", "photos-manifest.json");
  thumbnailsDir = path.join(tmpDir, "out", "thumbnails");
  const originalsDir = path.join(tmpDir, "out", "originals");

  config = createDefaultBuilderConfig();
  // provider:"local" 需要绝对 basePath；用临时目录的绝对路径。字段名以 LocalConfig 为准：
  // { provider, basePath, baseUrl }。baseUrl 决定 originalUrl 前缀（/photos/<key>）。
  config.user = {
    storage: { provider: "local", basePath: sourceDir, baseUrl: "/photos" },
  };
  config.output = { manifestPath, thumbnailsDir, originalsDir };
  // 强制非 cluster：本测试图片数很少（< concurrency*2 本就不会进 cluster），但显式关掉
  // useClusterMode，锁定走主进程内的并发池路径，避免依赖"任务数阈值"这种隐式条件。
  config.system.processing.worker.useClusterMode = false;
  // 无插件：不加载 geocoding（否则会走网络），也不挂远端缩略图存储——缩略图只落本地。
  config.plugins = [];
});

afterAll(async () => {
  for (const builder of createdBuilders) {
    // ExifService.close() 幂等；不 dispose 会泄漏常驻 exiftool 进程并挂住 vitest。
    builder.dispose();
  }
  await rm(tmpDir, { recursive: true, force: true });
});

describe("AfilmoryBuilder end-to-end (real sharp + exiftool + local FS)", () => {
  it("scans local storage into a valid manifest + thumbnails, then rebuilds incrementally and prunes deletions", async () => {
    // ---- 构建 #1：全新，每张都是新照片 ----
    const first = await makeBuilder().buildManifest(BUILD_OPTIONS);

    expect(first.newCount).toBe(FIXTURES.length);
    expect(first.processedCount).toBe(FIXTURES.length);
    expect(first.failedCount).toBe(0);
    expect(first.skippedCount).toBe(0);
    expect(first.deletedCount).toBe(0);
    expect(first.totalPhotos).toBe(FIXTURES.length);
    expect(first.hasUpdates).toBe(true);
    // Programmatic builds own the same encoding compatibility protocol as CLI.
    expect(await isThumbnailEncodingStale(thumbnailsDir)).toBe(false);

    // (a) 落盘 manifest 通过严格 assertManifest。
    const manifest = await readManifestFromDisk();
    expect(manifest.photos).toHaveLength(FIXTURES.length);

    const byKey = new Map(manifest.photos.map((photo) => [photo.s3Key, photo]));

    for (const fixture of FIXTURES) {
      const item = byKey.get(fixture.name);
      expect(item, `manifest 应包含 ${fixture.name}`).toBeDefined();
      if (!item) continue;

      // (c) 尺寸/宽高比与源图一致。
      expect(item.width).toBe(fixture.width);
      expect(item.height).toBe(fixture.height);
      expect(item.aspectRatio).toBeCloseTo(fixture.width / fixture.height, 5);

      // 缩略图 URL 是内容寻址的 immutable 资产；编码或内容变化都会换 URL。
      expect(item.thumbnailUrl).toBeTruthy();
      expect(item.thumbnailUrl).toMatch(
        new RegExp(
          `^/thumbnails/${item.id}\\.[\\da-f]{64}\\.[\\da-f]{12}\\.jpg$`,
        ),
      );

      // thumbHash 非空，且是 uint8ArrayToHex 产出的十六进制字符串。
      expect(item.thumbHash).toBeTruthy();
      expect(item.thumbHash).toMatch(/^[\da-f]+$/i);

      // originalUrl 由本地 baseUrl(/photos) + key 拼出。
      expect(item.originalUrl).toBe(`/photos/${fixture.name}`);
      // Small originals produce one full-size derivative, never three upscales.
      expect(item.displayImages).toHaveLength(1);
      expect(item.displayImages![0]).toMatchObject({
        width: fixture.width,
        height: fixture.height,
      });
      const displayPath = path.join(
        thumbnailsDir,
        getDisplayImageFileName(item.displayImages![0].url, item.id)!,
      );
      expect(await pathExists(displayPath)).toBe(true);
      expect(await sharp(displayPath).metadata()).toMatchObject({
        width: fixture.width,
        height: fixture.height,
        format: "jpeg",
      });

      // 缩略图 .jpg 实际落盘（每张一个）。
      expect(
        await pathExists(
          path.join(
            thumbnailsDir,
            getThumbnailFileNameFromUrl(item.thumbnailUrl)!,
          ),
        ),
        `${fixture.name} 的缩略图应已落盘`,
      ).toBe(true);
    }

    // ---- 构建 #2：同配置、全新 builder —— 完全增量 ----
    const second = await makeBuilder().buildManifest(BUILD_OPTIONS);

    expect(second.newCount).toBe(0);
    expect(second.processedCount).toBe(0);
    expect(second.failedCount).toBe(0);
    expect(second.deletedCount).toBe(0);
    // 全部照片被保留：这才是"增量"的实质证据。
    expect(second.totalPhotos).toBe(FIXTURES.length);
    expect(second.hasUpdates).toBe(false);
    // 注意：当没有任何任务入队时，builder 走"空任务"快路径（addExistingItems），
    // 保留的照片走 totalPhotos 记账，并不计入 skippedCount —— 因此这里是 0，而不是总数。
    // “没有照片被重新处理”由 processedCount === 0 && totalPhotos === 全量 共同保证。
    expect(second.skippedCount).toBe(0);

    // 第二次构建后 manifest 仍完整且合法。
    const manifestAfterSecond = await readManifestFromDisk();
    expect(manifestAfterSecond.photos).toHaveLength(FIXTURES.length);
    expect(manifestAfterSecond.generatedAt).toBe(manifest.generatedAt);

    // Restoring a partial artifact cache must repair only the missing variant.
    const missing = manifestAfterSecond.photos[0];
    const missingDisplayPath = path.join(
      thumbnailsDir,
      getDisplayImageFileName(missing.displayImages![0].url, missing.id)!,
    );
    await rm(missingDisplayPath);
    const repaired = await makeBuilder().buildManifest(BUILD_OPTIONS);
    expect(repaired.processedCount).toBe(1);
    expect(repaired.failedCount).toBe(0);
    expect(await pathExists(missingDisplayPath)).toBe(true);
    expect(
      (await readManifestFromDisk()).photos.find((p) => p.id === missing.id)
        ?.thumbnailUrl,
    ).toBe(missing.thumbnailUrl);

    // A zero-byte artifact is present in readdir but must still be repaired
    // by the planner, before the worker gets a chance to validate its source.
    await writeFile(missingDisplayPath, Buffer.alloc(0));
    const repairedEmpty = await makeBuilder().buildManifest(BUILD_OPTIONS);
    expect(repairedEmpty.processedCount).toBe(1);
    expect(repairedEmpty.failedCount).toBe(0);
    expect(await sharp(missingDisplayPath).metadata()).toMatchObject({
      width: missing.displayImages![0].width,
      height: missing.displayImages![0].height,
      format: "jpeg",
    });

    // A pre-upgrade v2 manifest stays valid and acquires derivatives on its
    // next healthy incremental build, even though the original did not change.
    const legacy = await readManifestFromDisk();
    delete legacy.photos[0].displayImages;
    delete legacy.photos[0].processing!.displayImages;
    await writeFile(manifestPath, JSON.stringify(legacy));
    const backfilled = await makeBuilder().buildManifest(BUILD_OPTIONS);
    expect(backfilled.processedCount).toBe(1);
    expect((await readManifestFromDisk()).photos[0].displayImages).toHaveLength(
      1,
    );

    // 记下将被删除那张照片的 id 与缩略图路径（删除前它应当在场）。
    const deletedItem = new Map(
      manifestAfterSecond.photos.map((photo) => [photo.s3Key, photo]),
    ).get(DELETED_FIXTURE.name);
    expect(deletedItem).toBeDefined();
    const deletedThumbnailPath = path.join(
      thumbnailsDir,
      getThumbnailFileNameFromUrl(deletedItem!.thumbnailUrl)!,
    );
    expect(await pathExists(deletedThumbnailPath)).toBe(true);
    const deletedDisplayPaths = deletedItem!.displayImages!.map((image) =>
      path.join(
        thumbnailsDir,
        getDisplayImageFileName(image.url, deletedItem!.id)!,
      ),
    );

    // ---- 构建 #3：删掉一张源文件 —— 该照片与其缩略图应被清理 ----
    await rm(path.join(sourceDir, DELETED_FIXTURE.name));

    const third = await makeBuilder().buildManifest(BUILD_OPTIONS);

    // (e) 恰好删除一张。
    expect(third.deletedCount).toBe(1);
    expect(third.newCount).toBe(0);
    expect(third.processedCount).toBe(0);
    expect(third.failedCount).toBe(0);
    expect(third.totalPhotos).toBe(FIXTURES.length - 1);
    expect(third.hasUpdates).toBe(true);

    // 该照片从 manifest 消失；其余照片仍在。
    const manifestAfterThird = await readManifestFromDisk();
    const keysAfterThird = new Set(
      manifestAfterThird.photos.map((photo) => photo.s3Key),
    );
    expect(keysAfterThird.has(DELETED_FIXTURE.name)).toBe(false);
    expect(manifestAfterThird.photos).toHaveLength(FIXTURES.length - 1);

    // 缩略图被物理删除；被保留照片的缩略图仍在。
    expect(await pathExists(deletedThumbnailPath)).toBe(false);
    for (const displayPath of deletedDisplayPaths)
      expect(await pathExists(displayPath)).toBe(false);
    for (const photo of manifestAfterThird.photos) {
      expect(
        await pathExists(
          path.join(
            thumbnailsDir,
            getThumbnailFileNameFromUrl(photo.thumbnailUrl)!,
          ),
        ),
      ).toBe(true);
    }
  }, 60_000);

  it("contains a single processing failure without deleting the photo's reusable thumbnail", async () => {
    // Continues from the previous test's terminal state: the two surviving
    // photos are in the manifest with their thumbnails on disk.
    const manifestBefore = await readManifestFromDisk();
    expect(manifestBefore.photos).toHaveLength(FIXTURES.length - 1);

    const corruptedItem = new Map(
      manifestBefore.photos.map((photo) => [photo.s3Key, photo]),
    ).get(CORRUPTED_FIXTURE.name);
    expect(corruptedItem).toBeDefined();
    const corruptedThumbnailPath = path.join(
      thumbnailsDir,
      getThumbnailFileNameFromUrl(corruptedItem!.thumbnailUrl)!,
    );
    expect(await pathExists(corruptedThumbnailPath)).toBe(true);
    const corruptedDisplayPaths = corruptedItem!.displayImages!.map((image) =>
      path.join(
        thumbnailsDir,
        getDisplayImageFileName(image.url, corruptedItem!.id)!,
      ),
    );

    const survivorThumbnailPaths = manifestBefore.photos
      .filter((photo) => photo.s3Key !== CORRUPTED_FIXTURE.name)
      .map((photo) =>
        path.join(
          thumbnailsDir,
          getThumbnailFileNameFromUrl(photo.thumbnailUrl)!,
        ),
      );
    expect(survivorThumbnailPaths).not.toHaveLength(0);

    // ---- Build #4: reprocessing an EXISTING photo fails ----
    // Overwrite the source with bytes sharp cannot decode, and bump mtime past
    // the manifest's lastModified so decidePhotoWork schedules a reprocess
    // (the size/etag change would also trigger it; the bump makes it explicit).
    const corruptedSourcePath = path.join(sourceDir, CORRUPTED_FIXTURE.name);
    await writeFile(corruptedSourcePath, Buffer.from("definitely not a JPEG"));
    const bumpedMtime = new Date(Date.now() + 5000);
    await utimes(corruptedSourcePath, bumpedMtime, bumpedMtime);

    const fourth = await makeBuilder().buildManifest(BUILD_OPTIONS);

    // Exactly the corrupted photo fails; nothing is added or reprocessed. The
    // failed reprocess is excluded from the skip counter (only the untouched
    // photo counts as skipped).
    expect(fourth.failedCount).toBe(1);
    expect(fourth.newCount).toBe(0);
    expect(fourth.processedCount).toBe(0);
    expect(fourth.skippedCount).toBe(FIXTURES.length - 2);
    expect(fourth.hasUpdates).toBe(false);

    // Pinned current behavior (manifest-assembler.addUnchangedExistingItems):
    // a failed reprocess of a photo that already has manifest data KEEPS the
    // previous (possibly stale) entry, so the photo does not vanish from the
    // gallery because of one transient failure.
    expect(fourth.totalPhotos).toBe(FIXTURES.length - 1);
    const manifestAfterFourth = await readManifestFromDisk();
    const keptStaleItem = new Map(
      manifestAfterFourth.photos.map((photo) => [photo.s3Key, photo]),
    ).get(CORRUPTED_FIXTURE.name);
    expect(keptStaleItem).toEqual(corruptedItem);

    // No thumbnail is orphan-collected: the kept entry protects its own.
    expect(fourth.deletedCount).toBe(0);
    expect(await pathExists(corruptedThumbnailPath)).toBe(true);
    for (const displayPath of corruptedDisplayPaths)
      expect(await pathExists(displayPath)).toBe(true);

    // ---- Build #5: the failed photo is NOT in the loaded manifest ----
    // Drop the corrupted photo's record from the on-disk manifest, simulating
    // the shape of the real incident: the photo exists in storage and its
    // thumbnail exists on disk, but the manifest has no entry for it (e.g. a
    // corrupt record skipped by lenient parsing, or a --force-manifest run).
    // Reprocessing it as a "new" photo fails again, and this time nothing in
    // the manifest protects its thumbnail — only the keepPhotoIds chain
    // (builder.ts -> ArtifactWriter -> handleDeletedPhotos) does.
    const rawManifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    rawManifest.photos = rawManifest.photos.filter(
      (photo: { s3Key: string }) => photo.s3Key !== CORRUPTED_FIXTURE.name,
    );
    await writeFile(manifestPath, JSON.stringify(rawManifest, null, 2));

    const fifth = await makeBuilder().buildManifest(BUILD_OPTIONS);

    // The photo fails as a would-be new photo (failed tasks never increment
    // newCount) and stays absent from the manifest.
    expect(fifth.failedCount).toBe(1);
    expect(fifth.newCount).toBe(0);
    expect(fifth.processedCount).toBe(0);
    expect(fifth.skippedCount).toBe(FIXTURES.length - 2);
    expect(fifth.totalPhotos).toBe(FIXTURES.length - 2);

    const manifestAfterFifth = await readManifestFromDisk();
    const keysAfterFifth = new Set(
      manifestAfterFifth.photos.map((photo) => photo.s3Key),
    );
    expect(keysAfterFifth.has(CORRUPTED_FIXTURE.name)).toBe(false);
    expect(manifestAfterFifth.photos).toHaveLength(FIXTURES.length - 2);

    // Containment: the source object still exists in storage, so the failed
    // photo's pre-existing thumbnail must NOT be orphan-collected. A transient
    // batch failure once wiped every reusable thumbnail and artifact-cache
    // persisted the shrunken state — the keepPhotoIds chain exists to prevent
    // exactly that. Dropping { keepPhotoIds } in builder.ts turns this red.
    expect(fifth.deletedCount).toBe(0);
    expect(await pathExists(corruptedThumbnailPath)).toBe(true);

    // ...and no unrelated thumbnails were deleted either.
    for (const thumbnailPath of survivorThumbnailPaths) {
      expect(await pathExists(thumbnailPath)).toBe(true);
    }
  }, 60_000);
});
