// ============================================================
// 本機上傳（LocalUploadDest）處理邏輯
//
// 檔案實際落地路徑：apps/web-builder/public/<appName>/static/<解析後的
// storagePath 子路徑>/<storedFileName>
//   - 基準目錄依 appName 動態決定（見 getStaticDir()），不再是單一個固定
//     的 public/static/：每個 app（namespace）各自有自己的
//     public/<appName>/static/，彼此互不干擾、也不會共用同一個目錄。
//   - storagePath 一律視為「相對於 public/<appName>/static/」的子路徑，
//     不再支援絕對路徑：即使填了看起來像絕對路徑的值（例如
//     "/var/www/uploads"、Windows 的 "C:\uploads"），也會先去掉開頭的
//     路徑分隔符／磁碟機代號，當成一般相對路徑，一律錨定在
//     public/<appName>/static/ 底下解析，不會真的寫到系統其他地方。
//   - 沒有填（空字串）就直接用 public/<appName>/static/ 這個目錄本身，
//     不再多一層子目錄。
//   - 不管有沒有填子路徑，都固定落在 apps/web-builder/public/<appName>/
//     static/ 底下的好處：Vite dev server 原生就會把 public/** 內容服務
//     到網站根目錄，上傳完不需要额外的靜態檔 API 就能直接用瀏覽器打開；
//     同時這個目錄也是「寫入資料到本地 / 從本地讀取資料」（見
//     app-settings.tsx 的 handleWriteToServer / handleReadFromServer）
//     跟 data/{appName}/files/ 互相覆寫同步的來源／目的地（見
//     data-export-dev-plugin.ts），固定路徑才能讓兩邊對得上。
//   - appName 這個 namespace 現在直接體現在目錄路徑本身
//     （public/<appName>/static/），不再是 static/ 底下的子目錄，所以
//     實際寫檔時不會再額外多加一層 <appName> 子目錄。
//   - <storedFileName>  由 makeStoredFileName() 產生，保留原始副檔名
//
// 目錄一律用 fs.mkdir(..., { recursive: true }) 自動建立；若因為路徑本身
// 沒有寫入權限而失敗，會把原始 ENOENT / EACCES 錯誤訊息包裝成更好懂的提示
// （固定錨定在 public/<appName>/static/ 底下之後，這種情況理論上只會是
// 專案本身檔案權限問題，不會再是「填了系統保留路徑」那種情境，但仍保留
// 錯誤處理避免例外情況把整個請求炸掉）。
//
// 前端呼叫流程（見 src/lib/upload-client.ts 的 uploadFileToLocal()）：
// 檔案一律先存進瀏覽器的 OPFS，再把 OPFS 裡的內容 multipart POST 給
// 這個 server 的 /api/upload/:appName/local，由這裡負責寫進 storagePath。
//
// 原本這裡還有一個 resolveLocalFileForRead()，是給「跨目的地同步」
// （server/file-sync.ts）反查本機檔案磁碟路徑用的；同步流程已整個搬到
// 前端執行（upload-client.ts 的 syncFileToDestination()），該函式與
// file-sync.ts 一併移除，這個檔案現在只負責「寫入」這一半。
// ============================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import type { LocalUploadDest } from "../src/lib/upload-destinations.types";
import { makeStoredFileName } from "./filename";
import { sanitizeAppName } from "./settings-store";

/** apps/web-builder 專案根目錄（this file 位於 apps/web-builder/server/ 底下）。 */
const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

/** apps/web-builder/public 目錄：Vite dev server 原生會把這裡的內容服務到網站根目錄。 */
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");

/**
 * apps/web-builder/public/<appName>/static 目錄：這個 app（namespace）
 * 本機上傳目的地固定的基準目錄，也是「寫入資料到本地 / 從本地讀取資料」
 * 跟 data/{appName}/files/ 互相覆寫同步的那一半（另一半在
 * data-export-dev-plugin.ts）。
 *
 * appName 一律先經過 sanitizeAppName() 清理，避免被拿來做路徑穿越。
 */
export function getStaticDir(appName: string): string {
  return path.join(PUBLIC_DIR, sanitizeAppName(appName), "static");
}

