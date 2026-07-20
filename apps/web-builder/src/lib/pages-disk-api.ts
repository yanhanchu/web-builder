// `data/{app}/pages.json` 的讀寫 API 呼叫層。
//
// 跟 src/pages/i18n/disk-api.ts 相同的模式：把「寫入檔案系統」「從檔案系統讀取
// （覆蓋）」這兩個動作各自的 fetch 邏輯抽出來，讓 PageEditorRoute /
// PagesEditorIndex（未來若有其他地方要操作 pages 磁碟同步）都能共用同一份。
//
// 只在 `vite dev` 環境有效，見 scripts/write-pages-plugin.mjs。

import type { PagesData } from '@/types/pages-types';

export type DiskApiResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** 把整份 pagesData（app -> PageDef[]）寫入各自的 data/{app}/pages.json */
export async function writePagesToDisk(
  pagesData: PagesData
): Promise<DiskApiResult<{ writtenFiles: string[]; appCount: number; pageCount: number }>> {
  try {
    const res = await fetch('/__api/write-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagesData }),
    });
    const data = (await res.json().catch(() => null)) as
      | DiskApiResult<{ writtenFiles: string[]; appCount: number; pageCount: number }>
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

/** 讀取磁碟上目前所有 app 的 pages.json（{ [app]: PageDef[] }） */
export async function readPagesFromDisk(): Promise<DiskApiResult<{ pagesData: PagesData }>> {
  try {
    const res = await fetch('/__api/write-pages');
    const data = (await res.json().catch(() => null)) as DiskApiResult<{ pagesData: PagesData }> | null;
    if (!res.ok || !data) return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}
