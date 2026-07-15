import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // PGlite 內含 WASM 與動態 worker,讓 esbuild 預先 bundle 反而會壞掉,
    // 這裡明確排除,交給瀏覽器原生 ESM 處理。
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es', // worker 內要能用 import/export,必須是 module worker
  },
});
