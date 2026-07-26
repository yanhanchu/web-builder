// ============================================================
// 上傳目的地：localStorage 持久化（瀏覽器專用）
//
// 型別定義 / 預設值 / 建構函式都在 upload-destinations.types.ts
// （純型別，不含 window，後端 server/*.ts 也會 import 那份）。
// 這個檔案只負責瀏覽器端的 localStorage 讀寫。
//
// 在 App 設定（/admin/settings）維護；資料管理（/admin/data-manager）
// 的「檔案同步狀態」區塊也會讀取這裡的資料，把每個 file DataSource
// 對應到目前已啟用的上傳目的地，顯示同步狀態（先不做實際上傳）。
// ============================================================

export {
  UPLOAD_DESTS_KEY,
  makeLocalDest,
  makeS3Dest,
  DEFAULT_UPLOAD_DESTS,
  type LocalUploadDest,
  type S3UploadDest,
  type UploadDest,
} from "./upload-destinations.types";

import { UPLOAD_DESTS_KEY, DEFAULT_UPLOAD_DESTS } from "./upload-destinations.types";
import type { UploadDest } from "./upload-destinations.types";

// 陣列型資料的持久化讀取（不能用物件展開合併預設值，否則會破壞陣列結構）
export function readPersistentArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writePersistent<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** 讀取目前所有已設定的上傳目的地（含未啟用的） */
export function readUploadDestinations(): UploadDest[] {
  return readPersistentArray(UPLOAD_DESTS_KEY, DEFAULT_UPLOAD_DESTS);
}
