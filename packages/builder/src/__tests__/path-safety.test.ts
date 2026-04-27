import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LocalStorageProvider } from '../storage/providers/local-provider'

describe('LocalStorageProvider path safety', () => {
  let tmpDir: string
  let provider: LocalStorageProvider

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-test-'))
    // Create a sample file inside the base path
    await fs.writeFile(path.join(tmpDir, 'sample.jpg'), 'fake-image-data')

    provider = new LocalStorageProvider({
      provider: 'local',
      basePath: tmpDir,
    })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should read a file with a normal path', async () => {
    const result = await provider.getFile('sample.jpg')
    expect(result).not.toBeNull()
    expect(result!.toString()).toBe('fake-image-data')
  })

  it('should return null for a non-existent file', async () => {
    const result = await provider.getFile('nonexistent.jpg')
    expect(result).toBeNull()
  })

  it('should block path traversal attacks via getFile (returns null)', async () => {
    // getFile catches resolveSafePath errors internally and returns null,
    // preventing access to files outside the base path
    const outsideFile = path.join(os.tmpdir(), 'secret-file.txt')
    await fs.writeFile(outsideFile, 'secret')

    try {
      const result = await provider.getFile('../secret-file.txt')
      expect(result).toBeNull()
    } finally {
      await fs.rm(outsideFile, { force: true })
    }
  })

  it('should block deeply nested path traversal via getFile (returns null)', async () => {
    // getFile catches the path safety error and returns null
    const result = await provider.getFile('subdir/../../etc/passwd')
    expect(result).toBeNull()
  })

  it('should block sibling directory prefix collisions via getFile (returns null)', async () => {
    const siblingDir = `${tmpDir}-sibling`
    await fs.mkdir(siblingDir, { recursive: true })
    await fs.writeFile(path.join(siblingDir, 'secret.jpg'), 'secret-data')

    try {
      const result = await provider.getFile(`../${path.basename(siblingDir)}/secret.jpg`)
      expect(result).toBeNull()
    } finally {
      await fs.rm(siblingDir, { recursive: true, force: true })
    }
  })

  it('should block symlink directory escapes via getFile (returns null)', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-outside-'))
    await fs.writeFile(path.join(outsideDir, 'secret.jpg'), 'secret-data')
    await fs.symlink(outsideDir, path.join(tmpDir, 'linked'), 'dir')

    try {
      const result = await provider.getFile('linked/secret.jpg')
      expect(result).toBeNull()
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('should handle subdirectory paths correctly', async () => {
    const subDir = path.join(tmpDir, 'sub')
    await fs.mkdir(subDir)
    await fs.writeFile(path.join(subDir, 'nested.jpg'), 'nested-data')

    const result = await provider.getFile('sub/nested.jpg')
    expect(result).not.toBeNull()
    expect(result!.toString()).toBe('nested-data')
  })

  it('should reject path traversal via uploadFile', async () => {
    const data = Buffer.from('malicious')
    await expect(provider.uploadFile('../evil.txt', data)).rejects.toThrow('文件路径不安全')
  })

  it('should reject sibling directory prefix collisions via uploadFile', async () => {
    const data = Buffer.from('malicious')
    await expect(provider.uploadFile(`../${path.basename(`${tmpDir}-evil`)}/evil.txt`, data)).rejects.toThrow(
      '文件路径不安全',
    )
  })

  it('should reject symlink directory escapes via uploadFile', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-outside-'))
    await fs.symlink(outsideDir, path.join(tmpDir, 'linked'), 'dir')

    try {
      await expect(provider.uploadFile('linked/evil.txt', Buffer.from('malicious'))).rejects.toThrow('文件路径不安全')
      await expect(fs.access(path.join(outsideDir, 'evil.txt'))).rejects.toThrow()
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('should reject path traversal via deleteFile', async () => {
    await expect(provider.deleteFile('../../etc/passwd')).rejects.toThrow('文件路径不安全')
  })

  it('should reject sibling directory prefix collisions via deleteFile', async () => {
    await expect(provider.deleteFile(`../${path.basename(`${tmpDir}-evil`)}/passwd`)).rejects.toThrow('文件路径不安全')
  })

  it('should reject symlink directory escapes via deleteFile', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-outside-'))
    const outsideFile = path.join(outsideDir, 'secret.txt')
    await fs.writeFile(outsideFile, 'secret-data')
    await fs.symlink(outsideDir, path.join(tmpDir, 'linked'), 'dir')

    try {
      await expect(provider.deleteFile('linked/secret.txt')).rejects.toThrow('文件路径不安全')
      await expect(fs.readFile(outsideFile, 'utf-8')).resolves.toBe('secret-data')
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('should encode generated public URLs and avoid file URLs', async () => {
    const providerWithBaseUrl = new LocalStorageProvider({
      provider: 'local',
      basePath: tmpDir,
      baseUrl: '/originals',
    })

    await expect(providerWithBaseUrl.generatePublicUrl('family/2024 #1?.jpg')).resolves.toBe(
      '/originals/family/2024%20%231%3F.jpg',
    )
    await expect(provider.generatePublicUrl('sample.jpg')).rejects.toThrow('baseUrl 或 distPath 必须配置')
  })

  it('should mirror uploads and deletes into distPath before generating public URLs', async () => {
    const distPath = path.join(tmpDir, '..', `${path.basename(tmpDir)}-dist`)
    const providerWithDist = new LocalStorageProvider({
      provider: 'local',
      basePath: tmpDir,
      distPath,
    })
    const data = Buffer.from('published-image')

    try {
      await providerWithDist.uploadFile('nested/pic.jpg', data)

      await expect(fs.readFile(path.join(tmpDir, 'nested/pic.jpg'))).resolves.toEqual(data)
      await expect(fs.readFile(path.join(distPath, 'nested/pic.jpg'))).resolves.toEqual(data)
      await expect(providerWithDist.generatePublicUrl('nested/pic.jpg')).resolves.toBe(
        `/${path.basename(distPath)}/nested/pic.jpg`,
      )

      await providerWithDist.deleteFile('nested/pic.jpg')

      await expect(fs.access(path.join(tmpDir, 'nested/pic.jpg'))).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(fs.access(path.join(distPath, 'nested/pic.jpg'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fs.rm(distPath, { recursive: true, force: true })
    }
  })

  it('should throw when basePath is empty', () => {
    expect(
      () =>
        new LocalStorageProvider({
          provider: 'local',
          basePath: '',
        }),
    ).toThrow('basePath 不能为空')
  })

  it('should throw when basePath is whitespace only', () => {
    expect(
      () =>
        new LocalStorageProvider({
          provider: 'local',
          basePath: '   ',
        }),
    ).toThrow('basePath 不能为空')
  })
})
