// ============================================================
// download-flat-data-zip —— 把 buildFlatDataFiles() 組出的檔案內容
// 打包成一個 zip，觸發瀏覽器下載。
//
// 資料只存在瀏覽器 localStorage，這裡沒有 Node 端腳本可以直接寫檔到
// apps/site-generator 讀取的 data/ 目錄 —— 使用者下載 zip 後，
// 自行解壓縮覆蓋專案裡的 data/ 目錄即可（zip 內的相對路徑跟
// load-static-data.ts 預期的 data/ 目錄結構一致，例如
// "sources/route.json" 解壓後就是 "data/sources/route.json"）。
// ============================================================

import JSZip from "jszip";
import type { ExportedFiles } from "./export-flat-data";

/** 把 buildFlatDataFiles() 的結果打包成 zip 並觸發瀏覽器下載。 */
export async function downloadFlatDataZip(
  files: ExportedFiles,
  zipFileName = "data.zip",
): Promise<void> {
  const zip = new JSZip();
  for (const [relativePath, content] of files) {
    zip.file(relativePath, content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = zipFileName;
    // 一定要先接到 DOM 上再 click()：部分瀏覽器（尤其 Firefox）對沒有
    // 掛進文件樹的 <a> 觸發 click() 會被忽略，不會真的開始下載。
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    // 用完立刻釋放，避免每次匯出都在記憶體裡累積一份 blob URL。
    URL.revokeObjectURL(url);
  }
}