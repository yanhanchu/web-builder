// ============================================================
// export-flat-data-to-server —— 把 buildFlatDataFiles() 組出的檔案內容，
// 呼叫 vite dev server 的 /api/data-export API，直接寫到專案的
// data-{mm-dd}/ 目錄（未打包，見 server/data-export-dev-plugin.ts）。
//
// 跟 download-flat-data-zip.ts 是同一個「輸出攤平檔案」用途的另一種
// 落地方式：這裡不下載 zip、不需要使用者手動解壓縮覆蓋，而是由本機
// 的 dev server 直接寫進檔案系統。只能在有 vite dev server 在跑、
// 且 /api 路由通的環境下使用（純靜態 build 之後的產物不會有這個 API）。
// ============================================================

import type { ExportedFiles } from "./export-flat-data";

export interface DataExportResult {
  /** 實際寫入的資料夾名稱，例如 "data/my-app"（相對於 monorepo 根目錄）。 */
  dir: string;
  /** 實際寫入的相對檔案路徑清單，例如 ["sources/route.json", "pages.json", ...]。 */
  files: string[];
}

/**
 * 把 buildFlatDataFiles() 的結果 POST 給 /api/data-export，
 * 由 dev server 寫到 /data/{appName}/ 目錄。
 *
 * appName 對應「App 設定」頁新增的 App Name 欄位；未提供或空字串時，
 * server 端會退回預設值 "default"（見 data-export-dev-plugin.ts）。
 */
export async function exportFlatDataToServer(
  files: ExportedFiles,
  appName?: string,
): Promise<DataExportResult> {
  const payload: Record<string, string> = {};
  for (const [relativePath, content] of files) {
    payload[relativePath] = content;
  }

  const res = await fetch("/api/data-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: payload, appName }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : `匯出失敗（HTTP ${res.status}）`;
    throw new Error(message);
  }

  return { dir: data.dir, files: data.files };
}