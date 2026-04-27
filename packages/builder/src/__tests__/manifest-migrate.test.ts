import { describe, expect, it } from 'vitest'

import { migrateManifest } from '../manifest/migrate.js'

describe('migrateManifest', () => {
  it('rejects unknown manifest versions instead of blessing incompatible data', () => {
    expect(() =>
      migrateManifest({
        version: 'v999',
        data: [{ id: 'photo-1' }],
        cameras: [],
        lenses: [],
      } as any),
    ).toThrow('不支持的 manifest 版本：v999')
  })

  it('applies known migration steps before reaching the current version', () => {
    const migrated = migrateManifest({
      version: 'v7',
      data: [
        {
          id: 'photo-1',
          isLivePhoto: true,
          livePhotoVideoUrl: 'https://example.com/live.mov',
          livePhotoVideoS3Key: 'photos/live.mov',
        },
      ],
      cameras: [],
      lenses: [],
    } as any)

    expect(migrated.version).toBe('v8')
    expect(migrated.data[0].video).toEqual({
      type: 'live-photo',
      videoUrl: 'https://example.com/live.mov',
      s3Key: 'photos/live.mov',
    })

    const migratedItem = migrated.data[0] as any
    expect(migratedItem.isLivePhoto).toBeUndefined()
    expect(migratedItem.livePhotoVideoUrl).toBeUndefined()
    expect(migratedItem.livePhotoVideoS3Key).toBeUndefined()
  })
})
