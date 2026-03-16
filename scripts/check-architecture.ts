import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const workspaceDirs = ['apps', 'packages']

type WorkspaceType = 'app' | 'package'

type WorkspaceNode = {
  name: string
  dir: string
  type: WorkspaceType
  deps: string[]
}

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(content) as T
}

const getWorkspaceNodes = async (): Promise<WorkspaceNode[]> => {
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
      } catch {
        // Ignore directories without package.json
      }
    }
  }

  return nodes
}

const detectCycles = (graph: Map<string, string[]>): string[][] => {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const stack: string[] = []

  const dfs = (node: string): void => {
    visited.add(node)
    inStack.add(node)
    stack.push(node)

    for (const next of graph.get(node) ?? []) {
      if (!visited.has(next)) {
        dfs(next)
        continue
      }

      if (inStack.has(next)) {
        const cycleStart = stack.lastIndexOf(next)
        if (cycleStart !== -1) {
          const cycle = [...stack.slice(cycleStart), next]
          const signature = cycle.join(' -> ')
          const exists = cycles.some((item) => item.join(' -> ') === signature)
          if (!exists) {
            cycles.push(cycle)
          }
        }
      }
    }

    stack.pop()
    inStack.delete(node)
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node)
  }

  return cycles
}

const main = async (): Promise<void> => {
  const nodes = await getWorkspaceNodes()
  const workspaceNames = new Set(nodes.map((n) => n.name))

  const graph = new Map<string, string[]>()
  for (const node of nodes) {
    graph.set(
      node.name,
      node.deps.filter((dep) => workspaceNames.has(dep)),
    )
  }

  const errors: string[] = []

  const cycles = detectCycles(graph)
  for (const cycle of cycles) {
    errors.push(`发现循环依赖: ${cycle.join(' -> ')}`)
  }

  const nodeMap = new Map(nodes.map((node) => [node.name, node]))

  for (const node of nodes) {
    for (const dep of graph.get(node.name) ?? []) {
      const target = nodeMap.get(dep)
      if (!target) continue

      if (node.type === 'package' && target.type === 'app') {
        errors.push(`非法依赖: 包 ${node.name} 不能依赖应用 ${target.name}`)
      }
    }
  }

  const dataPackage = '@afilmory/data'
  const dataDeps = graph.get(dataPackage) ?? []
  if (dataDeps.length > 0) {
    errors.push(`分层约束: ${dataPackage} 应处于基础层，不能依赖其他 workspace 包: ${dataDeps.join(', ')}`)
  }

  if (errors.length > 0) {
    console.error('❌ 架构检查失败')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.info('✅ 架构检查通过')
  console.info(`- Workspace 包数量: ${nodes.length}`)
  console.info(`- 检查项: 循环依赖、层级依赖、data 基础层约束`)
}

await main()
