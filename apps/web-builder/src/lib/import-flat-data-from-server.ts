// ============================================================
// import-flat-data-from-server —— export-flat-data-to-server 的反向操作。
//
// export-flat-data-to-server 是把攤平檔案 POST 給 /api/data-export，
// 由 dev server 寫到 data/{appName}/ 目錄；這裡則是呼叫同一支 API 的
// GET，把 server 上已經寫好的檔案整包讀回來，再交給
// import-flat-data-to-storage.ts 寫回 localStorage 覆蓋掉現有內容。
//
// 跟 export 方向一樣，只能在有 vite dev server 在跑、且 /api 路由通的
// 環境下使用（純靜態 build 之後的產物不會有這個 API）。
// ============================================================

import { importFlatDataToStorage, type ImportFlatDataToStorageResult } from "./import-flat-data-to-storage";

export interface DataImportResult extends ImportFlatDataToStorageResult {
  /** 實際讀取的資料夾名稱，例如 "data/my-app"（相對於 monorepo 根目錄）。 */
  dir: string;
}

/**
 * 從 /api/data-export（GET）讀回 dev server 上 data/{appName}/ 目錄的攤平檔案，
 * 整包覆蓋掉目前的 localStorage（wb.dataSources / wb.locales / wb.pages /
 * wb.styleSheets）。不考慮衝突：這是「用檔案取代」，不是合併。
 *
 * appName 對應「App 設定」頁的 App Name 欄位；未提供或空字串時，
 * server 端會退回預設值 "default"（見 data-export-dev-plugin.ts）。
 */
export async function importFlatDataFromServer(appName?: string): Promise<DataImportResult> {
  const search = appName ? `?appName=${encodeURIComponent(appName)}` : "";
  const res = await fetch(`/api/data-export${search}`, { method: "GET" });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : `匯入失敗（HTTP ${res.status}）`;
    throw new Error(message);
  }

  const files: Record<string, string> = data.files ?? {};
  const result = importFlatDataToStorage(files);

  return { dir: data.dir, ...result };
}