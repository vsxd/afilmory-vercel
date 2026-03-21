import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
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
    ],
  },
})
