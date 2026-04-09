import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { logger,setConsoleForwarding } from '../logger/index.js'
import { CURRENT_MANIFEST_VERSION } from '../manifest/version.js'
import { setBuilderOutputSettings } from '../output-paths.js'
import {
  buildGitAuthenticationEnv,
  prepareRepositoryLayout,
  restoreLocalOutputLayout,
} from '../plugins/github-repo-sync'

describe('GitHub repo sync auth', () => {
  it('should configure askpass auth for GitHub HTTPS repositories', async () => {
    const env = buildGitAuthenticationEnv('https://github.com/vsxd/afilmory-metadata-cache.git', 'github_pat_test')

    expect(env).toBeDefined()
    expect(env?.GIT_TERMINAL_PROMPT).toBe('0')
    expect(env?.GIT_ASKPASS).toContain('git-askpass.js')

    const username = await execa(env!.GIT_ASKPASS!, ['Username for https://github.com'], { env })
    const password = await execa(env!.GIT_ASKPASS!, ['Password for https://github.com'], { env })

    expect(username.stdout).toBe('x-access-token')
    expect(password.stdout).toBe('github_pat_test')
  })

  it('should skip askpass auth when the url is not a GitHub HTTPS repository', () => {
    expect(buildGitAuthenticationEnv('ssh://git@github.com/vsxd/afilmory-metadata-cache.git', 'github_pat_test')).toBe(
      undefined,
    )
    expect(buildGitAuthenticationEnv('https://example.com/repo.git', 'github_pat_test')).toBe(undefined)
  })

  it('should skip askpass auth when the url already contains credentials', () => {
    expect(
      buildGitAuthenticationEnv(
        'https://someone:secret@github.com/vsxd/afilmory-metadata-cache.git',
        'github_pat_test',
      ),
    ).toBe(undefined)
  })
})

describe('GitHub repo sync layout recovery', () => {
  let tmpDir: string
  let assetsGitDir: string
  let manifestPath: string
  let thumbnailsDir: string

  beforeEach(async () => {
    setConsoleForwarding(false)

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-github-repo-sync-'))
    assetsGitDir = path.join(tmpDir, 'assets-git')
    manifestPath = path.join(tmpDir, 'generated', 'photos-manifest.json')
    thumbnailsDir = path.join(tmpDir, 'public', 'thumbnails')

    setBuilderOutputSettings({
      manifestPath,
      thumbnailsDir,
      originalsDir: path.join(tmpDir, 'public', 'originals'),
    })
  })

  afterEach(async () => {
    setConsoleForwarding(true)
    await fs.rm(tmpDir, { force: true, recursive: true })
  })

  it('replaces dangling output symlinks when preparing the repo layout', async () => {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.mkdir(path.dirname(thumbnailsDir), { recursive: true })
    await fs.symlink(path.join(tmpDir, 'missing-manifest.json'), manifestPath)
    await fs.symlink(path.join(tmpDir, 'missing-thumbnails'), thumbnailsDir)

    await seedRepoAssets(assetsGitDir)
    await prepareRepositoryLayout({ assetsGitDir, logger })

    expect((await fs.lstat(manifestPath)).isSymbolicLink()).toBe(true)
    expect((await fs.lstat(thumbnailsDir)).isSymbolicLink()).toBe(true)
    expect(await fs.readlink(manifestPath)).toBe(path.join(assetsGitDir, 'photos-manifest.json'))
    expect(await fs.readlink(thumbnailsDir)).toBe(path.join(assetsGitDir, 'thumbnails'))

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
    expect(manifest.data).toHaveLength(1)
    await expect(fs.readFile(path.join(thumbnailsDir, 'photo.jpg'), 'utf-8')).resolves.toBe('thumb')
  })

  it('restores regular local output paths after repo-backed symlinks become dangling', async () => {
    await seedRepoAssets(assetsGitDir)
    await prepareRepositoryLayout({ assetsGitDir, logger })

    await fs.rm(assetsGitDir, { force: true, recursive: true })
    await restoreLocalOutputLayout({ logger })

    const manifestStat = await fs.lstat(manifestPath)
    const thumbnailsStat = await fs.lstat(thumbnailsDir)
    expect(manifestStat.isSymbolicLink()).toBe(false)
    expect(manifestStat.isFile()).toBe(true)
    expect(thumbnailsStat.isSymbolicLink()).toBe(false)
    expect(thumbnailsStat.isDirectory()).toBe(true)

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
    expect(manifest).toEqual({
      version: CURRENT_MANIFEST_VERSION,
      data: [],
      cameras: [],
      lenses: [],
    })
    await expect(fs.readdir(thumbnailsDir)).resolves.toEqual([])
  })

  it('preserves accessible manifest and thumbnails when falling back to local output', async () => {
    await seedRepoAssets(assetsGitDir)
    await prepareRepositoryLayout({ assetsGitDir, logger })

    await restoreLocalOutputLayout({ logger })

    const manifestStat = await fs.lstat(manifestPath)
    const thumbnailsStat = await fs.lstat(thumbnailsDir)
    expect(manifestStat.isSymbolicLink()).toBe(false)
    expect(thumbnailsStat.isSymbolicLink()).toBe(false)

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
    expect(manifest.data).toHaveLength(1)
    await expect(fs.readFile(path.join(thumbnailsDir, 'photo.jpg'), 'utf-8')).resolves.toBe('thumb')
  })
})

async function seedRepoAssets(assetsGitDir: string): Promise<void> {
  await fs.mkdir(path.join(assetsGitDir, 'thumbnails'), { recursive: true })
  await fs.writeFile(path.join(assetsGitDir, 'thumbnails', 'photo.jpg'), 'thumb')
  await fs.writeFile(
    path.join(assetsGitDir, 'photos-manifest.json'),
    JSON.stringify(
      {
        version: CURRENT_MANIFEST_VERSION,
        data: [{ id: 'photo' }],
        cameras: [],
        lenses: [],
      },
      null,
      2,
    ),
  )
}
