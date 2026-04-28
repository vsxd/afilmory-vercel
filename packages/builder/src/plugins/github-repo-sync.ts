import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

import { getBuilderOutputSettings, webAppDir } from '../output-paths.js'
import type { BuilderPlugin } from './types.js'

const RUN_SHARED_ASSETS_DIR = 'assetsGitDir'
const RUN_SHARED_SYNC_ENABLED = 'repoSyncEnabled'
const GIT_ASKPASS_SCRIPT = fileURLToPath(new URL('git-askpass.js', import.meta.url))
const GIT_HTTP_USERNAME = 'x-access-token'
const GIT_ENV_ALLOWLIST = [
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'PATH',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TMP',
  'TMPDIR',
  'XDG_CONFIG_HOME',
] as const

export interface GitHubRepoSyncPluginOptions {
  autoPush?: boolean
}

export default function githubRepoSyncPlugin(options: GitHubRepoSyncPluginOptions = {}): BuilderPlugin {
  const autoPush = options.autoPush ?? true

  return {
    name: 'afilmory:github-repo-sync',
    hooks: {
      beforeBuild: async (context) => {
        const userConfig = context.config.user
        if (!userConfig) {
          context.logger.main.warn('⚠️ 未配置用户级设置，跳过远程仓库同步')
          return
        }

        if (!userConfig.repo.enable) {
          return
        }

        const { logger } = context
        const { repo } = userConfig

        if (!repo.url) {
          logger.main.warn('⚠️ 未配置远程仓库地址，跳过同步')
          return
        }
        const assetsGitDir = path.resolve(webAppDir, 'assets-git')
        const gitEnv = buildGitAuthenticationEnv(repo.url, repo.token)

        context.runShared.set(RUN_SHARED_ASSETS_DIR, assetsGitDir)

        logger.main.info('🔄 同步远程仓库...')

        try {
          await assertAssetsGitDirIsSafe(assetsGitDir, { enforceInsideWebAppDir: true })
          if (!existsSync(assetsGitDir)) {
            logger.main.info('📥 克隆远程仓库...')
            await $({
              cwd: webAppDir,
              ...getGitAuthenticationExecaOptions(gitEnv),
              stdio: 'inherit',
            })`git clone ${repo.url} assets-git`
          } else {
            logger.main.info('🔄 拉取远程仓库更新...')
            try {
              await $({
                cwd: assetsGitDir,
                ...getGitAuthenticationExecaOptions(gitEnv),
                stdio: 'inherit',
              })`git pull --rebase`
            } catch (pullError) {
              logger.main.warn('⚠️ git pull 失败，保留现有 assets-git 目录并降级为本地构建输出')
              throw pullError
            }
          }

          await prepareRepositoryLayout({ assetsGitDir, logger })
          context.runShared.set(RUN_SHARED_SYNC_ENABLED, true)
          logger.main.success('✅ 远程仓库同步完成')
        } catch (error) {
          context.runShared.set(RUN_SHARED_SYNC_ENABLED, false)
          logger.main.warn('⚠️ 远程仓库同步失败，正在恢复本地构建输出布局...')
          logger.main.warn(error instanceof Error ? error.message : String(error))

          try {
            await restoreLocalOutputLayout({ logger })
            logger.main.warn('⚠️ 已降级为本地构建输出（不会中断构建）')
          } catch (restoreError) {
            logger.main.error('❌ 恢复本地构建输出布局失败，后续构建可能中断')
            logger.main.error(restoreError instanceof Error ? restoreError.message : String(restoreError))
          }
        }
      },
      afterBuild: async (context) => {
        const userConfig = context.config.user
        if (!userConfig) {
          context.logger.main.warn('⚠️ 未配置用户级设置，跳过推送')
          return
        }

        if (!autoPush || !userConfig.repo.enable) {
          return
        }

        const { result } = context.payload
        const assetsGitDir = context.runShared.get(RUN_SHARED_ASSETS_DIR) as string | undefined
        const syncEnabled = context.runShared.get(RUN_SHARED_SYNC_ENABLED) as boolean | undefined

        if (!syncEnabled || !assetsGitDir) {
          context.logger.main.warn('⚠️ 远程仓库同步未就绪，跳过推送')
          return
        }

        if (!result.hasUpdates) {
          context.logger.main.info('💡 没有更新需要推送到远程仓库')
          return
        }

        await pushUpdatesToRemoteRepo({
          assetsGitDir,
          logger: context.logger,
          repoConfig: userConfig.repo,
        })
      },
    },
  }
}

