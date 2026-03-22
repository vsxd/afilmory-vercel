import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
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
        esbuild: {
          jsx: 'automatic',
        },
        test: {
          name: 'ui',
          root: './packages/ui',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'builder',
          root: './packages/builder',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        esbuild: {
          jsx: 'automatic',
        },
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
    ],
  },
})
