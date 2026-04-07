/* eslint-disable no-console */

import fs from 'node:fs/promises'
import path from 'node:path'

import { migrateManifest } from '../packages/builder/src/manifest/migrate'
import { CURRENT_MANIFEST_VERSION } from '../packages/builder/src/manifest/version'

async function run() {
  const manifestPath = path.resolve(process.cwd(), 'generated/photos-manifest.json')
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed?.version === CURRENT_MANIFEST_VERSION) {
      console.info(`Manifest 已是 ${CURRENT_MANIFEST_VERSION}，跳过迁移`)
      return
    }
    const migrated = migrateManifest(parsed, CURRENT_MANIFEST_VERSION)
    await fs.writeFile(manifestPath, JSON.stringify(migrated, null, 2))
    console.info(`✅ Manifest 迁移完成 -> ${CURRENT_MANIFEST_VERSION}`)
  } catch (e) {
    console.error('❌ 迁移失败：', e)
    process.exitCode = 1
  }
}

run()
