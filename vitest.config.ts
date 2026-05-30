import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test-d.ts', 'src/**/*.test.ts', 'tests/**/*.e2e.test.ts'],
    exclude: ['node_modules', 'dist', '.session', '.temp', '.planning'],
    passWithNoTests: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/auth/adapters/redis.ts',
        'src/auth/adapters/postgres.ts',
        'src/store/adapters/redis.ts',
        'src/store/adapters/postgres.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '~': new URL('./src', import.meta.url).pathname,
    },
  },
})
