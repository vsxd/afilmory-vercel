import assert from 'node:assert/strict'
import test from 'node:test'

import type { WorkspaceNode } from '../../scripts/check-architecture-lib'
import { buildWorkspaceGraph, detectCycles, validateArchitecture } from '../../scripts/check-architecture-lib'

const buildNodes = (): WorkspaceNode[] => [
  { name: '@afilmory/data', dir: 'packages/data', type: 'package', deps: [] },
  { name: '@afilmory/utils', dir: 'packages/utils', type: 'package', deps: ['@afilmory/data'] },
  { name: '@afilmory/web', dir: 'apps/web', type: 'app', deps: ['@afilmory/utils'] },
]

test('buildWorkspaceGraph 仅保留 workspace 内依赖', () => {
  const nodes: WorkspaceNode[] = [
    { name: '@afilmory/data', dir: 'packages/data', type: 'package', deps: ['zod'] },
    { name: '@afilmory/web', dir: 'apps/web', type: 'app', deps: ['@afilmory/data', 'react'] },
  ]

  const graph = buildWorkspaceGraph(nodes)
  assert.deepEqual(graph.get('@afilmory/data'), [])
  assert.deepEqual(graph.get('@afilmory/web'), ['@afilmory/data'])
})

test('detectCycles 能识别循环依赖', () => {
  const graph = new Map<string, string[]>([
    ['a', ['b']],
    ['b', ['c']],
    ['c', ['a']],
  ])

  const cycles = detectCycles(graph)
  assert.equal(cycles.length, 1)
  assert.deepEqual(cycles[0], ['a', 'b', 'c', 'a'])
})

test('validateArchitecture 对合法分层返回空错误', () => {
  const errors = validateArchitecture(buildNodes())
  assert.deepEqual(errors, [])
})

test('validateArchitecture 检测 package -> app 非法依赖', () => {
  const nodes = buildNodes()
  nodes[1].deps = ['@afilmory/web']

  const errors = validateArchitecture(nodes)
  assert.ok(errors.some((line) => line.includes('不能依赖应用 @afilmory/web')))
})

test('validateArchitecture 检测 data 基础层漂移', () => {
  const nodes = buildNodes()
  nodes[0].deps = ['@afilmory/utils']

  const errors = validateArchitecture(nodes)
  assert.ok(errors.some((line) => line.includes('@afilmory/data 应处于基础层')))
})
