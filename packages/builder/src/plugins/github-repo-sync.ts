import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

import { getBuilderOutputSettings, webAppDir } from '../output-paths.js'
import type { BuilderPlugin } from './types.js'

const RUN_SHARED_ASSETS_DIR = 'assetsGitDir'
const GIT_ASKPASS_SCRIPT = fileURLToPath(new URL('git-askpass.js', import.meta.url))
const GIT_HTTP_USERNAME = 'x-access-token'

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

        if (!existsSync(assetsGitDir)) {
          logger.main.info('📥 克隆远程仓库...')
          await $({
            cwd: webAppDir,
            env: gitEnv,
            stdio: 'inherit',
          })`git clone ${repo.url} assets-git`
        } else {
          logger.main.info('🔄 拉取远程仓库更新...')
          try {
            await $({ cwd: assetsGitDir, env: gitEnv, stdio: 'inherit' })`git pull --rebase`
          } catch {
            logger.main.warn('⚠️ git pull 失败，尝试重新克隆远程仓库...')
            logger.main.info('🗑️ 删除现有仓库目录...')
            await $({ cwd: webAppDir, stdio: 'inherit' })`rm -rf assets-git`
            logger.main.info('📥 重新克隆远程仓库...')
            await $({
              cwd: webAppDir,
              env: gitEnv,
              stdio: 'inherit',
            })`git clone ${repo.url} assets-git`
          }
        }

        await prepareRepositoryLayout({ assetsGitDir, logger })
        logger.main.success('✅ 远程仓库同步完成')
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

        if (!assetsGitDir) {
          context.logger.main.warn('⚠️ 未找到仓库目录，跳过推送')
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

async function prepareRepositoryLayout({ assetsGitDir, logger }: PrepareRepositoryLayoutOptions): Promise<void> {
  const { manifestPath, thumbnailsDir } = getBuilderOutputSettings()
  const thumbnailsSourceDir = path.resolve(assetsGitDir, 'thumbnails')
  const manifestSourcePath = path.resolve(assetsGitDir, 'photos-manifest.json')

  if (!existsSync(thumbnailsSourceDir)) {
    logger.main.info('📁 创建 thumbnails 目录...')
    await $({ cwd: assetsGitDir, stdio: 'inherit' })`mkdir -p thumbnails`
  }

  if (!existsSync(manifestSourcePath)) {
    logger.main.info('📄 创建初始 manifest 文件...')
    const { CURRENT_MANIFEST_VERSION } = await import('../manifest/version.js')
    const initial = JSON.stringify({ version: CURRENT_MANIFEST_VERSION, data: [], cameras: [], lenses: [] }, null, 2)
    await fs.writeFile(manifestSourcePath, initial)
  }

  if (existsSync(thumbnailsDir)) {
    await $({ cwd: webAppDir, stdio: 'inherit' })`rm -rf ${thumbnailsDir}`
  }
  await fs.mkdir(path.dirname(thumbnailsDir), { recursive: true })
  await $({
    cwd: webAppDir,
    stdio: 'inherit',
  })`ln -s ${thumbnailsSourceDir} ${thumbnailsDir}`

  if (existsSync(manifestPath)) {
    await $({ cwd: webAppDir, stdio: 'inherit' })`rm -f ${manifestPath}`
  }
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await $({
    cwd: webAppDir,
    stdio: 'inherit',
  })`ln -s ${manifestSourcePath} ${manifestPath}`
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
  await $({ cwd: assetsGitDir, env: gitEnv, stdio: 'inherit' })`git push origin HEAD`

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
    ...process.env,
    AFILMORY_GIT_PASSWORD: token,
    AFILMORY_GIT_USERNAME: GIT_HTTP_USERNAME,
    GIT_ASKPASS: GIT_ASKPASS_SCRIPT,
    GIT_TERMINAL_PROMPT: '0',
  }
}

export const plugin = githubRepoSyncPlugin
export function createGitHubRepoSyncPlugin(options?: GitHubRepoSyncPluginOptions): BuilderPlugin {
  return githubRepoSyncPlugin(options)
}
