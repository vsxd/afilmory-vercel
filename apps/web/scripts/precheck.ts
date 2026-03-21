import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

export const precheck = async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const workdir = path.resolve(__dirname, '../../..')
  const shouldBuildManifest = process.env.SKIP_MANIFEST_BUILD !== 'true'
  const requiredS3Vars = ['S3_BUCKET_NAME', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
  const missingS3Vars = requiredS3Vars.filter((key) => !process.env[key])
  const manifestPath = path.join(workdir, 'packages/data/src/photos-manifest.json')

  if (!shouldBuildManifest) {
    console.warn(
      '[precheck] SKIP_MANIFEST_BUILD=true, skipping builder. Static output may be stale if S3 data changed.',
    )
    return
  }

  if (missingS3Vars.length > 0) {
    try {
      await access(manifestPath)
      console.warn(
        `[precheck] Missing S3 env vars (${missingS3Vars.join(', ')}), using checked-in manifest instead of running builder.`,
      )
      return
    } catch {
      throw new Error(
        `[precheck] Missing required S3 environment variables: ${missingS3Vars.join(', ')}. ` +
          `Either configure them or commit an existing manifest at ${manifestPath}.`,
      )
    }
  }

  console.info('[precheck] Running builder CLI to refresh manifest from source...')

  await $({
    cwd: workdir,
    stdio: 'inherit',
  })`pnpm --filter @afilmory/builder cli`
}
