// ============================================================
// 檔案 × 上傳目的地 同步狀態
//
// 目的：在 /admin/data-manager 的「檔案同步狀態」區塊，針對每一筆
// file DataSource，同時記錄它與目前每個「已啟用」上傳目的地
// （/admin/settings 設定）之間的同步狀態。
//
// 實際同步流程：呼叫 upload-client.ts 的 syncFileToDestination()，
// 整個讀取＋寫入流程都在前端完成（讀 OPFS 或 fetch 來源網址，寫回
// OPFS 或用 presigned PUT 直接上傳）。這裡只負責記錄「結果」——
// 同步中 / 已同步 / 失敗，以及成功時該檔案在這個目的地實際落地的
// url，方便之後追蹤同一筆檔案在不同儲存後端各自對應到哪個網址。
// ============================================================

export type SyncState = "unsynced" | "syncing" | "synced" | "failed";

export interface FileSyncRecord {
  /** file DataSource 的 id */
  fileId: string;
  /** 上傳目的地的 id（對應 UploadDest.id） */
  destId: string;
  state: SyncState;
  /** 最近一次狀態更新時間（ISO 字串），方便顯示「上次同步時間」 */
  updatedAt: string;
  /** 失敗時的錯誤訊息 */
  errorMessage?: string;
  /** 同步成功後，這個檔案在該目的地實際落地的 url */
  syncedUrl?: string;
}

export const FILE_SYNC_KEY = "wb.settings.fileSyncStatus";

/** key：`${fileId}::${destId}` -> record，方便 O(1) 查找 */
export type FileSyncMap = Record<string, FileSyncRecord>;

export function syncKey(fileId: string, destId: string): string {
  return `${fileId}::${destId}`;
}

export function readFileSyncMap(): FileSyncMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FILE_SYNC_KEY);
    return raw ? (JSON.parse(raw) as FileSyncMap) : {};
  } catch {
    return {};
  }
}

export function writeFileSyncMap(map: FileSyncMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILE_SYNC_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export const SYNC_STATE_LABELS: Record<SyncState, string> = {
  unsynced: "尚未同步",
  syncing: "同步中…",
  synced: "已同步",
  failed: "同步失敗",
};