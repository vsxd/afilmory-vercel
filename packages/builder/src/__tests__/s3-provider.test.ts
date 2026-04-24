import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { S3StorageProvider } from '../storage/providers/s3-provider.js'

describe('S3StorageProvider.getFile', () => {
  const config = {
    provider: 's3' as const,
    bucket: 'bucket',
    region: 'auto',
    endpoint: 'https://example.com',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('clears the total timeout when the response body is already a Buffer', async () => {
    const provider = new S3StorageProvider(config)
    const send = vi.fn().mockResolvedValue({
      Body: Buffer.from('hello'),
      ContentLength: 5,
    })
    ;(provider as unknown as { s3Client: { send: typeof send } }).s3Client = { send }

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    await expect(provider.getFile('image.jpg')).resolves.toEqual(Buffer.from('hello'))
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('clears the total timeout when the response body is missing', async () => {
    const provider = new S3StorageProvider(config)
    const send = vi.fn().mockResolvedValue({})
    ;(provider as unknown as { s3Client: { send: typeof send } }).s3Client = { send }

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    await expect(provider.getFile('image.jpg')).resolves.toBeNull()
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('paginates through truncated list responses for listAllFiles', async () => {
    const provider = new S3StorageProvider(config)
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'a.jpg', Size: 1 },
          { Key: 'b.mov', Size: 2 },
        ],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'c.heic', Size: 3 }],
        IsTruncated: false,
      })
    ;(provider as unknown as { s3Client: { send: typeof send } }).s3Client = { send }

    await expect(provider.listAllFiles()).resolves.toEqual([
      { key: 'a.jpg', size: 1, lastModified: undefined, etag: undefined },
      { key: 'b.mov', size: 2, lastModified: undefined, etag: undefined },
      { key: 'c.heic', size: 3, lastModified: undefined, etag: undefined },
    ])
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('respects maxFileLimit across paginated list responses', async () => {
    const provider = new S3StorageProvider({
      ...config,
      maxFileLimit: 2,
    })
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: 'a.jpg', Size: 1 }],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'b.jpg', Size: 2 },
          { Key: 'c.jpg', Size: 3 },
        ],
        IsTruncated: true,
        NextContinuationToken: 'page-3',
      })
    ;(provider as unknown as { s3Client: { send: typeof send } }).s3Client = { send }

    await expect(provider.listImages()).resolves.toEqual([
      { key: 'a.jpg', size: 1, lastModified: undefined, etag: undefined },
      { key: 'b.jpg', size: 2, lastModified: undefined, etag: undefined },
    ])
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('encodes object keys when generating public URLs', () => {
    const provider = new S3StorageProvider({
      ...config,
      customDomain: 'https://cdn.example.com/',
    })

    expect(provider.generatePublicUrl('family/2024 #1?.jpg')).toBe('https://cdn.example.com/family/2024%20%231%3F.jpg')
  })
})
