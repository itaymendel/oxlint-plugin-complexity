import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Map src imports so tests can import from source directly
      '#src': resolve(__dirname, 'src'),
    },
  },
  esbuild: {
    // Use test tsconfig for proper path resolution
    tsconfigRaw: {
      compilerOptions: {
        paths: {
          '#src/*': ['./src/*'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    deps: {
      interopDefault: true,
    },
  },
});
