// ============================================================
// 上傳目的地：共用型別 / localStorage key / 讀取工具
//
// 在 App 設定（/admin/settings）維護；資料管理（/admin/data-manager）
// 的「檔案同步狀態」區塊會讀取這裡的資料，把每個 file DataSource
// 對應到目前已啟用的上傳目的地，顯示同步狀態（先不做實際上傳）。
// ============================================================

export const UPLOAD_DESTS_KEY = "wb.settings.uploadDestinations";

export interface LocalUploadDest {
  id: string;
  kind: "local";
  enabled: boolean;
  label: string;
  /** 伺服器上的儲存目錄 */
  storagePath: string;
  /** 存好之後，檔案的對外網址前綴，例如 https://example.com/uploads */
  publicBaseUrl: string;
}

export interface S3UploadDest {
  id: string;
  kind: "s3";
  enabled: boolean;
  label: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 自訂 endpoint：留空即用 AWS 官方端點；填寫可接 MinIO / R2 / B2 等 S3 相容節點 */
  endpoint: string;
  /** path-style（http(s)://endpoint/bucket/key）而非 virtual-hosted-style，許多自架 S3 相容節點需要開啟 */
  forcePathStyle: boolean;
  /** 選填：存好之後，檔案的對外網址前綴（例如接了 CDN 或自訂網域時使用） */
  publicBaseUrl: string;
}

export type UploadDest = LocalUploadDest | S3UploadDest;

export function makeLocalDest(): LocalUploadDest {
  return {
    id: `local-${Date.now()}`,
    kind: "local",
    enabled: true,
    label: "本機儲存",
    storagePath: "/var/www/uploads",
    publicBaseUrl: "",
  };
}

export function makeS3Dest(): S3UploadDest {
  return {
    id: `s3-${Date.now()}`,
    kind: "s3",
    enabled: false,
    label: "新 S3 節點",
    bucket: "",
    region: "auto",
    accessKeyId: "",
    secretAccessKey: "",
    endpoint: "",
    forcePathStyle: false,
    publicBaseUrl: "",
  };
}

export const DEFAULT_UPLOAD_DESTS: UploadDest[] = [makeLocalDest()];

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
