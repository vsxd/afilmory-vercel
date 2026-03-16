import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveFromBuilderRoot(relativePath: string): string {
  return path.resolve(__dirname, relativePath)
}

/**
 * Builder 生成产物所在的 Web app 根目录。
 * 可通过环境变量覆盖，便于 monorepo 迁移或独立调试：
 * - AFILMORY_WEB_DIR=/abs/path/to/apps/web
 */
export const WEB_WORKDIR = process.env.AFILMORY_WEB_DIR
  ? path.resolve(process.env.AFILMORY_WEB_DIR)
  : resolveFromBuilderRoot('../../../apps/web')

export const MANIFEST_PATH = path.join(WEB_WORKDIR, 'src', 'data', 'photos-manifest.json')
export const THUMBNAILS_DIR = path.join(WEB_WORKDIR, 'public', 'thumbnails')
export const ORIGINALS_DIR = path.join(WEB_WORKDIR, 'public', 'originals')

// Backward compatibility for existing imports.
export const workdir = WEB_WORKDIR
