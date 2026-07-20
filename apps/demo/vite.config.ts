import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Do not remove optimizeDeps/worker settings — see docs/constraints.md
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@workspace/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'], // PGlite ships its own WASM; pre-bundling breaks it
  },
  worker: {
    format: 'es', // worker.ts uses import/export
  },
});
