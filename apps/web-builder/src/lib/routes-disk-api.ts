// `data/{app}/routes.json` 的讀寫 API 呼叫層。
//
// 跟 src/lib/pages-disk-api.ts 相同的模式：把「寫入檔案系統」「從檔案系統讀取
// （覆蓋）」這兩個動作各自的 fetch 邏輯抽出來，讓 RouteManager（未來若有其他地方
// 要操作 routes 磁碟同步）都能共用同一份。
//
// 只在 `vite dev` 環境有效，見 scripts/write-routes-plugin.mjs。

import type { RoutesData } from '@/types/route-types';

export type DiskApiResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** 把整份 routesData（app -> RouteEntry[]）寫入各自的 data/{app}/routes.json */
export async function writeRoutesToDisk(
  routesData: RoutesData
): Promise<DiskApiResult<{ writtenFiles: string[]; appCount: number; routeCount: number }>> {
  try {
    const res = await fetch('/__api/write-routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routesData }),
    });
    const data = (await res.json().catch(() => null)) as
      | DiskApiResult<{ writtenFiles: string[]; appCount: number; routeCount: number }>
      | null;
    if (!res.ok || !data) return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}

/** 讀取磁碟上目前所有 app 的 routes.json（{ [app]: RouteEntry[] }） */
export async function readRoutesFromDisk(): Promise<DiskApiResult<{ routesData: RoutesData }>> {
  try {
    const res = await fetch('/__api/write-routes');
    const data = (await res.json().catch(() => null)) as DiskApiResult<{ routesData: RoutesData }> | null;
    if (!res.ok || !data) return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}