/**
 * 去掉字串開頭「看起來像絕對路徑」的部分（POSIX 的開頭 "/"、"\"，或
 * Windows 磁碟機代號如 "C:\"、"C:/"），讓後續一律當成相對路徑處理。
 * 只處理開頭，路徑中間或結尾的斜線不受影響。
 */
function stripLeadingAbsoluteMarkers(input: string): string {
  return input.replace(/^[a-zA-Z]:[\\/]+/, "").replace(/^[\\/]+/, "");
}

export interface LocalUploadResult {
  fileName: string;
  storedPath: string;
  url: string;
  size: number;
  mimeType?: string;
}

/**
 * 把設定裡的 storagePath 解析成實際可用的絕對路徑，錨定在這個 app 專屬
 * 的 static 目錄（getStaticDir(appName)）底下。
 *
 * 不再支援絕對路徑：不管填的是空字串、一般相對路徑，還是看起來像絕對
 * 路徑的字串，一律先去掉開頭的路徑分隔符／磁碟機代號
 * （stripLeadingAbsoluteMarkers），當成「相對於 public/<appName>/static/」
 * 的子路徑解析；額外用 `path.relative()` 確認解析結果沒有透過 ".." 逃出
 * 該目錄，逃出的話直接退回該目錄本身，不寫到 public/<appName>/static/
 * 之外的地方。空字串（或只有空白）直接回傳該目錄本身，不多一層子目錄。
 */
export function resolveStoragePath(storagePath: string, appName: string): string {
  const staticDir = getStaticDir(appName);
  const trimmed = (storagePath ?? "").trim();
  if (!trimmed) return staticDir;

  const relativePart = stripLeadingAbsoluteMarkers(trimmed);
  if (!relativePart) return staticDir;

  const resolved = path.resolve(staticDir, relativePart);
  const rel = path.relative(staticDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return staticDir;
  }
  return resolved;
}

/**
 * 若解析後的路徑落在 apps/web-builder/public/ 底下，回傳它相對於 public/
 * 的網址（Vite 會直接把 public/** 服務到網站根目錄，所以這條網址不需要
 * 經過任何 API，開發、build 之後都能直接用）；否則回傳 null，呼叫端要
 * 退回用 API 路由代為讀取。
 */
function publicRelativeUrl(absoluteFilePath: string): string | null {
  const rel = path.relative(PUBLIC_DIR, absoluteFilePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `/${rel.split(path.sep).join("/")}`;
}

export async function saveLocalUpload(params: {
  dest: LocalUploadDest;
  appName: string;
  originalName: string;
  data: Buffer;
  mimeType?: string;
}): Promise<LocalUploadResult> {
  const { dest, appName, originalName, data, mimeType } = params;

  // storagePath 現在允許空字串（代表直接用 public/<appName>/static/ 本身，
  // 不需要額外設定子目錄），不再是必填欄位，見 resolveStoragePath() 說明。
  // appName 這個 namespace 已經體現在 resolveStoragePath() 回傳的目錄路徑
  // 本身（public/<appName>/static/），這裡不再額外多加一層 <appName>
  // 子目錄。
  const targetDir = resolveStoragePath(dest.storagePath ?? "", appName);

  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(
      `無法建立上傳目錄「${targetDir}」（${code ?? "unknown error"}）。` +
        `儲存目錄固定錨定在 apps/web-builder/public/${sanitizeAppName(appName)}/static/ 底下，` +
        `請確認目前執行 dev server 的使用者對這個目錄有寫入權限。`,
    );
  }

  const storedFileName = makeStoredFileName(originalName);
  const fullPath = path.join(targetDir, storedFileName);
  await fs.writeFile(fullPath, data);

  const publicBase = dest.publicBaseUrl?.trim();
  const url =
    publicBase
      ? `${publicBase.replace(/\/+$/, "")}/${storedFileName}`
      : (publicRelativeUrl(fullPath) ??
        // 沒設定對外網址前綴、也不在 public/ 底下時，退回這個 dev server
        // 本身的靜態存取路徑
        `/api/upload/${sanitizeAppName(appName)}/local/file/${storedFileName}`);

  return {
    fileName: storedFileName,
    storedPath: fullPath,
    url,
    size: data.length,
    mimeType,
  };
}
