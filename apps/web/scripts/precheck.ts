import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

export const precheck = async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const workdir = path.resolve(__dirname, '../../..')
  const shouldBuildManifest = process.env.SKIP_MANIFEST_BUILD !== 'true'

  if (!shouldBuildManifest) {
    console.warn(
      '[precheck] SKIP_MANIFEST_BUILD=true, skipping builder. Static output may be stale if S3 data changed.',
    )
    return
  }

  console.info('[precheck] Running builder CLI to refresh manifest from source...')

  await $({
    cwd: workdir,
    stdio: 'inherit',
  })`pnpm --filter @afilmory/builder cli`
}
