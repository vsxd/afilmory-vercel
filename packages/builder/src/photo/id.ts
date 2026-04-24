import crypto from 'node:crypto'
import path from 'node:path'

export const DEFAULT_COLLISION_DIGEST_LENGTH = 8

export function getPhotoIdBaseName(storageKey: string): string {
  return path.basename(storageKey, path.extname(storageKey))
}

export function createPhotoId(
  storageKey: string,
  options: {
    digestSuffixLength?: number
    forceDigest?: boolean
  } = {},
): string {
  const baseName = getPhotoIdBaseName(storageKey)
  const configuredLength = options.digestSuffixLength ?? 0
  const digestLength =
    configuredLength > 0 ? configuredLength : options.forceDigest ? DEFAULT_COLLISION_DIGEST_LENGTH : 0

  if (digestLength <= 0) {
    return baseName
  }

  const digestSuffix = crypto.createHash('sha256').update(storageKey).digest('hex').slice(0, digestLength)
  return `${baseName}_${digestSuffix}`
}

export function findPhotoIdCollisionKeys(storageKeys: string[]): Set<string> {
  const keysByBaseName = new Map<string, string[]>()

  for (const key of storageKeys) {
    const baseName = getPhotoIdBaseName(key)
    const keys = keysByBaseName.get(baseName)

    if (keys) {
      keys.push(key)
    } else {
      keysByBaseName.set(baseName, [key])
    }
  }

  const collisionKeys = new Set<string>()

  for (const keys of keysByBaseName.values()) {
    if (keys.length <= 1) continue

    for (const key of keys) {
      collisionKeys.add(key)
    }
  }

  return collisionKeys
}
