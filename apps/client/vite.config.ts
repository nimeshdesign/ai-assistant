/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_PROXY ?? 'http://localhost:5000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
        // Use the shared package's TypeScript source directly. Importing its built `dist` through
        // the workspace symlink meant the dev server didn't notice changes to shared code
        // (validation rules, detection heuristics) until it was restarted.
        { find: /^@aia\/shared$/, replacement: path.resolve(import.meta.dirname, '../../packages/shared/src/index.ts') },
        { find: /^@aia\/shared\/seed$/, replacement: path.resolve(import.meta.dirname, '../../packages/shared/src/seed/index.ts') },
      ],
    },
    // Pre-bundle deps used only by lazy routes, so Vite doesn't discover them mid-session and
    // re-optimise (which forces a full reload and can briefly load two copies of React).
    optimizeDeps: {
      include: [
        'react',
        'react-dom/client',
        'react-router',
        'react-redux',
        '@reduxjs/toolkit',
        '@reduxjs/toolkit/query/react',
        'radix-ui',
        'lucide-react',
        'recharts',
        'cmdk',
        'sonner',
        'react-hook-form',
        '@hookform/resolvers/zod',
        'zod',
        'clsx',
        'tailwind-merge',
        'class-variance-authority',
        'tesseract.js',
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      // In dev, the client calls /api/* on its own origin and Vite forwards to Express.
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // The first render of a lazy page compiles it (e.g. the chart library); under parallel load
      // that can take several seconds, so give whole tests room beyond the 6 s query timeout.
      testTimeout: 20_000,
      css: false,
    },
  };
});
