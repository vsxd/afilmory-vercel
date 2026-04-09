import type { Plugin, UserConfig } from 'vite'

type DependencyChunkGroup = {
  name: string
  patterns: string[]
}

function getNodeModulePackageName(id: string): string | null {
  const modulePath = id.split('/node_modules/').at(-1)
  if (!modulePath) return null

  const [firstSegment, secondSegment] = modulePath.split('/')
  if (!firstSegment || firstSegment === '.pnpm') return null

  if (firstSegment.startsWith('@') && secondSegment) {
    return `${firstSegment}/${secondSegment}`
  }

  return firstSegment
}

function matchesPattern(packageName: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    return packageName.startsWith(pattern.slice(0, -1))
  }

  return packageName === pattern
}

export function createDependencyChunksPlugin(groups: DependencyChunkGroup[]): Plugin {
  return {
    name: 'dependency-chunks',
    config(config: UserConfig) {
      config.build = config.build || {}
      // The HEIC codec bundle is intentionally loaded on demand and remains large.
      config.build.chunkSizeWarningLimit = 3000
      config.build.rollupOptions = config.build.rollupOptions || {}
      config.build.rollupOptions.output = config.build.rollupOptions.output || {}

      const { output } = config.build.rollupOptions
      const outputConfig = Array.isArray(output) ? output[0] : output
      outputConfig.assetFileNames = 'assets/[name].[hash:6][extname]'
      outputConfig.onlyExplicitManualChunks = true
      outputConfig.chunkFileNames = (chunkInfo) => {
        return chunkInfo.name.startsWith('vendor/') ? '[name]-[hash].js' : 'assets/[name]-[hash].js'
      }

      outputConfig.manualChunks = (id: string) => {
        if (!id.includes('/node_modules/')) {
          return null
        }

        const packageName = getNodeModulePackageName(id)
        if (!packageName) {
          return null
        }

        const matchedGroup = groups.find((group) =>
          group.patterns.some((pattern) => matchesPattern(packageName, pattern)),
        )
        return matchedGroup ? `vendor/${matchedGroup.name}` : null
      }
    },
  }
}
