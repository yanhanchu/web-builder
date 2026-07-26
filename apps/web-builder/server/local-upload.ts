// ============================================================
// 本機上傳（LocalUploadDest）處理邏輯
//
// 檔案實際落地路徑：<storagePath>/<appName>/<storedFileName>
//   - <storagePath> 來自該 app 已儲存設定裡，指定的 LocalUploadDest.storagePath
//   - <appName>     namespace 區隔（預設 "default"）
//   - <storedFileName> 由 makeStoredFileName() 產生，保留原始副檔名
// ============================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import type { LocalUploadDest } from "../src/lib/upload-destinations.types";
import { makeStoredFileName } from "./filename";
import { sanitizeAppName } from "./settings-store";

export interface LocalUploadResult {
  fileName: string;
  storedPath: string;
  url: string;
  size: number;
  mimeType?: string;
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

  const appDir = path.join(dest.storagePath, sanitizeAppName(appName));
  await fs.mkdir(appDir, { recursive: true });

  const storedFileName = makeStoredFileName(originalName);
  const fullPath = path.join(appDir, storedFileName);
  await fs.writeFile(fullPath, data);

  const publicBase = dest.publicBaseUrl?.trim();
  const url = publicBase
    ? `${publicBase.replace(/\/+$/, "")}/${sanitizeAppName(appName)}/${storedFileName}`
    : // 沒設定對外網址前綴時，退回這個 dev server 本身的靜態存取路徑
      `/api/upload/${sanitizeAppName(appName)}/local/file/${storedFileName}`;

  return {
    fileName: storedFileName,
    storedPath: fullPath,
    url,
    size: data.length,
    mimeType,
  };
}
