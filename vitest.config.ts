import { defineConfig } from 'vitest/config';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import * as path from 'path';

// Remove duplicate import statement and add type declarations for the imports
/// <reference types="vitest" />
/// <reference types="@vitejs/plugin-react" />
/// <reference types="vite-tsconfig-paths" />
/// <reference types="node" />

// Fix the duplicate import statement and add missing type declarations
import type { UserConfig } from 'vitest/config';
import type { ReactPlugin } from '@vitejs/plugin-react';
import type { TsconfigPathsOptions } from 'vite-tsconfig-paths';

const reactPlugin: ReactPlugin = react;
const tsconfigPathsPlugin: TsconfigPathsOptions = tsconfigPaths;

export default defineConfig({
  plugins: [reactPlugin(), tsconfigPathsPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    },
  },
}); 