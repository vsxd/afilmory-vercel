import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { $ } from "execa";

import { getBuilderOutputSettings, webAppDir } from "../output-paths.js";
import type { BuilderPlugin } from "./types.js";

const RUN_SHARED_ASSETS_DIR = "assetsGitDir";
const RUN_SHARED_SYNC_ENABLED = "repoSyncEnabled";
const CACHE_MANIFEST_FILE = "photos-manifest.json";
const CACHE_GEOCODING_FILE = "geocoding-cache.json";
const CACHE_THUMBNAILS_DIR = "thumbnails";
const CACHE_ROOT_ENTRIES = new Set([
  ".git",
  CACHE_MANIFEST_FILE,
  CACHE_GEOCODING_FILE,
  CACHE_THUMBNAILS_DIR,
]);
const CACHE_STAGE_PATHS = [
  CACHE_MANIFEST_FILE,
  CACHE_GEOCODING_FILE,
  CACHE_THUMBNAILS_DIR,
] as const;
const GIT_ASKPASS_SCRIPT = fileURLToPath(
  new URL("git-askpass.js", import.meta.url),
);
const GIT_HTTP_USERNAME = "x-access-token";
const GIT_ENV_ALLOWLIST = [
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PATH",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TMP",
  "TMPDIR",
  "XDG_CONFIG_HOME",
] as const;

type BuilderLogger = typeof import("../logger/index.js").logger;

export interface GitHubRepoSyncPluginOptions {
  autoPush?: boolean;
}

interface RepoConfig {
  enable: boolean;
  url: string;
  token?: string;
}

interface RemoteCachePaths {
  assetsGitDir: string;
  manifestPath: string;
  thumbnailsDir: string;
  geocodingCachePath: string;
  repoManifestPath: string;
  repoThumbnailsDir: string;
  repoGeocodingCachePath: string;
}

