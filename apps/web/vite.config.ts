/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Static snapshot (VITE_STATIC=1) is hosted in a sub-folder: relative asset URLs.
  base: process.env.VITE_STATIC === '1' ? './' : '/',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:8096',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Tests de componentes React (test/*.test.tsx) corren en jsdom; el resto en node
    // (los .tsx pueden fijarlo también con `// @vitest-environment jsdom`).
    environment: 'node',
    environmentMatchGlobs: [['test/**/*.test.tsx', 'jsdom']],
  },
});
