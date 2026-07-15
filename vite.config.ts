import { defineConfig } from 'vite';

// AI agents: do not remove or "simplify" these two settings — see README.md
// "Key constraints that must be preserved" for the full explanation.
export default defineConfig({
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
