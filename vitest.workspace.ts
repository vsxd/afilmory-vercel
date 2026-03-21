import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'data',
      root: './packages/data',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'ui',
      root: './packages/ui',
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
    },
  },
])
