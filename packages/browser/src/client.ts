import * as Comlink from 'comlink';
import type { WorkerApi } from './worker/worker';

function createWorker() {
  return new Worker(new URL('./worker/worker.ts', import.meta.url), {
    type: 'module',
  });
}

const worker = createWorker();
export const api = Comlink.wrap<WorkerApi>(worker);

let initPromise: Promise<{ ok: boolean }> | null = null;

export function ensureDbReady() {
  if (!initPromise) {
    initPromise = api.init();
  }
  return initPromise;
}
