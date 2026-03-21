import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { WorkspaceNode, WorkspaceType } from './check-architecture-lib.js'
import { validateArchitecture } from './check-architecture-lib.js'

const rootDir = process.cwd()
const workspaceDirs = ['apps', 'packages']

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(content) as T
}

function isMissingPackageJsonError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function getWorkspaceNodes(): Promise<WorkspaceNode[]> {
  const nodes: WorkspaceNode[] = []

  for (const workspaceDir of workspaceDirs) {
    const absWorkspaceDir = path.join(rootDir, workspaceDir)
    const entries = await readdir(absWorkspaceDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const packageJsonPath = path.join(absWorkspaceDir, entry.name, 'package.json')

      try {
        const packageJson = await readJson<{
          name: string
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
          peerDependencies?: Record<string, string>
        }>(packageJsonPath)

        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
          ...packageJson.peerDependencies,
        }

        const type: WorkspaceType = workspaceDir === 'apps' ? 'app' : 'package'

        nodes.push({
          name: packageJson.name,
          dir: `${workspaceDir}/${entry.name}`,
          type,
          deps: Object.keys(allDeps ?? {}),
        })
      } catch (error) {
        if (isMissingPackageJsonError(error)) {
          continue
        }

        throw error
      }
    }
  }

  return nodes
}

export async function runArchitectureCheck(): Promise<number> {
  const nodes = await getWorkspaceNodes()
  const errors = validateArchitecture(nodes)

  if (errors.length > 0) {
    console.error('❌ 架构检查失败')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    return 1
  }

  console.info('✅ 架构检查通过')
  console.info(`- Workspace 包数量: ${nodes.length}`)
  console.info('- 检查项: 循环依赖、层级依赖、data 基础层约束')
  return 0
}

const currentFilePath = fileURLToPath(import.meta.url)
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFilePath)
if (isDirectRun) {
  const exitCode = await runArchitectureCheck()
  process.exitCode = exitCode
}
