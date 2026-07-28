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
  /** 實際寫入的資料夾名稱，例如 "data-07-28"（相對於 monorepo 根目錄）。 */
  dir: string;
  /** 實際寫入的相對檔案路徑清單，例如 ["sources/route.json", "pages.json", ...]。 */
  files: string[];
}

/**
 * 把 buildFlatDataFiles() 的結果 POST 給 /api/data-export，
 * 由 dev server 寫到 data-{mm-dd}/ 目錄。
 */
export async function exportFlatDataToServer(files: ExportedFiles): Promise<DataExportResult> {
  const payload: Record<string, string> = {};
  for (const [relativePath, content] of files) {
    payload[relativePath] = content;
  }

  const res = await fetch("/api/data-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: payload }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : `匯出失敗（HTTP ${res.status}）`;
    throw new Error(message);
  }

  return { dir: data.dir, files: data.files };
}