// `data/{app}/records/{typeId}.json` 的讀寫 API 呼叫層。
//
// 跟 src/lib/routes-disk-api.ts 相同的模式：把「寫入檔案系統」「從檔案系統讀取
// （覆蓋）」這兩個動作各自的 fetch 邏輯抽出來。
//
// 只在 `vite dev` 環境有效，見 scripts/write-data-plugin.mjs。
//
// DataManagerData 結構為 app -> typeId -> datasetName -> Dataset，
// disk-api 本身只做 JSON 傳遞，不感知內部結構。

import type { DataManagerData } from '@/types/data-manager-types';

export type DiskApiResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** 把整份 dataManagerData（app -> typeId -> datasetName -> Dataset）寫入各自的 data/{app}/records/{typeId}.json */
export async function writeDataRecordsToDisk(
  dataManagerData: DataManagerData
): Promise<DiskApiResult<{ writtenFiles: string[]; appCount: number; recordCount: number }>> {
  try {
    const res = await fetch('/__api/write-data-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataManagerData }),
    });
    const data = (await res.json().catch(() => null)) as
      | DiskApiResult<{ writtenFiles: string[]; appCount: number; recordCount: number }>
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

/** 讀取磁碟上目前所有 app 的 records/{typeId}.json（{ [app]: { [typeId]: { [datasetName]: Dataset } } }） */
export async function readDataRecordsFromDisk(): Promise<DiskApiResult<{ dataManagerData: DataManagerData }>> {
  try {
    const res = await fetch('/__api/write-data-records');
    const data = (await res.json().catch(() => null)) as DiskApiResult<{ dataManagerData: DataManagerData }> | null;
    if (!res.ok || !data) return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}