export default function githubRepoSyncPlugin(
  options: GitHubRepoSyncPluginOptions = {},
): BuilderPlugin {
  const autoPush = options.autoPush ?? true;

  return {
    name: "afilmory:github-repo-sync",
    hooks: {
      beforeBuild: async (context) => {
        const userConfig = context.config.user;
        if (!userConfig) {
          context.logger.main.warn("⚠️ 未配置用户级设置，跳过远程仓库同步");
          return;
        }

        if (!userConfig.repo.enable) {
          return;
        }

        const { logger } = context;
        const { repo } = userConfig;

        if (!repo.url) {
          logger.main.warn("⚠️ 未配置远程仓库地址，跳过同步");
          return;
        }

        const assetsGitDir = path.resolve(webAppDir, "assets-git");
        context.runShared.set(RUN_SHARED_ASSETS_DIR, assetsGitDir);
        context.runShared.set(RUN_SHARED_SYNC_ENABLED, false);

        logger.main.info("🔄 同步远程缓存仓库...");

        try {
          await ensureLocalOutputLayout({ assetsGitDir, logger });
          await syncRemoteCacheRepository({
            assetsGitDir,
            logger,
            repoConfig: repo,
          });
          await prepareRepositoryLayout({ assetsGitDir, logger });
          context.runShared.set(RUN_SHARED_SYNC_ENABLED, true);
          logger.main.success("✅ 远程缓存仓库已就绪");
        } catch (error) {
          context.runShared.set(RUN_SHARED_SYNC_ENABLED, false);
          logger.main.warn("⚠️ 远程缓存仓库同步失败，改用本地构建输出");
          logger.main.warn(
            error instanceof Error ? error.message : String(error),
          );

          try {
            await restoreLocalOutputLayout({ assetsGitDir, logger });
            logger.main.warn("⚠️ 已恢复本地 manifest / thumbnails 输出");
          } catch (restoreError) {
            logger.main.error("❌ 恢复本地构建输出失败，后续构建可能中断");
            logger.main.error(
              restoreError instanceof Error
                ? restoreError.message
                : String(restoreError),
            );
          }
        }
      },
      afterBuild: async (context) => {
        const userConfig = context.config.user;
        if (!userConfig) {
          context.logger.main.warn("⚠️ 未配置用户级设置，跳过远程缓存写回");
          return;
        }

        if (!userConfig.repo.enable) {
          return;
        }

        const { result } = context.payload;
        const assetsGitDir = context.runShared.get(RUN_SHARED_ASSETS_DIR) as
          | string
          | undefined;
        const syncEnabled = context.runShared.get(RUN_SHARED_SYNC_ENABLED) as
          | boolean
          | undefined;

        if (!syncEnabled || !assetsGitDir) {
          context.logger.main.warn("⚠️ 远程缓存仓库未就绪，跳过写回");
          return;
        }

        if (!result.hasUpdates) {
          context.logger.main.info(
            "💡 没有照片增删改，继续检查 manifest / cache 变更",
          );
        }

        try {
          await persistBuildOutputsToRepository({
            assetsGitDir,
            logger: context.logger,
          });

          if (!autoPush) {
            context.logger.main.info("💡 已写回本地缓存仓库，按配置跳过推送");
            return;
          }

          await pushUpdatesToRemoteRepo({
            assetsGitDir,
            logger: context.logger,
            repoConfig: userConfig.repo,
          });
        } catch (error) {
          context.logger.main.warn(
            "⚠️ 远程缓存仓库写回失败，构建结果已保留在本地",
          );
          context.logger.main.warn(
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    },
  };
}

interface PrepareRepositoryLayoutOptions {
  assetsGitDir: string;
  logger: BuilderLogger;
}

interface OutputLayoutOptions {
  assetsGitDir?: string;
  logger: BuilderLogger;
}

interface SyncRemoteCacheRepositoryOptions {
  assetsGitDir: string;
  logger: BuilderLogger;
  repoConfig: RepoConfig;
}

interface PersistRepositoryOptions {
  assetsGitDir: string;
  logger: BuilderLogger;
}

interface PushRemoteOptions {
  assetsGitDir: string;
  logger: BuilderLogger;
  repoConfig: RepoConfig;
}

interface DirectorySnapshot {
  rootDir: string;
  path: string;
}

export async function syncRemoteCacheRepository({
  assetsGitDir,
  logger,
  repoConfig,
}: SyncRemoteCacheRepositoryOptions): Promise<void> {
  if (!repoConfig.url) {
    throw new Error("未配置远程仓库地址");
  }

  await assertAssetsGitDirIsSafe(assetsGitDir, {
    enforceInsideWebAppDir: true,
  });

  const gitEnv = buildGitAuthenticationEnv(repoConfig.url, repoConfig.token);

  if (!(await pathExists(assetsGitDir))) {
    logger.main.info("📥 克隆远程缓存仓库...");
    await fs.mkdir(path.dirname(assetsGitDir), { recursive: true });
    await $({
      cwd: path.dirname(assetsGitDir),
      ...getGitAuthenticationExecaOptions(gitEnv),
      stdio: "inherit",
    })`git clone ${repoConfig.url} ${path.basename(assetsGitDir)}`;
    return;
  }

  if (!(await isGitWorkTree(assetsGitDir))) {
    logger.main.warn("⚠️ assets-git 不是有效 Git 仓库，尝试 fresh clone");
    await replaceRepositoryWithFreshClone({
      assetsGitDir,
      gitEnv,
      logger,
      repoUrl: repoConfig.url,
    });
    return;
  }

  await ensureOriginUrl(assetsGitDir, repoConfig.url);

  logger.main.info("🔄 拉取远程缓存仓库更新...");
  try {
    await $({
      cwd: assetsGitDir,
      ...getGitAuthenticationExecaOptions(gitEnv),
      stdio: "inherit",
    })`git pull --rebase --autostash`;
    const unmergedPaths = await getUnmergedPaths(assetsGitDir);
    if (unmergedPaths.length > 0) {
      logger.main.warn(
        `⚠️ git pull 后仍存在冲突文件，尝试 fresh clone fallback：${unmergedPaths.join(", ")}`,
      );
      await replaceRepositoryWithFreshClone({
        assetsGitDir,
        gitEnv,
        logger,
        repoUrl: repoConfig.url,
      });
    }
  } catch (error) {
    logger.main.warn("⚠️ git pull 快速路径失败，尝试 fresh clone fallback");
    logger.main.warn(error instanceof Error ? error.message : String(error));
    await replaceRepositoryWithFreshClone({
      assetsGitDir,
      gitEnv,
      logger,
      repoUrl: repoConfig.url,
    });
  }
}

export async function prepareRepositoryLayout({
  assetsGitDir,
  logger,
}: PrepareRepositoryLayoutOptions): Promise<void> {
  await assertAssetsGitDirIsSafe(assetsGitDir);

  const paths = getRemoteCachePaths(assetsGitDir);
  await ensureRepositoryCacheFiles(paths, logger);
  await validateRepositoryCacheLayout(paths);
  await hydrateLocalOutputsFromRepository(paths, logger);

  logger.main.info("📦 已从远程缓存仓库恢复 manifest / thumbnails");
}

export async function persistBuildOutputsToRepository({
  assetsGitDir,
  logger,
}: PersistRepositoryOptions): Promise<void> {
  await assertAssetsGitDirIsSafe(assetsGitDir);

  const paths = getRemoteCachePaths(assetsGitDir);

  await copyFileToRepository({
    sourcePath: paths.manifestPath,
    targetPath: paths.repoManifestPath,
    createFallbackContent: createInitialManifestContent,
    label: "manifest",
    logger,
  });
  await copyFileToRepository({
    sourcePath: paths.geocodingCachePath,
    targetPath: paths.repoGeocodingCachePath,
    createFallbackContent: createInitialGeocodingCacheContent,
    label: "geocoding cache",
    logger,
  });
  await copyThumbnailDirectoryReplacing(
    paths.thumbnailsDir,
    paths.repoThumbnailsDir,
  );

  logger.main.info("📦 已写回远程缓存仓库工作区");
}

export async function restoreLocalOutputLayout({
  assetsGitDir = path.resolve(webAppDir, "assets-git"),
  logger,
}: OutputLayoutOptions): Promise<void> {
  const paths = getRemoteCachePaths(assetsGitDir);
  const manifestContent = await fs
    .readFile(paths.manifestPath, "utf-8")
    .catch(() => null);
  const geocodingCacheContent = await fs
    .readFile(paths.geocodingCachePath, "utf-8")
    .catch(() => null);
  const thumbnailsSnapshot = await snapshotDirectory(
    paths.thumbnailsDir,
    paths.assetsGitDir,
  );

  try {
    await replaceFileWithContent(
      paths.manifestPath,
      manifestContent ?? (await createInitialManifestContent()),
    );
    await replaceFileWithContent(
      paths.geocodingCachePath,
      geocodingCacheContent ?? createInitialGeocodingCacheContent(),
    );

    await removePathIfPresent(paths.thumbnailsDir);
    await fs.mkdir(path.dirname(paths.thumbnailsDir), { recursive: true });

    if (thumbnailsSnapshot) {
      await copyThumbnailDirectoryReplacing(
        thumbnailsSnapshot.path,
        paths.thumbnailsDir,
      );
    } else {
      await fs.mkdir(paths.thumbnailsDir, { recursive: true });
    }
  } finally {
    if (thumbnailsSnapshot) {
      await fs.rm(thumbnailsSnapshot.rootDir, { force: true, recursive: true });
    }
  }

  logger.main.info("📁 已恢复本地 manifest / thumbnails 输出布局");
}

async function ensureLocalOutputLayout({
  assetsGitDir = path.resolve(webAppDir, "assets-git"),
  logger,
}: OutputLayoutOptions): Promise<void> {
  const { manifestPath, thumbnailsDir } = getBuilderOutputSettings();
  const geocodingCachePath = getGeocodingCachePath();
  const hasLegacySymlinks = (
    await Promise.all([
      pathIsSymlink(manifestPath),
      pathIsSymlink(geocodingCachePath),
      pathIsSymlink(thumbnailsDir),
    ])
  ).some(Boolean);

  if (!hasLegacySymlinks) {
    return;
  }

  logger.main.info("📁 检测到旧版 cache 软链，正在转成本地输出布局...");
  await restoreLocalOutputLayout({ assetsGitDir, logger });
}

async function ensureRepositoryCacheFiles(
  paths: RemoteCachePaths,
  logger: BuilderLogger,
): Promise<void> {
  await ensureCacheFile({
    cachePath: paths.repoManifestPath,
    localPath: paths.manifestPath,
    createInitialContent: createInitialManifestContent,
    label: "manifest",
    logger,
  });
  await ensureCacheFile({
    cachePath: paths.repoGeocodingCachePath,
    localPath: paths.geocodingCachePath,
    createInitialContent: createInitialGeocodingCacheContent,
    label: "geocoding cache",
    logger,
  });
  await ensureCacheThumbnailsDir(paths, logger);
}

async function hydrateLocalOutputsFromRepository(
  paths: RemoteCachePaths,
  _logger: BuilderLogger,
): Promise<void> {
  await replaceFileWithCopy(paths.manifestPath, paths.repoManifestPath);
  await replaceFileWithCopy(
    paths.geocodingCachePath,
    paths.repoGeocodingCachePath,
  );
  await copyThumbnailDirectoryReplacing(
    paths.repoThumbnailsDir,
    paths.thumbnailsDir,
  );
}

async function validateRepositoryCacheLayout(
  paths: RemoteCachePaths,
): Promise<void> {
  await assertAllowedCacheRootEntries(paths.assetsGitDir);
  await assertRegularFile(paths.repoManifestPath, "远程缓存 manifest");
  await assertRegularFile(
    paths.repoGeocodingCachePath,
    "远程缓存 geocoding cache",
  );
  await assertThumbnailDirectory(
    paths.repoThumbnailsDir,
    "远程缓存 thumbnails",
  );
}

async function assertAllowedCacheRootEntries(
  assetsGitDir: string,
): Promise<void> {
  const entries = await fs.readdir(assetsGitDir, { withFileTypes: true });

  for (const entry of entries) {
    if (CACHE_ROOT_ENTRIES.has(entry.name)) {
      continue;
    }

    throw new Error(`远程缓存仓库包含非缓存文件：${entry.name}`);
  }
}

async function assertRegularFile(
  filePath: string,
  label: string,
): Promise<void> {
  const stat = await fs.lstat(filePath);

  if (stat.isSymbolicLink()) {
    throw new Error(`${label} 不能是符号链接：${filePath}`);
  }

  if (!stat.isFile()) {
    throw new Error(`${label} 必须是普通文件：${filePath}`);
  }
}

async function assertThumbnailDirectory(
  dirPath: string,
  label: string,
): Promise<void> {
  const stat = await fs.lstat(dirPath);

  if (stat.isSymbolicLink()) {
    throw new Error(`${label} 不能是符号链接：${dirPath}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`${label} 必须是目录：${dirPath}`);
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`${label} 不能包含符号链接：${entryPath}`);
    }

    if (entry.isDirectory()) {
      throw new Error(`${label} 只允许第一层 .jpg 文件：${entryPath}`);
    }

    if (!entry.isFile()) {
      throw new Error(`${label} 只能包含普通文件：${entryPath}`);
    }

    if (path.extname(entry.name).toLowerCase() !== ".jpg") {
      throw new Error(`${label} 只能包含 .jpg 文件：${entryPath}`);
    }
  }
}

async function ensureCacheFile(options: {
  cachePath: string;
  localPath: string;
  createInitialContent: () => string | Promise<string>;
  label: string;
  logger: BuilderLogger;
}): Promise<void> {
  const { cachePath, localPath, createInitialContent, label, logger } = options;

  if (await fs.lstat(cachePath).catch(() => null)) {
    return;
  }

  await fs.mkdir(path.dirname(cachePath), { recursive: true });

  const localContent = await readRegularFileIfPresent(localPath);
  if (localContent !== null) {
    logger.main.info(`📄 使用本地 ${label} 初始化远程缓存`);
    await fs.writeFile(cachePath, localContent);
    return;
  }

  logger.main.info(`📄 创建初始 ${label} 缓存文件`);
  await fs.writeFile(cachePath, await createInitialContent());
}

async function ensureCacheThumbnailsDir(
  paths: RemoteCachePaths,
  logger: BuilderLogger,
): Promise<void> {
  const { repoThumbnailsDir, thumbnailsDir } = paths;
  const repoStat = await fs.lstat(repoThumbnailsDir).catch(() => null);

  if (repoStat?.isSymbolicLink()) {
    throw new Error(`远程缓存 thumbnails 不能是符号链接：${repoThumbnailsDir}`);
  }

  if (repoStat && !repoStat.isDirectory()) {
    throw new Error(`远程缓存 thumbnails 必须是目录：${repoThumbnailsDir}`);
  }

  if (repoStat?.isDirectory()) {
    return;
  }

  if (await pathExists(thumbnailsDir)) {
    logger.main.info("📁 使用本地 thumbnails 初始化远程缓存");
    await copyThumbnailDirectoryReplacing(thumbnailsDir, repoThumbnailsDir);
    return;
  }

  logger.main.info("📁 创建初始 thumbnails 缓存目录");
  await fs.mkdir(repoThumbnailsDir, { recursive: true });
}

async function copyFileToRepository(options: {
  sourcePath: string;
  targetPath: string;
  createFallbackContent: () => string | Promise<string>;
  label: string;
  logger: BuilderLogger;
}): Promise<void> {
  const { sourcePath, targetPath, createFallbackContent, label, logger } =
    options;

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  if (await pathExists(sourcePath)) {
    await replaceFileWithCopy(targetPath, sourcePath);
    return;
  }

  logger.main.warn(`⚠️ 本地 ${label} 不存在，写入初始缓存内容`);
  await replaceFileWithContent(targetPath, await createFallbackContent());
}

export async function pushUpdatesToRemoteRepo({
  assetsGitDir,
  logger,
  repoConfig,
}: PushRemoteOptions): Promise<void> {
  if (!repoConfig.url) {
    return;
  }

  if (!repoConfig.token) {
    logger.main.warn("⚠️ 未提供 Git Token，跳过推送到远程缓存仓库");
    return;
  }

  logger.main.info("📤 开始推送远程缓存仓库更新...");
  const gitEnv = buildGitAuthenticationEnv(repoConfig.url, repoConfig.token);

  await ensureGitUserConfigured(assetsGitDir);

  const upstream = await getUpstreamBranch(assetsGitDir);
  if (upstream) {
    const nonCacheAheadPaths = await getNonCacheAheadPaths(
      assetsGitDir,
      upstream,
    );
    if (nonCacheAheadPaths.length > 0) {
      logger.main.warn(
        `⚠️ 存在非缓存 ahead commit，跳过自动推送：${nonCacheAheadPaths.join(", ")}`,
      );
      return;
    }
  }

  const preExistingStagedNonCachePaths =
    await getNonCacheStagedPaths(assetsGitDir);
  if (preExistingStagedNonCachePaths.length > 0) {
    logger.main.warn(
      `⚠️ 存在非缓存 staged 改动，跳过自动提交：${preExistingStagedNonCachePaths.join(", ")}`,
    );
    return;
  }

  const statusBeforeAdd = await getGitStatusPorcelain(assetsGitDir);
  if (statusBeforeAdd) {
    logger.main.info("📋 检测到以下缓存变更：");
    logger.main.info(statusBeforeAdd);
  }

  await stageCachePaths(assetsGitDir);

  let committed = false;
  if (await hasStagedChanges(assetsGitDir)) {
    const commitMessage = `chore: update photos-manifest.json and thumbnails - ${new Date().toISOString()}`;
    await $({
      cwd: assetsGitDir,
      stdio: "inherit",
    })`git commit -m ${commitMessage}`;
    committed = true;
  }

  const aheadCount = upstream ? await getAheadCount(assetsGitDir) : 0;

  if (!committed && upstream && aheadCount === 0) {
    logger.main.info("💡 没有缓存变更需要推送");
    return;
  }

  if (!upstream) {
    logger.main.info("📡 当前缓存分支未设置 upstream，将推送并建立跟踪关系");
  } else if (aheadCount > 0) {
    logger.main.info(`📡 本地缓存分支领先远程 ${aheadCount} 个提交`);
  }

  if (upstream) {
    const nonCacheAheadPaths = await getNonCacheAheadPaths(
      assetsGitDir,
      upstream,
    );
    if (nonCacheAheadPaths.length > 0) {
      logger.main.warn(
        `⚠️ 存在非缓存 ahead commit，跳过自动推送：${nonCacheAheadPaths.join(", ")}`,
      );
      return;
    }
  }

  await pushCurrentHead({
    assetsGitDir,
    gitEnv,
    logger,
    setUpstream: !upstream,
  });

  logger.main.success("✅ 成功推送更新到远程缓存仓库");
}

async function pushCurrentHead(options: {
  assetsGitDir: string;
  gitEnv: NodeJS.ProcessEnv | undefined;
  logger: BuilderLogger;
  setUpstream: boolean;
}): Promise<void> {
  const { assetsGitDir, gitEnv, logger, setUpstream } = options;

  const runPush = async (): Promise<void> => {
    if (setUpstream) {
      await $({
        cwd: assetsGitDir,
        ...getGitAuthenticationExecaOptions(gitEnv),
        stdio: "inherit",
      })`git push --set-upstream origin HEAD`;
      return;
    }

    await $({
      cwd: assetsGitDir,
      ...getGitAuthenticationExecaOptions(gitEnv),
      stdio: "inherit",
    })`git push origin HEAD`;
  };

  try {
    await runPush();
  } catch (error) {
    logger.main.warn("⚠️ 推送失败，尝试 rebase 远程更新后重试");
    logger.main.warn(error instanceof Error ? error.message : String(error));
    await $({
      cwd: assetsGitDir,
      ...getGitAuthenticationExecaOptions(gitEnv),
      stdio: "inherit",
    })`git pull --rebase --autostash`;
    await runPush();
  }
}

async function replaceRepositoryWithFreshClone(options: {
  assetsGitDir: string;
  gitEnv: NodeJS.ProcessEnv | undefined;
  logger: BuilderLogger;
  repoUrl: string;
}): Promise<void> {
  const { assetsGitDir, gitEnv, logger, repoUrl } = options;
  const parentDir = path.dirname(assetsGitDir);
  const tempDir = await fs.mkdtemp(path.join(parentDir, ".assets-git-clone-"));
  let tempDirMoved = false;

  try {
    await $({
      cwd: parentDir,
      ...getGitAuthenticationExecaOptions(gitEnv),
      stdio: "inherit",
    })`git clone ${repoUrl} ${tempDir}`;

    const backupPath = `${assetsGitDir}.backup-${Date.now()}`;
    let backupCreated = false;
    if (await fs.lstat(assetsGitDir).catch(() => null)) {
      await fs.rename(assetsGitDir, backupPath);
      backupCreated = true;
    }

    try {
      await fs.rename(tempDir, assetsGitDir);
      tempDirMoved = true;
      if (backupCreated) {
        logger.main.warn(`⚠️ 旧 assets-git 已备份至 ${backupPath}`);
      }
    } catch (replaceError) {
      if (backupCreated) {
        await fs.rename(backupPath, assetsGitDir).catch(() => {});
      }
      throw replaceError;
    }
  } catch (error) {
    logger.main.warn("⚠️ fresh clone fallback 失败，保留现有 assets-git");
    throw error;
  } finally {
    if (!tempDirMoved) {
      await fs.rm(tempDir, { force: true, recursive: true }).catch(() => {});
    }
  }
}

async function ensureOriginUrl(
  assetsGitDir: string,
  repoUrl: string,
): Promise<void> {
  const currentUrl = await $({
    cwd: assetsGitDir,
    stdio: "pipe",
  })`git remote get-url origin`
    .then((result) => result.stdout.trim())
    .catch(() => "");

  if (!currentUrl) {
    await $({
      cwd: assetsGitDir,
      stdio: "pipe",
    })`git remote add origin ${repoUrl}`;
    return;
  }

  if (currentUrl !== repoUrl) {
    await $({
      cwd: assetsGitDir,
      stdio: "pipe",
    })`git remote set-url origin ${repoUrl}`;
  }
}

async function ensureGitUserConfigured(assetsGitDir: string): Promise<void> {
  const userName = await gitConfigValue(assetsGitDir, "user.name");
  const userEmail = await gitConfigValue(assetsGitDir, "user.email");

  if (!userEmail) {
    await $({
      cwd: assetsGitDir,
      stdio: "pipe",
    })`git config user.email "ci@afilmory.local"`;
  }

  if (!userName) {
    await $({
      cwd: assetsGitDir,
      stdio: "pipe",
    })`git config user.name "Afilmory CI"`;
  }
}

async function gitConfigValue(
  cwd: string,
  key: string,
): Promise<string | null> {
  return await $({ cwd, stdio: "pipe" })`git config ${key}`
    .then((result) => result.stdout.trim() || null)
    .catch(() => null);
}

async function getGitStatusPorcelain(cwd: string): Promise<string> {
  return (
    await $({ cwd, stdio: "pipe" })`git status --porcelain`
  ).stdout.trim();
}

async function stageCachePaths(cwd: string): Promise<void> {
  await $({
    cwd,
    stdio: "inherit",
  })`git add --all -- ${CACHE_STAGE_PATHS}`;
}

async function getNonCacheStagedPaths(cwd: string): Promise<string[]> {
  const paths = await getGitPathList(
    $({ cwd, stdio: "pipe" })`git diff --cached --name-only`,
  );
  return paths.filter((filePath) => !isCacheGitPath(filePath));
}

async function getUnmergedPaths(cwd: string): Promise<string[]> {
  return await getGitPathList(
    $({ cwd, stdio: "pipe" })`git diff --name-only --diff-filter=U`,
  );
}

async function getNonCacheAheadPaths(
  cwd: string,
  upstream: string,
): Promise<string[]> {
  const paths = await getGitPathList(
    $({
      cwd,
      stdio: "pipe",
    })`git log --format= --name-only ${`${upstream}..HEAD`}`,
  );
  return paths.filter((filePath) => !isCacheGitPath(filePath));
}

async function getGitPathList(
  command: Promise<{ stdout: string }>,
): Promise<string[]> {
  const result = await command.catch(() => ({ stdout: "" }));
  const paths = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set(paths)];
}

function isCacheGitPath(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join("/");

  if (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    normalized === ""
  ) {
    return false;
  }

  return (
    normalized === CACHE_MANIFEST_FILE ||
    normalized === CACHE_GEOCODING_FILE ||
    normalized.startsWith(`${CACHE_THUMBNAILS_DIR}/`)
  );
}

async function hasStagedChanges(cwd: string): Promise<boolean> {
  try {
    await $({ cwd, stdio: "pipe" })`git diff --cached --quiet`;
    return false;
  } catch (error) {
    if (isExecaExitCode(error, 1)) {
      return true;
    }
    throw error;
  }
}

async function getUpstreamBranch(cwd: string): Promise<string | null> {
  return await $({
    cwd,
    stdio: "pipe",
  })`git rev-parse --abbrev-ref --symbolic-full-name @{u}`
    .then((result) => result.stdout.trim() || null)
    .catch(() => null);
}

async function getAheadCount(cwd: string): Promise<number> {
  const upstream = await getUpstreamBranch(cwd);
  if (!upstream) {
    return 0;
  }

  const stdout = await $({
    cwd,
    stdio: "pipe",
  })`git rev-list --count ${`${upstream}..HEAD`}`
    .then((result) => result.stdout.trim())
    .catch(() => "0");
  return Number.parseInt(stdout, 10) || 0;
}

async function isGitWorkTree(cwd: string): Promise<boolean> {
  return await $({ cwd, stdio: "pipe" })`git rev-parse --is-inside-work-tree`
    .then((result) => result.stdout.trim() === "true")
    .catch(() => false);
}

async function assertAssetsGitDirIsSafe(
  assetsGitDir: string,
  options: { enforceInsideWebAppDir?: boolean } = {},
): Promise<void> {
  try {
    const stat = await fs.lstat(assetsGitDir);
    if (stat.isSymbolicLink()) {
      throw new Error(`assets-git 目录不能是符号链接：${assetsGitDir}`);
    }

    if (!stat.isDirectory()) {
      throw new Error(`assets-git 路径必须是目录：${assetsGitDir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (!options.enforceInsideWebAppDir) {
    return;
  }

  const realWebAppDir = await fs.realpath(webAppDir);
  const realAssetsGitDir = await fs.realpath(assetsGitDir);
  const relativePath = path.relative(realWebAppDir, realAssetsGitDir);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`assets-git 目录必须位于 web 应用目录内：${assetsGitDir}`);
  }
}

async function createInitialManifestContent(): Promise<string> {
  const { CURRENT_MANIFEST_VERSION } = await import("../manifest/version.js");

  return JSON.stringify(
    { version: CURRENT_MANIFEST_VERSION, data: [], cameras: [], lenses: [] },
    null,
    2,
  );
}

function createInitialGeocodingCacheContent(): string {
  return JSON.stringify(
    {
      version: 2,
      updatedAt: new Date(0).toISOString(),
      entries: {},
    },
    null,
    2,
  );
}

function getRemoteCachePaths(assetsGitDir: string): RemoteCachePaths {
  const { manifestPath, thumbnailsDir } = getBuilderOutputSettings();
  const geocodingCachePath = getGeocodingCachePath();

  return {
    assetsGitDir,
    manifestPath,
    thumbnailsDir,
    geocodingCachePath,
    repoManifestPath: path.resolve(assetsGitDir, CACHE_MANIFEST_FILE),
    repoThumbnailsDir: path.resolve(assetsGitDir, CACHE_THUMBNAILS_DIR),
    repoGeocodingCachePath: path.resolve(assetsGitDir, CACHE_GEOCODING_FILE),
  };
}

function getGeocodingCachePath(): string {
  const { manifestPath, geocodingCachePath } = getBuilderOutputSettings();

  return path.resolve(
    geocodingCachePath ??
      path.join(path.dirname(manifestPath), CACHE_GEOCODING_FILE),
  );
}

async function replaceFileWithCopy(
  targetPath: string,
  sourcePath: string,
): Promise<void> {
  await assertRegularFile(sourcePath, "缓存文件");
  await removePathIfPresent(targetPath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function replaceFileWithContent(
  targetPath: string,
  content: string,
): Promise<void> {
  await removePathIfPresent(targetPath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content);
}

async function copyThumbnailDirectoryReplacing(
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  await removePathIfPresent(targetDir);
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.mkdir(targetDir, { recursive: true });

  if (!(await pathExists(sourceDir))) {
    return;
  }

  await assertThumbnailDirectory(sourceDir, "thumbnails");

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    await fs.copyFile(
      path.join(sourceDir, entry.name),
      path.join(targetDir, entry.name),
    );
  }
}

async function readRegularFileIfPresent(
  filePath: string,
): Promise<string | null> {
  try {
    await assertRegularFile(filePath, "本地缓存文件");
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function removePathIfPresent(targetPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(targetPath);
    await fs.rm(targetPath, {
      force: true,
      recursive: stat.isDirectory() && !stat.isSymbolicLink(),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function snapshotDirectory(
  sourceDir: string,
  assetsGitDir: string,
): Promise<DirectorySnapshot | null> {
  const snapshotSourceDir = await resolveSnapshotSourceDirectory(
    sourceDir,
    assetsGitDir,
  );
  if (!snapshotSourceDir) {
    return null;
  }

  const snapshotRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "afilmory-repo-sync-"),
  );
  const snapshotPath = path.join(snapshotRoot, path.basename(sourceDir));

  try {
    await copyThumbnailDirectoryReplacing(snapshotSourceDir, snapshotPath);
    return {
      rootDir: snapshotRoot,
      path: snapshotPath,
    };
  } catch {
    await fs.rm(snapshotRoot, { force: true, recursive: true });
    return null;
  }
}

async function resolveSnapshotSourceDirectory(
  sourceDir: string,
  assetsGitDir: string,
): Promise<string | null> {
  const stat = await fs.lstat(sourceDir).catch(() => null);
  if (!stat) {
    return null;
  }

  if (!stat.isSymbolicLink()) {
    return sourceDir;
  }

  const realAssetsGitDir = await fs.realpath(assetsGitDir).catch(() => null);
  const realSourceDir = await fs.realpath(sourceDir).catch(() => null);
  if (
    !realAssetsGitDir ||
    !realSourceDir ||
    !isPathInside(realSourceDir, realAssetsGitDir)
  ) {
    return null;
  }

  return realSourceDir;
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function pathIsSymlink(targetPath: string): Promise<boolean> {
  return await fs
    .lstat(targetPath)
    .then((stat) => stat.isSymbolicLink())
    .catch(() => false);
}

function isExecaExitCode(error: unknown, exitCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "exitCode" in error &&
    (error as { exitCode?: unknown }).exitCode === exitCode
  );
}

export function buildGitAuthenticationEnv(
  url: string,
  token?: string,
): NodeJS.ProcessEnv | undefined {
  if (!token) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return undefined;
  }

  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "github.com") {
    return undefined;
  }

  if (parsedUrl.username || parsedUrl.password) {
    return undefined;
  }

  return {
    ...pickGitBaseEnv(process.env),
    AFILMORY_GIT_PASSWORD: token,
    AFILMORY_GIT_USERNAME: GIT_HTTP_USERNAME,
    GIT_ASKPASS: GIT_ASKPASS_SCRIPT,
    GIT_TERMINAL_PROMPT: "0",
  };
}

function getGitAuthenticationExecaOptions(env: NodeJS.ProcessEnv | undefined): {
  env?: NodeJS.ProcessEnv;
  extendEnv?: boolean;
} {
  return env ? { env, extendEnv: false } : {};
}

function pickGitBaseEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    GIT_ENV_ALLOWLIST.flatMap((key) => (env[key] ? [[key, env[key]]] : [])),
  );
}

export const plugin = githubRepoSyncPlugin;
export function createGitHubRepoSyncPlugin(
  options?: GitHubRepoSyncPluginOptions,
): BuilderPlugin {
  return githubRepoSyncPlugin(options);
}
