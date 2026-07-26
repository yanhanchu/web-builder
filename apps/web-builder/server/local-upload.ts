// ============================================================
// 本機上傳（LocalUploadDest）處理邏輯
//
// 檔案實際落地路徑：<解析後的 storagePath>/<appName>/<storedFileName>
//   - storagePath 支援兩種寫法：
//       - 絕對路徑（例如 /var/www/uploads）：正式環境常見寫法，原封不動使用，
//         要求該路徑本身可寫入，寫入失敗會直接把系統錯誤往上拋。
//       - 相對路徑（例如 public/uploads，也是新增本機目的地的預設值）：
//         一律視為「相對於 apps/web-builder 這個專案根目錄」，不是相對於
//         啟動 dev server 當下的工作目錄，避免從哪裡下 `pnpm dev` 而跑掉。
//         寫在 public/ 底下的好處是 Vite dev server 原生就會把 public/**
//         內容服務到網站根目錄，上傳完不需要额外的靜態檔 API 就能直接用
//         瀏覽器打開。
//   - <appName>         namespace 區隔（預設 "default"）
//   - <storedFileName>  由 makeStoredFileName() 產生，保留原始副檔名
//
// 目錄一律用 fs.mkdir(..., { recursive: true }) 自動建立；若因為路徑本身
// 沒有寫入權限（例如硬填一個系統保留路徑 /uploads）而失敗，會把原始
// ENOENT / EACCES 錯誤訊息包裝成更好懂的提示。
// ============================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import type { LocalUploadDest } from "../src/lib/upload-destinations.types";
import { makeStoredFileName } from "./filename";
import { sanitizeAppName } from "./settings-store";

/** apps/web-builder 專案根目錄（this file 位於 apps/web-builder/server/ 底下）。 */
const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

/** apps/web-builder/public 目錄：Vite dev server 原生會把這裡的內容服務到網站根目錄。 */
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");

export interface LocalUploadResult {
  fileName: string;
  storedPath: string;
  url: string;
  size: number;
  mimeType?: string;
}

/**
 * 把設定裡的 storagePath 解析成實際可用的絕對路徑。
 * 絕對路徑（以 "/" 或磁碟機代號開頭）原樣使用；相對路徑一律相對於
 * apps/web-builder 專案根目錄解析，而不是 process.cwd()。
 */
export function resolveStoragePath(storagePath: string): string {
  return path.isAbsolute(storagePath)
    ? storagePath
    : path.resolve(PROJECT_ROOT, storagePath);
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

  if (!dest.storagePath || !dest.storagePath.trim()) {
    throw new Error("此本機上傳目的地尚未設定「儲存目錄（storagePath）」");
  }

  const resolvedRoot = resolveStoragePath(dest.storagePath);
  const appDir = path.join(resolvedRoot, sanitizeAppName(appName));

  try {
    await fs.mkdir(appDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(
      `無法建立上傳目錄「${appDir}」（${code ?? "unknown error"}）。` +
        `若 storagePath 設定的是系統保留路徑（例如 /uploads），請改用相對路徑` +
        `（例如 public/uploads，會自動對應到 apps/web-builder/public/uploads` +
        `並且能直接被瀏覽器存取），或改成目前使用者確實有寫入權限的絕對路徑。`,
    );
  }

  const storedFileName = makeStoredFileName(originalName);
  const fullPath = path.join(appDir, storedFileName);
  await fs.writeFile(fullPath, data);

  const publicBase = dest.publicBaseUrl?.trim();
  const url =
    publicBase
      ? `${publicBase.replace(/\/+$/, "")}/${sanitizeAppName(appName)}/${storedFileName}`
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

/**
 * 反向解析：給一個先前由 saveLocalUpload() 產生的 url，判斷它是否指向
 * 這個本機目的地（同一個 appName 底下），是的話回傳磁碟上的絕對路徑。
 *
 * saveLocalUpload() 依設定不同會產生三種 url 形式，這裡對稱地反推：
 *   1. 有 publicBaseUrl                      -> "<publicBaseUrl>/<appName>/<fileName>"
 *   2. 落在 public/ 底下（無 publicBaseUrl）   -> "/<相對 public 的路徑>"
 *   3. 其餘情況（開發用途 fallback）           -> "/api/upload/<appName>/local/file/<fileName>"
 *
 * 用途：「跨目的地同步」時，若同步來源本身就是本機檔案，直接讀磁碟即可，
 * 不需要多繞一層 HTTP 請求。
 */
export function resolveLocalFileForRead(
  dest: LocalUploadDest,
  appName: string,
  url: string,
): string | null {
  const app = sanitizeAppName(appName);

  const publicBase = dest.publicBaseUrl?.trim();
  if (publicBase) {
    const prefix = `${publicBase.replace(/\/+$/, "")}/${app}/`;
    if (url.startsWith(prefix)) {
      const fileName = decodeURIComponent(url.slice(prefix.length));
      if (fileName) {
        return path.join(resolveStoragePath(dest.storagePath), app, fileName);
      }
    }
  }

  const apiPrefix = `/api/upload/${app}/local/file/`;
  if (url.startsWith(apiPrefix)) {
    const fileName = decodeURIComponent(url.slice(apiPrefix.length));
    if (fileName) {
      return path.join(resolveStoragePath(dest.storagePath), app, fileName);
    }
  }

  // 落在 public/ 底下、以相對網址提供的情況：url 形如 "/uploads/<app>/<fileName>"，
  // 對應到 PUBLIC_DIR + url。只有當它確實落在這個 dest 的 storagePath 底下才算相符，
  // 避免誤把其他本機目的地、甚至其他非上傳的 public 靜態檔當成同步來源。
  if (url.startsWith("/")) {
    const candidate = path.join(PUBLIC_DIR, url);
    const resolvedRoot = path.join(resolveStoragePath(dest.storagePath), app);
    const rel = path.relative(resolvedRoot, candidate);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
      return candidate;
    }
  }

  return null;
}