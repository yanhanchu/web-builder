import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// AI agents: do not remove or "simplify" the optimizeDeps/worker settings
// below — see README.md "Key constraints that must be preserved" for the
// full explanation. The `react()` plugin is unrelated to those constraints
// and is safe to configure/replace normally (e.g. swap for another
// framework's Vite plugin if the UI layer changes again).
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // PGlite bundles its own WASM binary and an internal dynamic worker.
    // Letting esbuild's dependency pre-bundling touch it breaks it at runtime.
    // Excluding it here lets the browser handle it as native ESM instead.
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es', // our worker (src/worker/worker.ts) uses import/export,
    // so it must be built as an ES module worker, not the legacy classic worker.
  },
});
