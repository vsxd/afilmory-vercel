import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveRuntimeManifest } from '../../packages/data/src/runtime-manifest'
import type { AfilmoryManifest } from '../../packages/data/src/types'

const fixtureManifest = {
  version: 'v7',
  data: [],
  cameras: [],
  lenses: [],
} satisfies AfilmoryManifest

test('resolveRuntimeManifest 优先读取 window.__MANIFEST__', () => {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __MANIFEST__?: AfilmoryManifest
    window?: { __MANIFEST__?: AfilmoryManifest }
  }

  const originWindow = runtimeGlobal.window
  const originManifest = runtimeGlobal.__MANIFEST__

  runtimeGlobal.window = { __MANIFEST__: fixtureManifest }
  runtimeGlobal.__MANIFEST__ = null as unknown as AfilmoryManifest

  try {
    assert.equal(resolveRuntimeManifest(), fixtureManifest)
  } finally {
    runtimeGlobal.window = originWindow
    runtimeGlobal.__MANIFEST__ = originManifest
  }
})

test('resolveRuntimeManifest 在无 window 时读取 globalThis.__MANIFEST__', () => {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __MANIFEST__?: AfilmoryManifest
    window?: { __MANIFEST__?: AfilmoryManifest }
  }

  const originWindow = runtimeGlobal.window
  const originManifest = runtimeGlobal.__MANIFEST__

  runtimeGlobal.window = undefined
  runtimeGlobal.__MANIFEST__ = fixtureManifest

  try {
    assert.equal(resolveRuntimeManifest(), fixtureManifest)
  } finally {
    runtimeGlobal.window = originWindow
    runtimeGlobal.__MANIFEST__ = originManifest
  }
})

test('resolveRuntimeManifest 在缺失时返回 null', () => {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __MANIFEST__?: AfilmoryManifest
    window?: { __MANIFEST__?: AfilmoryManifest }
  }

  const originWindow = runtimeGlobal.window
  const originManifest = runtimeGlobal.__MANIFEST__

  runtimeGlobal.window = undefined
  runtimeGlobal.__MANIFEST__ = undefined

  try {
    assert.equal(resolveRuntimeManifest(), null)
  } finally {
    runtimeGlobal.window = originWindow
    runtimeGlobal.__MANIFEST__ = originManifest
  }
})
