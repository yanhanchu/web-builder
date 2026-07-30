// ============================================================
// copy-dir —— 純 Node fs 的「整個目錄覆寫複製」工具，不依賴 Vite/瀏覽器
// 環境，可以同時被：
//   - server/data-export-dev-plugin.ts（dev server 的 /api/data-export，
//     負責 apps/web-builder/public/{appName}/static/ <-> data/{appName}/files/
//     互相覆寫同步）
//   - scripts/site-generator/generate-astro.ts、generate-split-jsx.ts
//     （站台產生器，負責 data/{appName}/files/ -> 輸出目錄旁的
//     public/static/ 單向覆寫複製）
// 共用。
//
// 語意是「覆寫複製」，不是「鏡像同步」：只會新增/覆蓋來源目錄裡存在的
// 檔案，不會刪除目的地既有、但來源沒有的檔案（呼叫端如果需要，之後
// 可以自行加一個「先清空目的地」的選項，目前的三個呼叫情境都不需要）。
// ============================================================

import { promises as fs } from "node:fs";

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/**
 * 把 `srcDir` 底下所有檔案（含巢狀子目錄）覆寫複製到 `destDir`，
 * 目的地目錄需要的中間路徑會自動建立（`fs.mkdir(..., { recursive: true })`）。
 *
 * `srcDir` 不存在時視為「沒有東西可複製」，直接回傳、不當成錯誤 ——
 * 呼叫端通常是「這個 app 目前還沒有任何上傳檔案 / 還沒有寫過
 * public/static」的正常情境。
 *
 * 底層用 `fs.cp`（Node >=16.7 起提供，這個 repo 要求 Node >=20）的
 * `recursive + force` 選項一次完成整棵目錄樹的複製與覆寫，不用自己手動
 * 遞迴 readdir/mkdir/writeFile。
 */
export async function copyDirRecursive(srcDir: string, destDir: string): Promise<void> {
  try {
    await fs.cp(srcDir, destDir, { recursive: true, force: true });
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return;
    throw err;
  }
}