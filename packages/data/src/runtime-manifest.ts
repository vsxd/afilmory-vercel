import type { AfilmoryManifest } from './types'

type RuntimeManifestGlobal = typeof globalThis & {
  __MANIFEST__?: AfilmoryManifest
  window?: {
    __MANIFEST__?: AfilmoryManifest
  }
}

function readFromWindow(runtimeGlobal: RuntimeManifestGlobal): AfilmoryManifest | null {
  return runtimeGlobal.window?.__MANIFEST__ ?? null
}

function readFromGlobalThis(runtimeGlobal: RuntimeManifestGlobal): AfilmoryManifest | null {
  return runtimeGlobal.__MANIFEST__ ?? null
}

export function resolveRuntimeManifest(): AfilmoryManifest | null {
  const runtimeGlobal = globalThis as RuntimeManifestGlobal
  return readFromWindow(runtimeGlobal) ?? readFromGlobalThis(runtimeGlobal)
}
