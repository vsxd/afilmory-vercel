import 'dotenv-expand/config'

/* eslint-disable no-console */
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

interface PrecheckOptions {
  env?: NodeJS.ProcessEnv
  runBuilder?: (env: NodeJS.ProcessEnv) => Promise<void>
  workdir?: string
}

export const precheck = async (options: PrecheckOptions = {}) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const workdir = options.workdir ?? path.resolve(__dirname, '../../..')
  const env = options.env ?? process.env
  const shouldBuildManifest = env.SKIP_MANIFEST_BUILD !== 'true'
  const requiredS3Vars = ['S3_BUCKET_NAME', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
  const missingS3Vars = requiredS3Vars.filter((key) => !env[key])
  const manifestPath = path.join(workdir, 'generated/photos-manifest.json')
  const ensureExistingManifest = async () => {
    await access(manifestPath)
  }

  if (!shouldBuildManifest) {
    console.warn(
      '[precheck] SKIP_MANIFEST_BUILD=true, skipping builder. Static output may be stale if S3 data changed.',
    )
    return
  }

  if (missingS3Vars.length > 0) {
    try {
      await ensureExistingManifest()
      console.warn(
        `[precheck] Missing S3 env vars (${missingS3Vars.join(', ')}), using existing manifest instead of running builder.`,
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

  const runBuilder =
    options.runBuilder ??
    ((builderEnv: NodeJS.ProcessEnv) =>
      $({
        cwd: workdir,
        env: builderEnv,
        stdio: 'inherit',
      })`pnpm --filter @afilmory/builder cli`)

  try {
    await runBuilder({
      ...env,
      BUILDER_CONFIG_PATH: env.BUILDER_CONFIG_PATH || 'builder.config.ts',
    })
  } catch (error) {
    try {
      await ensureExistingManifest()
    } catch {
      throw error
    }

    console.warn(
      `[precheck] Builder failed, using existing manifest at ${manifestPath}. ` +
        `Set SKIP_MANIFEST_BUILD=true to make this explicit. Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  precheck().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
