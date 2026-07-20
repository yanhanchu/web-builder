import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Do not remove optimizeDeps/worker settings — see docs/constraints.md
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'], // PGlite ships its own WASM; pre-bundling breaks it
  },
  worker: {
    format: 'es', // worker.ts uses import/export
  },
});
