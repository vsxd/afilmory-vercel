export type WorkspaceType = 'app' | 'package'

export type WorkspaceNode = {
  name: string
  dir: string
  type: WorkspaceType
  deps: string[]
}

export function buildWorkspaceGraph(nodes: WorkspaceNode[]): Map<string, string[]> {
  const workspaceNames = new Set(nodes.map((n) => n.name))
  const graph = new Map<string, string[]>()

  for (const node of nodes) {
    graph.set(
      node.name,
      node.deps.filter((dep) => workspaceNames.has(dep)),
    )
  }

  return graph
}

export function detectCycles(graph: Map<string, string[]>): string[][] {
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

export function validateArchitecture(nodes: WorkspaceNode[]): string[] {
  const graph = buildWorkspaceGraph(nodes)
  const errors: string[] = []

  for (const cycle of detectCycles(graph)) {
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

  return errors
}
