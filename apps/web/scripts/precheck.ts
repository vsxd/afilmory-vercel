import { access, mkdir, writeFile } from 'node:fs/promises'
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
  const fallbackManifestPath = path.join(workdir, 'apps/web/src/data/photos-manifest.json')

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
      await mkdir(path.dirname(fallbackManifestPath), { recursive: true })
      await writeFile(
        fallbackManifestPath,
        JSON.stringify(
          {
            version: 'v8',
            data: [],
          },
          null,
          2,
        ),
      )
      console.warn(
        `[precheck] Missing S3 env vars (${missingS3Vars.join(', ')}), generated an empty manifest at ${fallbackManifestPath} for preview build.`,
      )
      return
    }
  }

  console.info('[precheck] Running builder CLI to refresh manifest from source...')

  await $({
    cwd: workdir,
    stdio: 'inherit',
  })`pnpm --filter @afilmory/builder cli`
}
