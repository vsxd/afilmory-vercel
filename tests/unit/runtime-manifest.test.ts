import assert from 'node:assert/strict'
import test from 'node:test'

import type { RuntimeManifestGlobal } from '../../packages/data/src/runtime-manifest'
import { resolveRuntimeManifest, resolveRuntimeManifestFrom } from '../../packages/data/src/runtime-manifest'
import type { AfilmoryManifest } from '../../packages/data/src/types'

const fixtureManifest = {
  version: 'v7',
  data: [],
  cameras: [],
  lenses: [],
} satisfies AfilmoryManifest

test('resolveRuntimeManifestFrom 优先读取 window.__MANIFEST__', () => {
  const runtimeGlobal = {
    __MANIFEST__: null,
    window: { __MANIFEST__: fixtureManifest },
  } as RuntimeManifestGlobal

  assert.equal(resolveRuntimeManifestFrom(runtimeGlobal), fixtureManifest)
})

test('resolveRuntimeManifestFrom 在无 window 时读取 globalThis.__MANIFEST__', () => {
  const runtimeGlobal = {
    __MANIFEST__: fixtureManifest,
    window: undefined,
  } as RuntimeManifestGlobal

  assert.equal(resolveRuntimeManifestFrom(runtimeGlobal), fixtureManifest)
})

test('resolveRuntimeManifestFrom 在缺失时返回 null', () => {
  const runtimeGlobal = {
    __MANIFEST__: undefined,
    window: undefined,
  } as RuntimeManifestGlobal

  assert.equal(resolveRuntimeManifestFrom(runtimeGlobal), null)
})

test('resolveRuntimeManifest 能从 globalThis 读取', () => {
  const runtimeGlobal = globalThis as RuntimeManifestGlobal
  const originManifest = runtimeGlobal.__MANIFEST__

  runtimeGlobal.__MANIFEST__ = fixtureManifest
  try {
    assert.equal(resolveRuntimeManifest(), fixtureManifest)
  } finally {
    runtimeGlobal.__MANIFEST__ = originManifest
  }
})
