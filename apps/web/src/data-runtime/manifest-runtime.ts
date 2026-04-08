import type { AfilmoryManifest } from '@afilmory/data'
import { parseManifest } from '@afilmory/data'

const MANIFEST_REQUEST_TIMEOUT_MS = 15_000

type ManifestRuntimeGlobals = typeof globalThis & {
  __MANIFEST__?: unknown
  __MANIFEST_URL__?: string
  __MANIFEST_PROMISE__?: Promise<unknown>
}

function getManifestGlobals(): ManifestRuntimeGlobals {
  return globalThis as ManifestRuntimeGlobals
}

async function fetchManifest(url: string): Promise<unknown> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = globalThis.setTimeout(() => controller?.abort(), MANIFEST_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'force-cache',
      signal: controller?.signal,
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Manifest request failed: ${response.status} ${response.statusText}`.trim())
    }

    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Manifest request timed out after ${MANIFEST_REQUEST_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

function coerceManifest(input: unknown): AfilmoryManifest {
  const manifest = parseManifest(input)
  const globals = getManifestGlobals()
  globals.__MANIFEST__ = manifest
  globals.__MANIFEST_PROMISE__ = Promise.resolve(manifest)
  return manifest
}

export async function loadManifestRuntime(): Promise<AfilmoryManifest> {
  const globals = getManifestGlobals()

  if (globals.__MANIFEST__) {
    return coerceManifest(globals.__MANIFEST__)
  }

  const existingPromise = globals.__MANIFEST_PROMISE__
  if (existingPromise) {
    try {
      return coerceManifest(await existingPromise)
    } catch (error) {
      globals.__MANIFEST_PROMISE__ = undefined
      throw error
    }
  }

  const manifestUrl = globals.__MANIFEST_URL__
  if (!manifestUrl) {
    throw new Error('No manifest source was injected into the page.')
  }

  const manifestPromise = fetchManifest(manifestUrl).catch((error) => {
    globals.__MANIFEST_PROMISE__ = undefined
    throw error
  })
  globals.__MANIFEST_PROMISE__ = manifestPromise

  return coerceManifest(await manifestPromise)
}
