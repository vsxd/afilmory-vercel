import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { precheck } from '../../scripts/precheck'

describe('precheck', () => {
  let tmpDir: string
  let runBuilder: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afilmory-precheck-'))
    runBuilder = vi.fn().mockResolvedValue(null)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { force: true, recursive: true })
  })

  async function writeManifest() {
    await fs.mkdir(path.join(tmpDir, 'generated'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'generated/photos-manifest.json'), '{"version":"v8","data":[]}')
  }

  it('skips the builder when explicitly requested', async () => {
    await precheck({
      workdir: tmpDir,
      env: { SKIP_MANIFEST_BUILD: 'true' },
      runBuilder,
    })

    expect(runBuilder).not.toHaveBeenCalled()
  })

  it('uses an existing manifest when S3 credentials are missing', async () => {
    await writeManifest()

    await precheck({
      workdir: tmpDir,
      env: {},
      runBuilder,
    })

    expect(runBuilder).not.toHaveBeenCalled()
  })

  it('fails when S3 credentials and manifest are both missing', async () => {
    await expect(
      precheck({
        workdir: tmpDir,
        env: {},
        runBuilder,
      }),
    ).rejects.toThrow('Missing required S3 environment variables')
  })

  it('falls back to an existing manifest when the builder cannot refresh remote state', async () => {
    await writeManifest()
    runBuilder.mockRejectedValueOnce(new Error('network unavailable'))

    await precheck({
      workdir: tmpDir,
      env: {
        S3_BUCKET_NAME: 'bucket',
        S3_ACCESS_KEY_ID: 'key',
        S3_SECRET_ACCESS_KEY: 'secret',
      },
      runBuilder,
    })

    expect(runBuilder).toHaveBeenCalledOnce()
  })
})
