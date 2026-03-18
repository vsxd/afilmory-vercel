import type { AfilmoryManifest } from './types'

export type RuntimeManifestGlobal = typeof globalThis & {
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

export function resolveRuntimeManifestFrom(runtimeGlobal: RuntimeManifestGlobal): AfilmoryManifest | null {
  return readFromWindow(runtimeGlobal) ?? readFromGlobalThis(runtimeGlobal)
}

export function resolveRuntimeManifest(): AfilmoryManifest | null {
  return resolveRuntimeManifestFrom(globalThis as RuntimeManifestGlobal)
}
