import * as Comlink from 'comlink';
import type { WorkerApi } from './worker/worker';

// AI agents: this is the ONLY file that should create the Worker and wrap it
// with Comlink. UI code (src/main.ts, or your framework's components/hooks)
// should import `api` and `ensureDbReady` from here — never import PGlite,
// Drizzle, or the worker module directly from the main thread.

// `new URL(..., import.meta.url)` is Vite's officially recommended way to
// construct a worker, so Vite can correctly bundle and code-split it at build time.
function createWorker() {
  return new Worker(new URL('./worker/worker.ts', import.meta.url), {
    type: 'module',
  });
}

const worker = createWorker();

// `api` now looks exactly like `WorkerApi`, except every method returns a
// Promise. Calling it feels just like calling a local async function — Comlink
// handles message-passing and serialization to the worker under the hood.
export const api = Comlink.wrap<WorkerApi>(worker);

// `init()` only needs to run once globally; after that it's safe to call any
// other API method. This promise is memoized so multiple call sites can all
// await `ensureDbReady()` without triggering duplicate initialization.
let initPromise: Promise<{ ok: boolean }> | null = null;

export function ensureDbReady() {
  if (!initPromise) {
    initPromise = api.init();
  }
  return initPromise;
}
