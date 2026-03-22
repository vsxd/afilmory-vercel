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

  it('should reject path traversal via deleteFile', async () => {
    await expect(provider.deleteFile('../../etc/passwd')).rejects.toThrow('文件路径不安全')
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
