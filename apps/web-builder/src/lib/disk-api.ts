// `data/{app}/app.json` 的讀寫 API 呼叫層：透過 `/__api/write-apps`
// （見 scripts/write-apps-plugin.mjs）讀寫每個 app 的設定，並在
// 新增 / 刪除 / 重新命名 app 時同步 data/{app}/pages.json 與
// data/{app}/i18n/ 目錄（同一個 app 目錄底下一起搬移）。
//
// 跟 `src/pages/i18n/disk-api.ts`、`src/pages/dynamic/disk-api.ts` 同一種
// 命名 / 回傳形狀（`DiskApiResult<T>`），三個功能的 dev-only 寫檔 API 是同一種
// 模式：只在 `vite dev` 環境存在，build 產物 / 正式站呼叫會直接顯示錯誤訊息。

import type { AppsData, AppSettings } from '@/types/types';

const API_PATH = '/__api/write-apps';

export type DiskApiResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function postAction<T>(body: Record<string, unknown>): Promise<DiskApiResult<T>> {
  try {
    const res = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as DiskApiResult<T> | null;
    if (!res.ok || !data) {
      return { ok: false, error: data && 'error' in data ? data.error : `HTTP ${res.status}` };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)}（僅 \`npm run dev\` 環境提供此 API，離線或正式站會失敗）`,
    };
  }
}

/** 讀取磁碟上目前每個 app 的 data/{app}/app.json，組成 { [app]: AppSettings } */
export async function readAppsFromDisk(): Promise<DiskApiResult<{ appsData: AppsData }>> {
  try {
    const res = await fetch(API_PATH);
    const data = (await res.json().catch(() => null)) as
      | DiskApiResult<{ appsData: AppsData }>
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

/** 整批覆寫每個 app 各自的 data/{app}/app.json（設定欄位編輯用） */
export function writeAppsToDisk(appsData: AppsData) {
  return postAction<{ appCount: number }>({ action: 'save', appsData });
}

/** 新增一個 app（建立 data/{app}/ 目錄、app.json 與空的 pages.json） */
export function createAppOnDisk(app: string, settings: AppSettings) {
  return postAction<{ app: string; appCount: number }>({
    action: 'create',
    app,
    settings,
  });
}

/** 刪除一個 app（整個刪除 data/{app}/ 目錄，含 app.json / pages.json / i18n/） */
export function deleteAppOnDisk(app: string) {
  return postAction<{ app: string }>({ action: 'delete', app });
}

/** 重新命名一個 app（把整個 data/{oldName}/ 目錄改名成 data/{newName}/） */
export function renameAppOnDisk(oldName: string, newName: string) {
  return postAction<{ oldName: string; newName: string }>({
    action: 'rename',
    oldName,
    newName,
  });
}