interface PrepareRepositoryLayoutOptions {
  assetsGitDir: string
  logger: typeof import('../logger/index.js').logger
}

interface OutputLayoutOptions {
  logger: typeof import('../logger/index.js').logger
}

interface DirectorySnapshot {
  rootDir: string
  path: string
}

async function assertAssetsGitDirIsSafe(
  assetsGitDir: string,
  options: { enforceInsideWebAppDir?: boolean } = {},
): Promise<void> {
  const realWebAppDir = await fs.realpath(webAppDir)

  try {
    const stat = await fs.lstat(assetsGitDir)
    if (stat.isSymbolicLink()) {
      throw new Error(`assets-git 目录不能是符号链接：${assetsGitDir}`)
    }

    if (!stat.isDirectory()) {
      throw new Error(`assets-git 路径必须是目录：${assetsGitDir}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }

  if (options.enforceInsideWebAppDir) {
    const realAssetsGitDir = await fs.realpath(assetsGitDir)
    const relativePath = path.relative(realWebAppDir, realAssetsGitDir)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`assets-git 目录必须位于 web 应用目录内：${assetsGitDir}`)
    }
  }
}

async function createInitialManifestContent(): Promise<string> {
  const { CURRENT_MANIFEST_VERSION } = await import('../manifest/version.js')

  return JSON.stringify({ version: CURRENT_MANIFEST_VERSION, data: [], cameras: [], lenses: [] }, null, 2)
}

async function removePathIfPresent(targetPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(targetPath)
    await fs.rm(targetPath, {
      force: true,
      recursive: stat.isDirectory() && !stat.isSymbolicLink(),
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
}

async function replacePathWithSymlink(linkPath: string, targetPath: string): Promise<void> {
  await removePathIfPresent(linkPath)
  await fs.mkdir(path.dirname(linkPath), { recursive: true })
  await fs.symlink(targetPath, linkPath)
}

async function snapshotDirectory(sourceDir: string): Promise<DirectorySnapshot | null> {
  const snapshotRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-repo-sync-'))
  const snapshotPath = path.join(snapshotRoot, path.basename(sourceDir))

  try {
    await fs.cp(sourceDir, snapshotPath, {
      dereference: true,
      force: true,
      recursive: true,
    })
    return {
      rootDir: snapshotRoot,
      path: snapshotPath,
    }
  } catch {
    await fs.rm(snapshotRoot, { force: true, recursive: true })
    return null
  }
}

export async function prepareRepositoryLayout({ assetsGitDir, logger }: PrepareRepositoryLayoutOptions): Promise<void> {
  await assertAssetsGitDirIsSafe(assetsGitDir)

  const { manifestPath, thumbnailsDir } = getBuilderOutputSettings()
  const thumbnailsSourceDir = path.resolve(assetsGitDir, 'thumbnails')
  const manifestSourcePath = path.resolve(assetsGitDir, 'photos-manifest.json')

  if (!existsSync(thumbnailsSourceDir)) {
    logger.main.info('📁 创建 thumbnails 目录...')
    await fs.mkdir(thumbnailsSourceDir, { recursive: true })
  }

  if (!existsSync(manifestSourcePath)) {
    logger.main.info('📄 创建初始 manifest 文件...')
    await fs.writeFile(manifestSourcePath, await createInitialManifestContent())
  }

  await replacePathWithSymlink(thumbnailsDir, thumbnailsSourceDir)
  await replacePathWithSymlink(manifestPath, manifestSourcePath)
}

export async function restoreLocalOutputLayout({ logger }: OutputLayoutOptions): Promise<void> {
  const { manifestPath, thumbnailsDir } = getBuilderOutputSettings()
  const manifestContent = await fs.readFile(manifestPath, 'utf-8').catch(() => null)
  const thumbnailsSnapshot = await snapshotDirectory(thumbnailsDir)

  try {
    await removePathIfPresent(thumbnailsDir)
    await fs.mkdir(path.dirname(thumbnailsDir), { recursive: true })

    if (thumbnailsSnapshot) {
      await fs.cp(thumbnailsSnapshot.path, thumbnailsDir, {
        force: true,
        recursive: true,
      })
    } else {
      await fs.mkdir(thumbnailsDir, { recursive: true })
    }

    await removePathIfPresent(manifestPath)
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(manifestPath, manifestContent ?? (await createInitialManifestContent()))
  } finally {
    if (thumbnailsSnapshot) {
      await fs.rm(thumbnailsSnapshot.rootDir, { force: true, recursive: true })
    }
  }

  logger.main.info('📁 已恢复本地 manifest / thumbnails 输出布局')
}

interface PushRemoteOptions {
  assetsGitDir: string
  logger: typeof import('../logger/index.js').logger
  repoConfig: {
    enable: boolean
    url: string
    token?: string
  }
}

async function pushUpdatesToRemoteRepo({ assetsGitDir, logger, repoConfig }: PushRemoteOptions): Promise<void> {
  if (!repoConfig.url) {
    return
  }

  if (!repoConfig.token) {
    logger.main.warn('⚠️ 未提供 Git Token，跳过推送到远程仓库')
    return
  }

  logger.main.info('📤 开始推送更新到远程仓库...')
  const gitEnv = buildGitAuthenticationEnv(repoConfig.url, repoConfig.token)

  await ensureGitUserConfigured(assetsGitDir)

  const status = await $({
    cwd: assetsGitDir,
    stdio: 'pipe',
  })`git status --porcelain`

  if (!status.stdout.trim()) {
    logger.main.info('💡 没有变更需要推送')
    return
  }

  logger.main.info('📋 检测到以下变更：')
  logger.main.info(status.stdout)

  await $({ cwd: assetsGitDir, stdio: 'inherit' })`git add .`

  const commitMessage = `chore: update photos-manifest.json and thumbnails - ${new Date().toISOString()}`
  await $({
    cwd: assetsGitDir,
    stdio: 'inherit',
  })`git commit -m ${commitMessage}`
  await $({
    cwd: assetsGitDir,
    ...getGitAuthenticationExecaOptions(gitEnv),
    stdio: 'inherit',
  })`git push origin HEAD`

  logger.main.success('✅ 成功推送更新到远程仓库')
}

async function ensureGitUserConfigured(assetsGitDir: string): Promise<void> {
  try {
    await $({ cwd: assetsGitDir, stdio: 'pipe' })`git config user.name`
  } catch {
    await $({
      cwd: assetsGitDir,
      stdio: 'pipe',
    })`git config user.email "ci@afilmory.local"`
    await $({
      cwd: assetsGitDir,
      stdio: 'pipe',
    })`git config user.name "Afilmory CI"`
  }
}

export function buildGitAuthenticationEnv(url: string, token?: string): NodeJS.ProcessEnv | undefined {
  if (!token) {
    return undefined
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return undefined
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'github.com') {
    return undefined
  }

  if (parsedUrl.username || parsedUrl.password) {
    return undefined
  }

  return {
    ...pickGitBaseEnv(process.env),
    AFILMORY_GIT_PASSWORD: token,
    AFILMORY_GIT_USERNAME: GIT_HTTP_USERNAME,
    GIT_ASKPASS: GIT_ASKPASS_SCRIPT,
    GIT_TERMINAL_PROMPT: '0',
  }
}

function getGitAuthenticationExecaOptions(env: NodeJS.ProcessEnv | undefined): {
  env?: NodeJS.ProcessEnv
  extendEnv?: boolean
} {
  return env ? { env, extendEnv: false } : {}
}

function pickGitBaseEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(GIT_ENV_ALLOWLIST.flatMap((key) => (env[key] ? [[key, env[key]]] : [])))
}

export const plugin = githubRepoSyncPlugin
export function createGitHubRepoSyncPlugin(options?: GitHubRepoSyncPluginOptions): BuilderPlugin {
  return githubRepoSyncPlugin(options)
}
