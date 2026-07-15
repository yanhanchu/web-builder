import * as Comlink from 'comlink';
import type { WorkerApi } from './worker/worker';

// `new URL(..., import.meta.url)` 是 Vite 官方推薦的 worker 建立方式,
// 讓 Vite 在 build 時能正確處理 worker 的 bundling 與 code-splitting。
function createWorker() {
  return new Worker(new URL('./worker/worker.ts', import.meta.url), {
    type: 'module',
  });
}

const worker = createWorker();

// api 現在是「長得跟 WorkerApi 一模一樣、但每個方法都回傳 Promise」的物件,
// 呼叫起來完全就像本地的 async function,底層由 Comlink 處理訊息傳遞與序列化。
export const api = Comlink.wrap<WorkerApi>(worker);

// 全域只需要呼叫一次 init(),之後可以放心呼叫其他 API。
let initPromise: Promise<{ ok: boolean }> | null = null;

export function ensureDbReady() {
  if (!initPromise) {
    initPromise = api.init();
  }
  return initPromise;
}
