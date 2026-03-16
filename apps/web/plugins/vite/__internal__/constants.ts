import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const DEFAULT_MONOREPO_ROOT_PATH = path.resolve(__dirname, '../../../../..')

function resolveManifestPath(): string {
  if (process.env.AFILMORY_MANIFEST_PATH) {
    return path.resolve(process.env.AFILMORY_MANIFEST_PATH)
  }

  return require.resolve('@afilmory/data/manifest')
}

export const MANIFEST_PATH = resolveManifestPath()
export const MONOREPO_ROOT_PATH = process.env.AFILMORY_MONOREPO_ROOT
  ? path.resolve(process.env.AFILMORY_MONOREPO_ROOT)
  : DEFAULT_MONOREPO_ROOT_PATH
