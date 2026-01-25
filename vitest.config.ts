import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'lib/billing/**/*.ts',
        'lib/queue/jobs.ts',
        'lib/redis/keys.ts',
        'lib/workers/worker.ts',
        'lib/api/schemas/requests.ts',
      ],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.test.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 55,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './lib'),
    },
  },
});
