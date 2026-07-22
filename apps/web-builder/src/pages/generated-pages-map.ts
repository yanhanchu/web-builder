import type { ComponentType } from 'react';

// 每個 app 底下 build-time 產生的頁面清單（見 scripts/generate-pages.mjs），
// 各自存放在 data/{app}/pages-map.ts，這裡用 import.meta.glob 依 app 動態
// 彙整成 `{ [app]: GeneratedPageEntry[] }`，取代原本單一固定路徑的 import。

export interface GeneratedPageEntry {
  id: string;
  /** 相對於掛載路由的 path 片段，預設等同 id */
  path: string;
  title: string;
  Component: ComponentType;
}

const pagesMapModules = import.meta.glob('../../data/*/pages-map.ts', {
  eager: true,
}) as Record<string, { generatedPages: GeneratedPageEntry[] }>;

/** 從 glob 匯入的路徑（例如 `../../data/default/pages-map.ts`）取出中間的 app 名稱 */
function appFromGlobPath(globPath: string): string | null {
  const match = globPath.match(/\/data\/([^/]+)\/pages-map\.ts$/);
  return match ? match[1] : null;
}

function buildGeneratedPagesByApp(): Record<string, GeneratedPageEntry[]> {
  const result: Record<string, GeneratedPageEntry[]> = {};
  for (const [globPath, mod] of Object.entries(pagesMapModules)) {
    const app = appFromGlobPath(globPath);
    if (!app) continue;
    result[app] = mod.generatedPages;
  }
  return result;
}

/** app -> 該 app build-time 產生的頁面清單 */
export const generatedPagesByApp: Record<string, GeneratedPageEntry[]> =
  buildGeneratedPagesByApp();

/** 目前 app 底下的頁面清單；app 尚未產生過任何頁面時回傳空陣列。 */
export function getGeneratedPages(app: string | undefined | null): GeneratedPageEntry[] {
  if (!app) return [];
  return generatedPagesByApp[app] ?? [];
}

/** 目前 app 底下，依 id 找出單一頁面。 */
export function getGeneratedPageById(
  app: string | undefined | null,
  id: string,
): GeneratedPageEntry | undefined {
  return getGeneratedPages(app).find((p) => p.id === id);
}